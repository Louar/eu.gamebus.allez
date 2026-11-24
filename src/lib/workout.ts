import {
	exercises,
	Tracker,
	type ExerciseId,
	type PoseFrame,
	type TrackingUpdate
} from './motion.ts';

type ExerciseStep = { exercise: ExerciseId } & (
	{ reps: number } | { hold: number } | { duration: number }
);
export type Step = ExerciseStep | { rest: number };
export type Workout = {
	v: 1;
	rest?: number;
	steps: Step[];
	repeat?: { rounds: number } | { duration: number };
};

export const example: Workout = {
	v: 1,
	rest: 15,
	steps: [
		{ exercise: 'squat', reps: 10 },
		{ exercise: 'jumping-jack', duration: 20 },
		{ rest: 10 },
		{ exercise: 'plank', hold: 30 }
	],
	repeat: { rounds: 3 }
};

const maxEncodedLength = 16_384;
function invalid(): never {
	throw new Error('invalid-workout');
}
function record(x: unknown, keys: string[]): x is Record<string, unknown> {
	return (
		x !== null &&
		typeof x === 'object' &&
		(Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null) &&
		Object.keys(x).every((k) => keys.includes(k))
	);
}
function integer(x: unknown, min = 1): number {
	return typeof x === 'number' && Number.isSafeInteger(x) && x >= min ? x : invalid();
}

export function parseWorkout(raw: unknown): Workout {
	if (!record(raw, ['v', 'rest', 'steps', 'repeat']) || raw.v !== 1 || !Array.isArray(raw.steps))
		invalid();
	const steps = Array.from(raw.steps, (s: unknown): Step => {
		if (record(s, ['rest'])) return { rest: integer(s.rest) };
		if (
			!record(s, ['exercise', 'reps', 'hold', 'duration']) ||
			Object.keys(s).length !== 2 ||
			!exercises.includes(s.exercise as ExerciseId)
		)
			invalid();
		const exercise = s.exercise as ExerciseId;
		const isStatic = exercise === 'plank' || exercise === 'squat-hold';
		if ('duration' in s) return { exercise, duration: integer(s.duration) };
		if ('reps' in s && !isStatic) return { exercise, reps: integer(s.reps) };
		if ('hold' in s && isStatic) return { exercise, hold: integer(s.hold) };
		return invalid();
	});
	if (!steps.some((s) => 'exercise' in s)) invalid();
	const workout: Workout = {
		v: 1,
		...('rest' in raw ? { rest: integer(raw.rest, 0) } : {}),
		steps
	};
	if ('repeat' in raw) {
		const r = raw.repeat;
		if (!record(r, ['rounds', 'duration']) || Object.keys(r).length !== 1) invalid();
		workout.repeat =
			'rounds' in r ? { rounds: integer(r.rounds) } : { duration: integer(r.duration) };
	}
	return workout;
}

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}
export function encodeWorkout(workout: Workout): string {
	const bytes = new TextEncoder().encode(JSON.stringify(parseWorkout(workout)));
	if (Math.ceil((bytes.length * 4) / 3) > maxEncodedLength) invalid();
	return base64url(bytes);
}
export function decodeWorkout(encoded: string): Workout {
	if (
		typeof encoded !== 'string' ||
		!encoded.length ||
		encoded.length > maxEncodedLength ||
		!/^[A-Za-z0-9_-]+$/.test(encoded)
	)
		invalid();
	try {
		const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
			c.charCodeAt(0)
		);
		if (base64url(bytes) !== encoded) invalid(); // Reject non-zero unused bits, too.
		return parseWorkout(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
	} catch {
		return invalid();
	}
}

export interface Result {
	round: number;
	stepIndex: number;
	exercise: ExerciseId;
	reps: number;
	held: number;
	continuous: number;
	longest: number;
	lost: number;
	elapsed: number;
	partial: boolean;
}

/** All public clock inputs are monotonic seconds, including frame capture times. */
export class Session {
	readonly workout: Workout;
	readonly results: Result[] = [];
	state: 'ready' | 'exercise' | 'rest' | 'paused' | 'finished' = 'ready';
	epoch = 0;
	round = 1;
	completedRounds = 0;
	stepIndex = 0;
	step: Step;
	elapsed = 0;
	current: Result | null = null;
	update: TrackingUpdate | null = null;
	private tracker = new Tracker();
	private now = 0;
	private entered = 0; // Active clock at entry to this interval.
	private acceptFrom = 0; // Wall clock; a delayed observation can predate a ticking UI.
	private lastFrame = -Infinity;
	private automaticRest = false;
	private tracked = 0;
	private seenAt: number | null = null;

