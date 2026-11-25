/** Source pixels: origin top left, +x right, +y down, square pixels. Names
 * refer to the subject's anatomy, never the mirrored preview. Optional z is
 * provider-specific (MediaPipe: hip-relative depth in image-width pixels).
 * Times are monotonic seconds. Detector confidence is not calibrated across models. */
export interface Keypoint {
	x: number;
	y: number;
	score: number;
	z?: number;
}
export interface PoseFrame {
	timestamp: number;
	width: number;
	height: number;
	provider: string;
	points: Record<string, Keypoint>;
	missing: boolean;
}
export interface LandmarkDetector {
	estimate(frame: ImageBitmap, timestamp: number): Promise<PoseFrame>;
	dispose(): Promise<void>;
}
export const exercises = [
	'push-up',
	'squat',
	'jumping-jack',
	'front-jack',
	'sit-up',
	'squat-hold',
	'burpee',
	'plank'
] as const;
export type ExerciseId = (typeof exercises)[number];
export interface TrackingUpdate {
	phase: string;
	status: 'tracking' | 'waiting' | 'lost';
	rep: boolean;
	/** Increment since previous valid observation, not a cumulative counter. */
	held: number;
	continuous: number;
}
export interface ExerciseTracker {
	/** Mean form score (0-100) since reset, or null until a rep or hold interval is earned. */
	readonly roundQuality: number | null;
	/** Discard in-flight movement or hold continuity without starting a new round. */
	breakContinuity(): void;
	reset(id: ExerciseId): void;
	update(frame: PoseFrame): TrackingUpdate;
}

const sides = ['left', 'right'] as const;
const joints = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;
const legAndTorsoJoints = joints.filter((j) => j !== 'elbow' && j !== 'wrist');
export const bones: [string, string][] = [
	['left_shoulder', 'right_shoulder'],
	['left_hip', 'right_hip']
];
for (const s of sides)
	for (const [a, b] of [
		[0, 1],
		[1, 2],
		[0, 3],
		[3, 4],
		[4, 5]
	])
		bones.push([`${s}_${joints[a]}`, `${s}_${joints[b]}`]);

