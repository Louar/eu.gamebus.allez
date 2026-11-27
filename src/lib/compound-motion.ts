import type { ExerciseId, PoseFrame } from './motion';
import { angle as bend, dist as distance } from './pose-geometry.ts';

export const compoundCycles = {
	'bicycle-crunch': ['neutral', 'left', 'right', 'neutral'],
	'heel-tap': ['neutral', 'left', 'right', 'neutral'],
	'forward-lunge': ['standing', 'split', 'standing'],
	'reverse-lunge': ['standing', 'split', 'standing'],
	'glute-bridge': ['lying', 'bridge', 'lying'],
	'pogo-jump': ['standing', 'hop', 'standing'],
	'squat-jump': ['standing', 'lowered', 'jump', 'standing'],
	'dead-bug': ['neutral', 'left', 'neutral', 'right', 'neutral']
} as const;
export type CompoundId = keyof typeof compoundCycles;
export const compoundIds = Object.keys(compoundCycles) as CompoundId[];
export const isCompound = (id: ExerciseId): id is CompoundId => id in compoundCycles;
export const alternating = (id: ExerciseId) =>
	id === 'bicycle-crunch' || id === 'heel-tap' || id === 'dead-bug';

const sides = ['left', 'right'] as const;
type Side = (typeof sides)[number];
type Phase = (typeof compoundCycles)[CompoundId][number] | 'waiting' | 'lost';
const observation = (phase: Phase, fraction = 0, invalidate = false) => ({
	phase,
	quality: 100 * Math.min(1, Math.max(0, fraction)),
	invalidate
});

