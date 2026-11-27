import * as m from '#lib/paraglide/messages.js';
import type { ExerciseId } from './motion';

const names = {
	'bicycle-crunch': m.exercise_bicycle_crunch,
	'heel-tap': m.exercise_heel_tap,
	'forward-lunge': m.exercise_forward_lunge,
	'reverse-lunge': m.exercise_reverse_lunge,
	'glute-bridge': m.exercise_glute_bridge,
	'pogo-jump': m.exercise_pogo_jump,
	'squat-jump': m.exercise_squat_jump,
	'dead-bug': m.exercise_dead_bug,
	'push-up': m.exercise_push_up,
	squat: m.exercise_squat,
	'jumping-jack': m.exercise_jumping_jack,
	'front-jack': m.exercise_front_jack,
	'sit-up': m.exercise_sit_up,
	'squat-hold': m.exercise_squat_hold,
	burpee: m.exercise_burpee,
	plank: m.exercise_plank
};
const waits = {
	'bicycle-crunch': m.wait_bicycle_crunch,
	'heel-tap': m.wait_heel_tap,
	'forward-lunge': m.wait_forward_lunge,
	'reverse-lunge': m.wait_reverse_lunge,
	'glute-bridge': m.wait_glute_bridge,
	'pogo-jump': m.wait_pogo_jump,
	'squat-jump': m.wait_squat_jump,
	'dead-bug': m.wait_dead_bug,
	'push-up': m.wait_push_up,
	squat: m.wait_squat,
	'jumping-jack': m.wait_jumping_jack,
	'front-jack': m.wait_front_jack,
	'sit-up': m.wait_sit_up,
	'squat-hold': m.wait_squat_hold,
	burpee: m.wait_burpee,
	plank: m.wait_plank
};
const phases: Record<string, () => string> = {
	neutral: m.phase_neutral,
	left: m.phase_left,
	right: m.phase_right,
	split: m.phase_split,
	bridge: m.phase_bridge,
	hop: m.phase_hop,
	standing: m.phase_standing,
	lowered: m.phase_lowered,
	closed: m.phase_closed,
	open: m.phase_open,
	forward: m.phase_forward,
	support: m.phase_support,
	lying: m.phase_lying,
	seated: m.phase_seated,
	tuck: m.phase_tuck,
	jump: m.phase_jump,
	plank: m.phase_plank
};
export const name = (id: ExerciseId) => names[id]();
const guides: Record<ExerciseId, [() => string, () => string]> = {
	'bicycle-crunch': [m.wait_bicycle_crunch, m.tip_alternating],
	'heel-tap': [m.wait_heel_tap, m.tip_alternating],
	'dead-bug': [m.wait_dead_bug, m.tip_alternating],
	'forward-lunge': [m.wait_forward_lunge, m.tip_lunge],
	'reverse-lunge': [m.wait_reverse_lunge, m.tip_lunge],
	'glute-bridge': [m.wait_glute_bridge, m.tip_bridge],
	'pogo-jump': [m.wait_pogo_jump, m.tip_jump],
	'squat-jump': [m.wait_squat_jump, m.tip_jump],
	'push-up': [m.guide_push_up, m.tip_floor_side],
	plank: [m.guide_plank, m.tip_floor_side],
	squat: [m.guide_squat, m.tip_squat_side],
	'squat-hold': [m.guide_squat_hold, m.tip_squat_side],
	'sit-up': [m.guide_sit_up, m.tip_floor_side],
	'jumping-jack': [m.guide_jumping_jack, m.tip_jumping_jack],
	'front-jack': [m.guide_front_jack, m.tip_front_jack],
	burpee: [m.guide_burpee, m.tip_burpee]
};
export function movementGuide(id: ExerciseId) {
	const [movement, camera] = guides[id];
	return { movement: movement(), camera: camera() };
}
export const feedback = (id: ExerciseId, u?: { status: string; phase: string } | null) =>
	u?.status === 'lost'
		? m.lost()
		: u?.status === 'tracking' && phases[u.phase]
			? phases[u.phase]()
			: waits[id]();
export const reps = (n: number) => (n === 1 ? m.rep_one() : m.rep_many({ n }));
export const staticExercise = (id: ExerciseId) => id === 'plank' || id === 'squat-hold';
export function clock(seconds: number) {
	const n = Math.ceil(Math.max(0, seconds));
	return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