const cycles = {
	'push-up': ['support', 'lowered', 'support'],
	squat: ['standing', 'lowered', 'standing'],
	'jumping-jack': ['closed', 'open', 'closed'],
	'front-jack': ['closed', 'forward', 'closed'],
	'sit-up': ['lying', 'seated', 'lying'],
	'squat-hold': ['lowered'],
	plank: ['plank'],
	burpee: ['standing', 'support', 'lowered', 'support', 'tuck', 'jump', 'standing']
} as const;
type Phase = (typeof cycles)[ExerciseId][number] | 'waiting' | 'lost';
const dist = (a: Keypoint, b: Keypoint) => Math.hypot(a.x - b.x, a.y - b.y);
function angle(a: Keypoint, b: Keypoint, c: Keypoint) {
	const cos = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (dist(a, b) * dist(c, b));
	return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

function trackedSide(id: ExerciseId, f: PoseFrame) {
	if (f.missing || !(f.width > 0 && f.height > 0)) return;
	const p = f.points;
	const usable = (q?: Keypoint) =>
		q &&
		Number.isFinite(q.x) &&
		Number.isFinite(q.y) &&
		Number.isFinite(q.score) &&
		q.score >= 0.25;
	const jack = id === 'front-jack' || id === 'jumping-jack';
	const needsArms = jack || id === 'push-up' || id === 'burpee' || id === 'plank';
	const needed = needsArms ? joints : legAndTorsoJoints;
	const visible = sides.filter((s) => needed.every((j) => usable(p[`${s}_${j}`])));
	if (!visible.length || (jack && visible.length !== 2)) return;
	const quality = (s: string) => Math.min(...needed.map((j) => p[`${s}_${j}`].score));
	return visible.length === 2 && quality('right') > quality('left') ? 'right' : visible[0];
}

/** Single-frame evidence, exposed separately for scoring sparse archive stills. */
export function posture(id: ExerciseId, f: PoseFrame, ground?: number): Phase {
	return classify(id, f, ground, trackedSide(id, f));
}

function classify(
	id: ExerciseId,
	f: PoseFrame,
	ground: number | undefined,
	side: ReturnType<typeof trackedSide>
): Phase {
	if (!side) return 'lost';
	const p = f.points;
	const [s, e, w, h, k, a] = joints.map((j) => p[`${side}_${j}`]);
	const scale = dist(s, h);
	if (scale < 2) return 'lost';
	const knee = angle(h, k, a);
	const upright = (h.y - s.y) / scale > 0.72,
		floor = Math.abs(h.y - s.y) / scale < 0.63;
	const stand = upright && knee > 153 && a.y - h.y > scale * 0.66;
	const squat = h.y - s.y > scale * 0.45 && knee < 132 && a.y > h.y + scale * 0.17;
	if (id === 'front-jack' || id === 'jumping-jack') {
		const l = p.left_shoulder,
			r = p.right_shoulder;
		const feet = Math.abs(p.left_ankle.x - p.right_ankle.x) / scale;
		const breadth = Math.abs(l.x - r.x) / scale;
		const both = (predicate: (arm: Keypoint, shoulder: Keypoint) => boolean) =>
			sides.every((v) => predicate(p[`${v}_wrist`], p[`${v}_shoulder`]));
		if (!upright || knee < 135) return 'waiting';
		if (feet < Math.max(0.52, breadth * 1.15) && both((arm, sh) => arm.y > sh.y + 0.62 * scale))
			return 'closed';
		if (feet > Math.max(0.55, breadth * 1.35)) {
			if (id === 'jumping-jack' && both((arm, sh) => arm.y < sh.y - 0.46 * scale)) return 'open';
			if (id === 'front-jack' && both((arm, sh) => Math.abs(arm.y - sh.y) < 0.3 * scale)) {
				const dx = sides.map((v) => (p[`${v}_wrist`].x - p[`${v}_shoulder`].x) / scale);
				// Oblique reaches project to the same side; head-on reaches foreshorten both arms.
				if (dx[0] * dx[1] > 0 && dx.every((v) => Math.abs(v) > 0.2)) return 'forward';
				if (
					breadth > 0.35 &&
					dx.every((v) => Math.abs(v) < 0.35) &&
					sides.every((v) => dist(p[`${v}_elbow`], p[`${v}_shoulder`]) < scale * 0.4)
				)
					return 'forward';
			}
		}
		return 'waiting';
	}
	if (id === 'squat' || id === 'squat-hold')
		return squat ? 'lowered' : stand && id === 'squat' ? 'standing' : 'waiting';
	if (id === 'sit-up') {
		// A seated hip stays near ankle height, with either bent or extended legs.
		if (Math.abs(h.y - a.y) < scale * 0.65 && Math.abs(a.x - h.x) > scale * 0.35) {
			if (floor && (s.x - h.x) * (a.x - h.x) < 0) return 'lying';
			if (upright) return 'seated';
		}
		return 'waiting';
	}
	if (id === 'burpee') {
		if (stand && ground !== undefined && ground - a.y > 0.18 * scale) return 'jump';
		if (stand) return 'standing';
		if (squat) return 'tuck';
	}
	const threshold = id === 'plank' ? 145 : 135;
	if (floor && knee > threshold && angle(s, h, a) > threshold) {
		const elbow = angle(s, e, w);
		if (id === 'plank')
			return elbow > 53 &&
				elbow < 128 &&
				e.y > s.y + 0.18 * scale &&
				Math.abs(w.y - e.y) < 0.22 * scale &&
				Math.abs(e.y - a.y) < 0.65 * scale
				? 'plank'
				: 'waiting';
		if (w.y > s.y + 0.14 * scale && Math.abs(w.y - a.y) < 0.85 * scale) {
			if (elbow > 149) return 'support';
			if (elbow < 123 && w.y > e.y + 0.19 * scale) return 'lowered';
		}
	}
	return 'waiting';
}

// Projected range-of-motion heuristics, not a clinical assessment. Saturate at the
// target so deeper bends and higher jumps are not rewarded without limit.
function phaseQuality(
	id: ExerciseId,
	phase: Phase,
	f: PoseFrame,
	side: (typeof sides)[number],
	ground?: number
) {
	const p = f.points;
	const [s, e, w, h, k, a] = joints.map((j) => p[`${side}_${j}`]);
	const scale = dist(s, h);
	const ramp = (value: number, edge: number, target: number) =>
		100 * Math.max(0, Math.min(1, (value - edge) / (target - edge)));
	switch (phase) {
		case 'standing':
			return ramp(angle(h, k, a), 153, 175);
		case 'tuck':
		case 'lowered':
			return phase === 'tuck' || id.startsWith('squat')
				? ramp(angle(h, k, a), 132, 90)
				: ramp(angle(s, e, w), 123, 90);
		case 'support':
			return ramp(angle(s, e, w), 149, 175);
		case 'plank':
			return Math.min(ramp(angle(s, h, a), 145, 175), ramp(angle(h, k, a), 145, 175));
		case 'jump':
			return ramp(((ground ?? a.y) - a.y) / scale, 0.18, 0.35);
		case 'lying':
			return ramp(Math.abs(h.y - s.y) / scale, 0.63, 0.1);
		case 'seated':
			return ramp((h.y - s.y) / scale, 0.72, 0.95);
		case 'open':
		case 'forward':
			return ramp(Math.abs(p.left_ankle.x - p.right_ankle.x) / scale, 0.55, 2);
		default:
			return 0;
	}
}

export class Tracker implements ExerciseTracker {
	private id: ExerciseId;
	private index = 0;
	private last = NaN;
	private provider = '';
	private candidate: Phase = 'waiting';
	private samples = 0;
	private continuous = 0;
	private ground?: number;
	private lastTuck = -Infinity;
	private phasePeaks: number[] = [];
	private qualitySum = 0;
	private qualityWeight = 0;
	get roundQuality() {
		return this.qualityWeight ? Math.round(this.qualitySum / this.qualityWeight) : null;
	}
	constructor(id: ExerciseId = 'squat') {
		this.id = id;
	}
	reset(id: ExerciseId) {
		this.id = id;
		this.qualitySum = this.qualityWeight = 0;
		this.breakContinuity();
	}
	breakContinuity() {
		this.phasePeaks = [];
		this.index = 0;
		this.last = NaN;
		this.provider = '';
		this.candidate = 'waiting';
		this.samples = 0;
		this.continuous = 0;
		this.ground = undefined;
		this.lastTuck = -Infinity;
	}
	update(f: PoseFrame): TrackingUpdate {
		let dt = f.timestamp - this.last;
		if (!Number.isFinite(f.timestamp) || dt <= 0)
			return {
				phase: 'waiting',
				status: 'waiting',
				held: 0,
				continuous: this.continuous,
				rep: false
			};
		if (f.provider !== this.provider || dt > 0.35) {
			this.breakContinuity();
			dt = 0;
		}
		const side = trackedSide(this.id, f);
		const phase = classify(this.id, f, this.ground, side);
		if (!side || phase === 'lost') {
			this.breakContinuity();
			this.last = f.timestamp;
			return { phase, status: 'lost', rep: false, held: 0, continuous: 0 };
		}
		this.last = f.timestamp;
		this.provider = f.provider;
		this.samples = this.candidate === phase ? this.samples + 1 : 1;
		this.candidate = phase;
		const sequence: readonly string[] = cycles[this.id];
		if (this.id === 'burpee' && sequence[this.index] === 'jump') {
			if (phase === 'tuck') this.lastTuck = f.timestamp;
			if (f.timestamp - this.lastTuck > 0.75) {
				this.index = 1;
				this.phasePeaks = [];
			}
		}
		let rep = false,
			held = 0;
		if (sequence.length === 1) {
			// One ambiguous posture freezes the streak; both adjacent intervals
			// are excluded. A second mismatch or any missing observation breaks it.
			if (phase === sequence[0] && this.samples >= 2) {
				held = dt;
				this.continuous += dt;
				this.qualitySum += dt * phaseQuality(this.id, phase, f, side);
				this.qualityWeight += dt;
			}
			if (phase !== sequence[0] && this.samples >= 2) this.continuous = 0;
		} else if (this.samples >= 2 && phase === sequence[this.index]) {
			this.phasePeaks[this.index] = phaseQuality(this.id, phase, f, side, this.ground);
			if (phase === 'tuck') this.lastTuck = f.timestamp;
			if (this.id === 'burpee' && this.index === 0)
				this.ground = Math.max(f.points.left_ankle?.y ?? 0, f.points.right_ankle?.y ?? 0);
			if (++this.index === sequence.length) {
				rep = true;
				// Depth and jump width come from the active phase, not the return to rest.
				const peaks = this.phasePeaks;
				this.qualitySum +=
					this.id === 'burpee'
						? peaks.slice(1).reduce((sum, q) => sum + q, 0) / (sequence.length - 1)
						: this.id === 'sit-up'
							? (peaks[0] + peaks[1]) / 2
							: peaks[1];
				this.qualityWeight++;
				this.phasePeaks = [peaks[this.index - 1]];
				this.index = 1;
			}
		} else if (this.index > 0 && this.samples >= 2 && phase === sequence[this.index - 1]) {
			// The phase is recognized before the athlete reaches its deepest or widest point.
			const i = this.index - 1;
			this.phasePeaks[i] = Math.max(
				this.phasePeaks[i] ?? 0,
				phaseQuality(this.id, phase, f, side, this.ground)
			);
		} else if (
			this.samples >= 2 &&
			phase === sequence[0] &&
			this.index > 1 &&
			sequence[this.index] !== 'jump'
		) {
			this.index = 1;
			this.phasePeaks = [phaseQuality(this.id, phase, f, side, this.ground)];
		}
		return {
			phase,
			status:
				phase === 'waiting' || (sequence.length > 1 && this.index <= 1 && !rep) || this.samples < 2
					? 'waiting'
					: 'tracking',
			rep,
			held,
			continuous: this.continuous
		};
	}
}

// Coordinates on a 200x200 demonstration canvas, near-side shoulder, elbow,
// wrist, hip, knee, ankle. The other side is offset for oblique/side views.
const shapes: Record<string, number[][]> = {
	standing: [
		[91, 49],
		[93, 70],
		[96, 89],
		[88, 93],
		[89, 125],
		[90, 159]
	],
	lowered: [
		[128, 120],
		[110, 138],
		[132, 154],
		[85, 130],
		[61, 142],
		[36, 154]
	],
	squat: [
		[100, 80],
		[118, 86],
		[130, 77],
		[78, 113],
		[109, 123],
		[87, 159]
	],
	support: [
		[132, 100],
		[133, 127],
		[134, 154],
		[90, 122],
		[63, 139],
		[36, 154]
	],
	plank: [
		[133, 126],
		[135, 154],
		[158, 154],
		[88, 137],
		[61, 145],
		[36, 154]
	],
	lying: [
		[49, 148],
		[57, 133],
		[52, 124],
		[93, 151],
		[111, 122],
		[141, 151]
	],
	seated: [
		[106, 110],
		[117, 121],
		[116, 112],
		[93, 151],
		[111, 122],
		[141, 151]
	],
	closed: [
		[110, 54],
		[114, 75],
		[112, 93],
		[108, 94],
		[108, 126],
		[107, 159]
	],
	open: [
		[110, 54],
		[124, 34],
		[120, 12],
		[108, 94],
		[122, 124],
		[137, 154]
	],
	forward: [
		[110, 54],
		[129, 54],
		[149, 54],
		[108, 94],
		[122, 124],
		[137, 154]
	]
};
export function demoFrames(id: ExerciseId): PoseFrame[] {
	return cycles[id].map((phase, index) => {
		const jack = id.endsWith('jack');
		const name =
			(phase === 'lowered' && id.startsWith('squat')) || phase === 'tuck'
				? 'squat'
				: phase === 'jump'
					? 'standing'
					: phase;
		const points: PoseFrame['points'] = {};
		for (const side of sides)
			joints.forEach((joint, i) => {
				let [x, y] = shapes[name][i];
				if (side === 'right') {
					if (phase === 'forward' && (i === 1 || i === 2)) x -= 20;
					else x = jack ? 200 - x : x - 5;
					if (!jack) y -= 2;
				}
				if (phase === 'jump') y -= 16;
				points[`${side}_${joint}`] = { x, y, score: 1 };
			});
		const s = points.left_shoulder,
			h = points.left_hip;
		points.nose = {
			x: (s.x + points.right_shoulder.x) / 2 + (s.x - h.x) * 0.33,
			y: s.y + (s.y - h.y) * 0.33 - 3,
			score: 1
		};
		return {
			points,
			width: 200,
			height: 200,
			missing: false,
			provider: 'demo',
			timestamp: index * 0.1
		};
	});
}