/** Input joints have passed the tracker's confidence gate. Distances below are in torso lengths. */
export function compoundPosture(
	id: CompoundId,
	f: PoseFrame,
	side: Side,
	anchor?: PoseFrame,
	landing = false
) {
	const p = f.points;
	const limb = (side: Side) => {
		const [s, e, w, h, k, a] = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'].map(
			(j) => p[`${side}_${j}`]
		);
		const scale = distance(s, h);
		return {
			s,
			e,
			w,
			h,
			k,
			a,
			scale,
			knee: bend(h, k, a),
			up: (h.y - s.y) / scale,
			direction: Math.sign(h.x - s.x)
		};
	};
	const l = limb(side),
		{ s, h, k, a, scale } = l;
	if (scale < 2) return observation('lost');
	const waiting = observation('waiting');
	if (id === 'glute-bridge') {
		if (
			l.knee > 128 ||
			k.y > h.y - 0.12 * scale ||
			Math.abs(s.y - a.y) > 0.48 * scale ||
			(s.x - h.x) * (a.x - h.x) >= 0
		)
			return waiting;
		const lift = (Math.min(s.y, a.y) - h.y) / scale;
		if (lift > 0.26 && bend(s, h, k) > 146)
			return observation('bridge', (bend(s, h, k) - 130) / 40);
		return Math.abs(h.y - a.y) < 0.23 * scale && Math.abs(l.up) < 0.32
			? observation('lying', 1)
			: waiting;
	}
	const legs = sides.map(limb);
	if (legs.some((v) => v.scale < 2)) return observation('lost');
	if (alternating(id)) {
		if (legs.some((v) => Math.abs(v.up) > 0.58)) return waiting;
		const tabletop = (v: typeof l) =>
			v.k.y < v.h.y - 0.35 * v.scale && v.knee < 125 && v.a.y < v.h.y - 0.18 * v.scale;
		const longLeg = (v: typeof l) =>
			v.knee > 143 &&
			(v.a.x - v.h.x) * v.direction > 0.78 * v.scale &&
			v.a.y < v.h.y + 0.15 * v.scale;
		const armsUp = (v: typeof l) =>
			v.s.y - v.w.y > 0.56 * v.scale && Math.abs(v.s.x - v.w.x) < 0.55 * v.scale;
		if (
			id === 'heel-tap' &&
			!legs.every(
				(v) =>
					v.knee < 133 && v.k.y < v.h.y - 0.24 * v.scale && Math.abs(v.a.y - v.h.y) < 0.38 * v.scale
			)
		)
			return waiting;
		const evidence = legs.map((v, i) => {
			const other = legs[1 - i];
			if (id === 'heel-tap') return 1 - distance(v.w, v.a) / v.scale;
			if (id === 'bicycle-crunch')
				return tabletop(v) && longLeg(other) && distance(other.w, other.s) < 0.9 * other.scale
					? 1 - distance(other.e, v.k) / v.scale
					: 0;
			return tabletop(v) &&
				longLeg(other) &&
				armsUp(other) &&
				bend(v.s, v.e, v.w) > 135 &&
				Math.abs(v.s.y - v.w.y) < 0.55 * v.scale
				? ((v.s.x - v.w.x) * v.direction) / v.scale
				: 0;
		});
		const threshold = id === 'dead-bug' ? 0.66 : id === 'heel-tap' ? 0.52 : 0.38;
		for (const [i, value] of evidence.entries())
			if (value > threshold && evidence[1 - i] < threshold) return observation(sides[i], value);
		if (
			id === 'heel-tap'
				? evidence.every((q) => q < 0.4)
				: legs.every(
						(v) =>
							tabletop(v) && (id === 'dead-bug' ? armsUp(v) : distance(v.w, v.s) < 0.9 * v.scale)
					)
		)
			return observation('neutral', 1);
		return waiting;
	}
	if (legs.some((v) => v.up < 0.58)) return waiting;
	const tall = legs.every((v) => v.knee > 151 && v.a.y > v.h.y + 0.65 * v.scale);
	const feet = Math.abs(legs[0].a.x - legs[1].a.x) / scale;
	if (id === 'forward-lunge' || id === 'reverse-lunge') {
		if (tall && feet < 0.75) {
			// Walking through to a new footprint is not a return to the starting stance.
			if (
				anchor &&
				legs.some((v, i) => distance(v.a, anchor.points[`${sides[i]}_ankle`]) > 0.42 * scale)
			)
				return observation('waiting', 0, true);
			return observation('standing', 1);
		}
		if (!anchor || feet < 0.78 || legs.some((v) => v.knee > 139 || v.knee < 55)) return waiting;
		const dx = legs.map((v, i) => (v.a.x - anchor.points[`${sides[i]}_ankle`].x) / scale);
		const i = Math.abs(dx[0]) > Math.abs(dx[1]) ? 0 : 1;
		if (Math.abs(dx[i]) < 0.6 || Math.abs(dx[1 - i]) > 0.4) return waiting;
		// The rear shin angles toward the front foot. Infer facing from both shins
		// rather than assuming the athlete faces image-right (or using optional depth).
		const shins = legs.reduce((sum, v) => sum + (v.k.x - v.a.x) / v.scale, 0);
		const stepsForward = dx[i] * shins > 0;
		if (Math.abs(shins) < 0.32 || stepsForward !== (id === 'forward-lunge')) return waiting;
		return observation('split', 1 - Math.abs(legs[i].knee - 90) / 75);
	}
	const crouch = legs.every((v) => v.knee < 132 && v.a.y > v.h.y + 0.17 * v.scale);
	if (!anchor) return tall ? observation('standing', 1) : waiting;
	const lifts = legs.map((v, i) => (anchor.points[`${sides[i]}_ankle`].y - v.a.y) / scale);
	const altitude = Math.min(...lifts);
	const grounded = lifts.every((q) => Math.abs(q) < 0.075);
	const hipRise = legs.every(
		(v, i) => anchor.points[`${sides[i]}_hip`].y - v.h.y > scale * altitude * 0.4
	);
	if (id === 'pogo-jump') {
		if (!tall || Math.max(...lifts) > 0.31) return observation('waiting', 0, true);
		if (altitude > 0.09 && hipRise) return observation('hop', altitude / 0.2);
	} else {
		if (altitude > 0.32 && hipRise && legs.every((v) => v.knee > 133))
			return observation('jump', altitude / 0.52);
		if (grounded && landing) return observation('standing', 1);
		if (grounded && crouch) return observation('lowered', 1 - Math.abs(l.knee - 90) / 75);
	}
	return grounded && tall ? observation('standing', 1) : waiting;
}
