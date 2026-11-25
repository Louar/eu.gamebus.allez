import * as m from '#lib/paraglide/messages.js';
import type { ExerciseId } from './motion';

const names = {
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
