import type { LandmarkDetector, PoseFrame } from './motion';
import { loadDetector } from './providers.ts';

/** One inference at a time; the epoch belongs to the captured image, not the result. */
export function camera(
	video: HTMLVideoElement,
	model: 'mediapipe' | 'movenet',
	base: string,
	active: () => boolean,
	epoch: () => number,
	receive: (frame: PoseFrame, epoch: number) => void,
	onerror: (kind: 'camera' | 'model') => void,
	deviceId = ''
) {
	let closed = false,
		lastTime = -1,
		busy = false;
	const videoCallbacks =
		typeof video.requestVideoFrameCallback === 'function' &&
		typeof video.cancelVideoFrameCallback === 'function';
	let pending: number | undefined;
	let stream: MediaStream | undefined, detector: LandmarkDetector | undefined;
	function close() {
		closed = true;
		if (pending !== undefined) {
			if (videoCallbacks) video.cancelVideoFrameCallback(pending);
			else cancelAnimationFrame(pending);
			pending = undefined;
		}
		stream?.getTracks().forEach((t) => t.stop());
		if (video.srcObject === stream) video.srcObject = null;
		stream = undefined;
		if (!busy && detector) {
			void detector.dispose();
			detector = undefined;
		}
	}
	function schedule() {
		pending = videoCallbacks
			? video.requestVideoFrameCallback(
					(now, meta) => void loop(meta.captureTime ?? meta.presentationTime ?? now)
				)
			: requestAnimationFrame(() => void loop(performance.now()));
	}
	async function loop(captureMs: number) {
		pending = undefined;
		if (closed) return;
		const fresh = () => performance.now() - captureMs < 650;
		if (
			active() &&
			video.readyState >= 2 &&
			(videoCallbacks || lastTime !== video.currentTime) &&
			detector &&
			fresh()
		) {
			lastTime = video.currentTime;
			const token = epoch();
			const relevant = () => !closed && active() && token === epoch() && fresh();
			let bitmap: ImageBitmap | undefined;
			busy = true;
			try {
				bitmap = await createImageBitmap(video);
				if (relevant()) {
					const frame = await detector.estimate(bitmap, captureMs / 1000);
					if (relevant()) receive(frame, token);
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
		if (!closed) schedule();
	}
	async function start() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
					width: { ideal: 960 },
					height: { ideal: 720 }
				},
				audio: false
			});
			if (closed) {
				close();
				return false;
			}
			const track = stream.getVideoTracks()[0];
			const capabilities = track?.getCapabilities?.() as
				(MediaTrackCapabilities & { zoom?: { min: number } }) | undefined;
			if (capabilities?.zoom) {
				try {
					await track.applyConstraints({
						advanced: [{ zoom: capabilities.zoom.min } as MediaTrackConstraintSet]
					});
				} catch {
					// Zoom is optional; keep the camera usable if the device rejects it.
				}
			}
			if (closed) {
				close();
				return false;
			}
			video.srcObject = stream;
			await video.play();
			if (closed) return false;
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
			schedule();
			return true;
		} catch {
			if (!closed) onerror('model');
			close();
			return false;
		}
	}
	let started: Promise<boolean> | undefined;
	return { start: () => (closed ? Promise.resolve(false) : (started ??= start())), close };
}
