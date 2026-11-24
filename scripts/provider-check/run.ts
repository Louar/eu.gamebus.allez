import { loadDetector } from '../../src/lib/providers';
import { Tracker, type ExerciseId } from '../../src/lib/motion';

async function check(id: 'mediapipe' | 'movenet', exercise: ExerciseId) {
	const video = document.createElement('video');
	video.muted = true;
	video.preload = 'auto';
	await new Promise<void>((resolve, reject) => {
		video.onloadeddata = () => resolve();
		video.onerror = () => reject(new Error('Clip decode failed'));
		video.src = './clip.webm';
	});
	const model = await loadDetector(id, '/allez.gamebus.eu');
	const tracker = new Tracker(exercise);
	const latency: number[] = [];
	let missing = 0,
		lost = 0,
		reps = 0,
		held = 0;
	const phases: Record<string, number> = {};
	try {
		for (let i = 0; i < Math.min(600, Math.floor(video.duration * 10)); i++) {
			const timestamp = i / 10 + 0.01;
			await new Promise<void>((resolve) => {
				video.onseeked = () => resolve();
				video.currentTime = timestamp;
			});
			const frame = await createImageBitmap(video);
			try {
				const start = performance.now();
				const pose = await model.estimate(frame, timestamp);
				latency.push(performance.now() - start);
				if (
					pose.width !== video.videoWidth ||
					pose.height !== video.videoHeight ||
					pose.timestamp !== timestamp ||
					pose.provider !== id
				)
					throw new Error('Frame metadata mismatch');
				if (
					!pose.missing &&
					(!pose.points.left_shoulder ||
						Object.values(pose.points).some((p) => !Number.isFinite(p.x + p.y + p.score)))
				)
					throw new Error('Invalid landmarks');
				const u = tracker.update(pose);
				missing += Number(pose.missing);
				lost += Number(u.status === 'lost');
				reps += Number(u.rep);
				held += u.held;
				phases[u.phase] = (phases[u.phase] || 0) + 1;
			} finally {
				frame.close();
			}
		}
	} finally {
		await model.dispose();
		video.removeAttribute('src');
		video.load();
	}
	if (missing === latency.length) throw new Error(`No poses from ${id}`);
	const coldMs = Math.round(latency.shift()!);
	latency.sort((a, b) => a - b);
	return {
		id,
		frames: latency.length + 1,
		missing,
		trackerLost: lost,
		reps,
		held,
		phases,
		coldMs,
		medianWarmMs: Math.round(latency[Math.floor(latency.length / 2)])
	};
}
Object.assign(window, { check });
