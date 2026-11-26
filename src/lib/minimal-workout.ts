import { exercises } from './motion.ts';
import type { Step, Workout } from './workout';

export function randomWorkout(count = 3, rounds = 2, rest = 15): Workout {
	if (
		!Number.isSafeInteger(count) ||
		count < 1 ||
		count > exercises.length ||
		!Number.isSafeInteger(rounds) ||
		rounds < 1 ||
		!Number.isSafeInteger(rest) ||
		rest < 0
	)
		throw new Error('invalid-workout');
	const pool = [...exercises];
	const steps = Array.from({ length: count }, (): Step => {
		const [exercise] = pool.splice(Math.floor(Math.random() * pool.length), 1);
		return exercise === 'plank' || exercise === 'squat-hold'
			? { exercise, hold: 15 }
			: { exercise, reps: exercise === 'burpee' ? 4 : 8 };
	});
	return { v: 1, steps, rest, repeat: { rounds } };
}