	constructor(workout: Workout) {
		this.workout = parseWorkout(workout);
		this.step = this.workout.steps[0];
	}
	get remaining(): number | null {
		const seconds =
			'rest' in this.step ? this.step.rest : 'duration' in this.step ? this.step.duration : null;
		return seconds === null ? null : Math.max(0, this.entered + seconds - this.elapsed);
	}
	get circuitRemaining(): number | null {
		const repeat = this.workout.repeat;
		return repeat && 'duration' in repeat ? Math.max(0, repeat.duration - this.elapsed) : null;
	}
	get nextExercise(): ExerciseId | null {
		const { steps, repeat } = this.workout;
		const next = steps
			.slice(this.stepIndex + (this.automaticRest ? 0 : 1))
			.find((s) => 'exercise' in s);
		if (next) return next.exercise;
		if (!repeat || ('rounds' in repeat && this.round >= repeat.rounds)) return null;
		return steps.find((s) => 'exercise' in s)!.exercise;
	}
	start(timestamp: number) {
		if (this.state !== 'ready' || !Number.isFinite(timestamp)) return;
		this.now = timestamp;
		this.enter(this.step);
	}
	private enter(step: Step) {
		this.epoch++;
		this.entered = this.elapsed;
		this.acceptFrom = this.now;
		this.lastFrame = -Infinity;
		this.seenAt = null;
		this.tracked = 0;
		this.step = step;
		this.update = null;
		if ('rest' in step) {
			this.state = 'rest';
			this.current = null;
		} else {
			this.state = 'exercise';
			this.tracker.reset(step.exercise);
			this.current = {
				round: this.round,
				stepIndex: this.stepIndex,
				exercise: step.exercise,
				reps: 0,
				held: 0,
				continuous: 0,
				longest: 0,
				lost: 0,
				elapsed: 0,
				partial: true
			};
		}
	}
	private save(partial: boolean) {
		if (this.current) this.results.push({ ...this.current, partial });
		this.current = null;
	}
	private end() {
		this.save(true);
		this.state = 'finished';
		this.update = null;
		this.epoch++;
	}
	private advance() {
		const { steps, rest, repeat } = this.workout;
		this.save(false);
		if (this.automaticRest) {
			this.automaticRest = false;
		} else {
			if (this.stepIndex + 1 === steps.length) {
				this.completedRounds++;
				if (
					!repeat ||
					('rounds' in repeat && this.round >= repeat.rounds) ||
					this.circuitRemaining === 0
				) {
					this.end();
					return;
				}
				this.round++;
				this.stepIndex = 0;
			} else this.stepIndex++;
			this.automaticRest = Boolean(
				rest && 'exercise' in this.step && 'exercise' in steps[this.stepIndex]
			);
		}
		if (this.circuitRemaining === 0) {
			this.end();
			return;
		}
		this.enter(this.automaticRest ? { rest: rest! } : steps[this.stepIndex]);
	}

	private refreshLost() {
		if (!this.current) return;
		this.current.elapsed = this.elapsed - this.entered;
		// A visible detection covers at most 250 ms until the next observation.
		// This availability metric is independent of the tracker's verified hold intervals.
		const tail = this.seenAt === null ? 0 : Math.min(0.25, this.now - this.seenAt);
		this.current.lost = Math.max(0, this.current.elapsed - this.tracked - tail);
	}
	tick(timestamp: number) {
		if (!Number.isFinite(timestamp) || timestamp < this.now) return;
		if (this.state !== 'exercise' && this.state !== 'rest') return;
		const target = this.elapsed + (timestamp - this.now);
		while (this.state === 'exercise' || this.state === 'rest') {
			const stepDeadline =
				'rest' in this.step
					? this.entered + this.step.rest
					: 'duration' in this.step
						? this.entered + this.step.duration
						: Infinity;
			const repeat = this.workout.repeat;
			const circuitDeadline = repeat && 'duration' in repeat ? repeat.duration : Infinity;
			const deadline = Math.min(stepDeadline, circuitDeadline);
			const until = Math.min(target, deadline);
			this.now = timestamp - (target - until);
			this.elapsed = until;
			this.refreshLost();
			if (until < deadline) break;
			if (stepDeadline <= circuitDeadline) this.advance();
			else this.end();
		}
	}
	observe(frame: PoseFrame, epoch: number) {
		if (
			epoch !== this.epoch ||
			!Number.isFinite(frame.timestamp) ||
			frame.timestamp < this.acceptFrom ||
			frame.timestamp <= this.lastFrame
		)
			return;
		this.tick(frame.timestamp);
		if (
			epoch !== this.epoch ||
			this.state !== 'exercise' ||
			!this.current ||
			!('exercise' in this.step)
		)
			return;
		const u = this.tracker.update(frame);
		this.update = u;
		this.lastFrame = frame.timestamp;
		if (this.seenAt !== null) this.tracked += Math.min(0.25, frame.timestamp - this.seenAt);
		this.seenAt = u.status === 'lost' ? null : frame.timestamp;
		this.refreshLost();
		const r = this.current;
		r.reps += Number(u.rep);
		r.held += u.held;
		r.continuous = u.continuous;
		r.longest = Math.max(r.longest, r.continuous);
		if (
			('reps' in this.step && r.reps >= this.step.reps) ||
			('hold' in this.step && r.continuous >= this.step.hold)
		)
			this.advance();
	}
	/** Break motion on camera/provider interruption without stopping the active clock. */
	interrupt(timestamp: number) {
		if (!Number.isFinite(timestamp) || timestamp < this.now) return;
		this.tick(timestamp);
		if (this.state !== 'exercise' && this.state !== 'rest') return;
		this.epoch++;
		this.acceptFrom = timestamp;
		this.lastFrame = -Infinity;
		this.update = null;
		if (this.seenAt !== null) this.tracked += Math.min(0.25, this.now - this.seenAt);
		this.seenAt = null;
		if (this.current) {
			this.tracker.reset(this.current.exercise);
			this.current.continuous = 0;
		}
	}
	pause(timestamp: number) {
		if (!Number.isFinite(timestamp) || timestamp < this.now) return;
		this.interrupt(timestamp);
		if (this.state === 'exercise' || this.state === 'rest') this.state = 'paused';
	}
	resume(timestamp: number) {
		if (this.state !== 'paused' || !Number.isFinite(timestamp) || timestamp < this.now) return;
		this.now = this.acceptFrom = timestamp;
		this.epoch++;
		this.state = 'rest' in this.step ? 'rest' : 'exercise';
	}
	finish(timestamp: number) {
		if (
			!Number.isFinite(timestamp) ||
			timestamp < this.now ||
			this.state === 'ready' ||
			this.state === 'finished'
		)
			return;
		this.tick(timestamp);
		if (this.current || this.state === 'rest' || this.state === 'paused') this.end();
	}
}
