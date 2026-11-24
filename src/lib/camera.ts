import type { LandmarkDetector, PoseFrame } from './motion';
import { loadDetector } from './providers';

/** One inference at a time; the epoch belongs to the captured image, not the result. */
export function camera(
	video: HTMLVideoElement,
	model: 'mediapipe' | 'movenet',
	base: string,
	active: () => boolean,
	epoch: () => number,
	receive: (frame: PoseFrame, epoch: number) => void,
	onerror: (kind: 'camera' | 'model') => void
) {
	let closed = false,
		raf = 0,
		lastTime = -1,
		busy = false;
	let stream: MediaStream | undefined, detector: LandmarkDetector | undefined;
	function close() {
		closed = true;
		cancelAnimationFrame(raf);
		stream?.getTracks().forEach((t) => t.stop());
		if (video.srcObject === stream) video.srcObject = null;
		if (!busy && detector) {
			void detector.dispose();
			detector = undefined;
		}
	}
	async function loop() {
		if (closed) return;
		if (active() && video.readyState >= 2 && lastTime !== video.currentTime && detector) {
			lastTime = video.currentTime;
			const captured = performance.now() / 1000,
				token = epoch();
			let bitmap: ImageBitmap | undefined;
			busy = true;
			try {
				bitmap = await createImageBitmap(video);
				if (!closed) {
					const frame = await detector.estimate(bitmap, captured);
					if (!closed && active() && performance.now() / 1000 - captured < 0.65)
						receive(frame, token);
				}
			} catch {
				if (!closed) {
					onerror('model');
					close();
				}
			} finally {
				bitmap?.close();
				busy = false;
				if (closed) close();
			}
		}
		if (!closed) raf = requestAnimationFrame(() => void loop());
	}
	async function start() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
				audio: false
			});
			if (closed) {
				close();
				return false;
			}
			video.srcObject = stream;
			await video.play();
		} catch {
			if (!closed) onerror('camera');
			close();
			return false;
		}
		try {
			detector = await loadDetector(model, base);
			if (closed) {
				close();
				return false;
			}
			raf = requestAnimationFrame(() => void loop());
			return true;
		} catch {
			if (!closed) onerror('model');
			close();
			return false;
		}
	}
	return { start, close };
}
