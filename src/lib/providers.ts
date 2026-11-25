import type { LandmarkDetector, PoseFrame } from './motion';

const coco =
	'nose left_eye right_eye left_ear right_ear left_shoulder right_shoulder left_elbow right_elbow left_wrist right_wrist left_hip right_hip left_knee right_knee left_ankle right_ankle'.split(
		' '
	);
const blaze =
	'nose left_eye_inner left_eye left_eye_outer right_eye_inner right_eye right_eye_outer left_ear right_ear mouth_left mouth_right left_shoulder right_shoulder left_elbow right_elbow left_wrist right_wrist left_pinky right_pinky left_index right_index left_thumb right_thumb left_hip right_hip left_knee right_knee left_ankle right_ankle left_heel right_heel left_foot_index right_foot_index'.split(
		' '
	);

export async function loadDetector(
	id: 'mediapipe' | 'movenet',
	base: string
): Promise<LandmarkDetector> {
	const root = new URL(`${base.replace(/\/$/, '')}/models/`, document.baseURI);
	if (root.origin !== location.origin) throw new Error('Models must be served locally');
	if (id === 'mediapipe') {
		const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
		const files = await FilesetResolver.forVisionTasks(`${root}mediapipe/wasm`);
		const model = await PoseLandmarker.createFromOptions(files, {
			baseOptions: { modelAssetPath: `${root}mediapipe/full.task`, delegate: 'CPU' },
			runningMode: 'VIDEO',
			numPoses: 1,
			outputSegmentationMasks: false
		});
		return {
			estimate(frame, timestamp) {
				const { width, height } = frame;
				const landmarks = model.detectForVideo(frame, timestamp * 1000).landmarks[0];
				const points: PoseFrame['points'] = {};
				landmarks?.forEach((p, i) => {
					points[blaze[i]] = {
						x: p.x * width,
						y: p.y * height,
						z: p.z * width,
						score: p.visibility
					};
				});
				return Promise.resolve({
					timestamp,
					width,
					height,
					provider: id,
					points,
					missing: !landmarks?.length
				});
			},
			dispose() {
				model.close();
				return Promise.resolve();
			}
		};
	}
	if (id !== 'movenet') throw new Error('Unknown landmark model');
	const tf = await import('./movenet-runtime');
	await tf.ready();
	const size = 256;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
	if (!ctx) throw new Error('Canvas unavailable');
	const model = await tf.loadGraphModel(`${root}movenet/model.json`);
	return {
		async estimate(frame, timestamp) {
			const { width, height } = frame;
			const scale = size / Math.max(width, height);
			const dx = (size - width * scale) / 2,
				dy = (size - height * scale) / 2;
			ctx.fillStyle = 'black';
			ctx.fillRect(0, 0, size, size);
			ctx.drawImage(frame, dx, dy, width * scale, height * scale);
			const output = tf.tidy(
				() =>
					model.execute(
						tf.expandDims(tf.browser.fromPixels(canvas), 0)
					) as import('./movenet-runtime').Tensor
			);
			try {
				const values = await output.data();
				const points: PoseFrame['points'] = {};
				let confident = 0;
				coco.forEach((name, i) => {
					const score = values[3 * i + 2];
					if (score >= 0.3) confident++;
					points[name] = {
						x: (values[3 * i + 1] * size - dx) / scale,
						y: (values[3 * i] * size - dy) / scale,
						score
					};
				});
				return { timestamp, width, height, provider: id, points, missing: confident < 4 };
			} finally {
				output.dispose();
			}
		},
		dispose() {
			model.dispose();
			canvas.width = canvas.height = 0;
			return Promise.resolve();
		}
	};
}
