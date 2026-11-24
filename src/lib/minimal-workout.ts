import { exercises } from './motion';
import type { Step, Workout } from './workout';

export function randomWorkout(): Workout {
	const pool = [...exercises];
	const steps = Array.from({ length: 3 }, (): Step => {
		const [exercise] = pool.splice(Math.floor(Math.random() * pool.length), 1);
		return exercise === 'plank' || exercise === 'squat-hold'
			? { exercise, hold: 15 }
			: { exercise, reps: exercise === 'burpee' ? 4 : 8 };
	});
	return { v: 1, steps, rest: 15, repeat: { rounds: 2 } };
}
