import { exercises } from './motion.ts';
import type { Step, Workout } from './workout';

export const workoutDefaults = { steps: 3, rounds: 1, rest: 15 };

export function randomWorkout(
	count = workoutDefaults.steps,
	rounds = workoutDefaults.rounds,
	rest = workoutDefaults.rest
): Workout {
	if (
		!Number.isSafeInteger(count) ||
		count < 1 ||
		count > 25 ||
		!Number.isSafeInteger(rounds) ||
		rounds < 1 ||
		!Number.isSafeInteger(rest) ||
		rest < 0
	)
		throw new Error('invalid-workout');
	const pool = [...exercises];
	const selected: (typeof exercises)[number][] = [];
	for (let i = 0; i < count; i++) {
		// Exhaust the catalog once, then avoid adjacent repeats, including the round boundary.
		const choices = pool.length
			? pool
			: exercises.filter(
					(exercise) =>
						exercise !== selected[i - 1] && (i !== count - 1 || exercise !== selected[0])
				);
		const [exercise] = choices.splice(Math.floor(Math.random() * choices.length), 1);
		selected.push(exercise);
	}
	const steps = selected.map((exercise): Step => {
		return exercise === 'plank' || exercise === 'squat-hold'
			? { exercise, hold: 15 }
			: { exercise, reps: exercise === 'burpee' ? 4 : 8 };
	});
	return { v: 1, steps, rest, repeat: { rounds } };
}
