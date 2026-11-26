import type { Result, Session, Workout } from './workout';

export type ActivitySnapshot = {
	workout: Workout;
	elapsed: number;
	completedRounds: number;
	isCompleted: boolean;
	results: Result[];
};

export type ActivityListener = (
	event: 'start' | 'step' | 'finish',
	snapshot: ActivitySnapshot
) => void;

/** Detach queued host updates from the running session; never include camera or pose data. */
export function activitySnapshot(session: Session): ActivitySnapshot {
	const goal = session.workout.repeat;
	return {
		workout: structuredClone(session.workout),
		elapsed: session.elapsed,
		completedRounds: session.completedRounds,
		isCompleted:
			session.state === 'finished' &&
			(goal && 'duration' in goal
				? session.elapsed >= goal.duration
				: session.completedRounds >= (goal?.rounds ?? 1)),
		results: session.results.map((result) => ({ ...result }))
	};
}
