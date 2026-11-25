import test from 'node:test';
import assert from 'node:assert/strict';
import {
	Session,
	example,
	encodeWorkout,
	decodeWorkout,
	parseWorkout,
	type Workout
} from '../src/lib/workout.ts';
import { demoFrames, Tracker, type PoseFrame } from '../src/lib/motion.ts';

const encodedExample =
	'eyJ2IjoxLCJyZXN0IjoxNSwic3RlcHMiOlt7ImV4ZXJjaXNlIjoic3F1YXQiLCJyZXBzIjoxMH0seyJleGVyY2lzZSI6Imp1bXBpbmctamFjayIsImR1cmF0aW9uIjoyMH0seyJyZXN0IjoxMH0seyJleGVyY2lzZSI6InBsYW5rIiwiaG9sZCI6MzB9XSwicmVwZWF0Ijp7InJvdW5kcyI6M319';
const squat = { exercise: 'squat', reps: 1 } as const;
const interval = { exercise: 'squat', duration: 2 } as const;
const plank = demoFrames('plank')[0];
const cycle = demoFrames('squat');

function run(steps: Workout['steps'], extra: Partial<Omit<Workout, 'steps' | 'v'>> = {}) {
	const session = new Session({ v: 1, steps, ...extra });
	session.start(0);
	return session;
}
function visit(s: Session, frames: PoseFrame[], t: number, epoch = s.epoch) {
	for (const f of frames)
		for (let i = 0; i < 3; i++) {
			s.observe({ ...f, timestamp: t }, epoch);
			t += 0.05;
		}
	return t;
}
function near(actual: number, expected: number) {
	assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

test('previously shared links stay canonical when the planner default changes', () => {
	const shared: Workout = {
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
	assert.equal(encodeWorkout(shared), encodedExample);
	assert.deepEqual(decodeWorkout(encodedExample), shared);
	assert.deepEqual(decodeWorkout(encodeWorkout(example)), example);
	const w = { v: 1, steps: [squat, squat], rest: 0, repeat: { duration: 600 } } as const;
	assert.deepEqual(decodeWorkout(encodeWorkout(parseWorkout(w))), w);
	assert.deepEqual(parseWorkout({ v: 1, steps: [squat] }), { v: 1, steps: [squat] });
});

test('reject ambiguous, unsupported or unsafe prescriptions', () => {
	const nums = [null, '1', -2, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity];
	const invalid = [
		null,
		[],
		{},
		{ ...example, v: 2 },
		{ ...example, title: 'x' },
		...[
			[],
			[{ rest: 1 }],
			[null],
			[{ exercise: 'plank' }],
			[{ exercise: 'curl', reps: 1 }],
			[{ exercise: 'plank', reps: 1 }],
			[{ exercise: 'squat-hold', reps: 1 }],
			[{ exercise: 'squat', hold: 1 }],
			[{ ...squat, duration: 1 }],
			[{ ...squat, rest: 1 }],
			[squat, { rest: 1, extra: true }],
			...[0, ...nums].flatMap((n) => [
				[{ ...squat, reps: n }],
				[squat, { rest: n }],
				[{ exercise: 'plank', hold: n }],
				[{ exercise: 'sit-up', duration: n }]
			])
		].map((steps) => ({ v: 1, steps })),
		...nums.map((rest) => ({ ...example, rest })),
		...[
			null,
			{},
			{ rounds: 1, duration: 10 },
			{ rounds: 0 },
			{ duration: 0 },
			{ rounds: 1, rest: 1 },
			...nums.map((rounds) => ({ rounds }))
		].map((repeat) => ({ ...example, repeat }))
	];
	for (const raw of invalid) assert.throws(() => parseWorkout(raw));
});

test('reject malformed and oversized URL payloads', () => {
	for (const raw of [
		'',
		'e',
		'e30=',
		'invalid+input',
		encodedExample + '\n',
		'A'.repeat(16385),
		'ew',
		'_w',
		'e31'
	])
		assert.throws(() => decodeWorkout(raw));
	assert.throws(() => encodeWorkout({ v: 1, steps: Array.from({ length: 1200 }, () => squat) }));
});

test('practice, countdown and repeated starts cannot credit the session', () => {
	const practice = new Tracker('squat');
	let practiceReps = 0,
		t = 0;
	for (const frame of cycle)
		for (let i = 0; i < 3; i++)
			practiceReps += Number(practice.update({ ...frame, timestamp: (t += 0.05) }).rep);
	assert.equal(practiceReps, 1);
	const s = new Session({ v: 1, steps: [squat, squat] });
	const practiceEpoch = s.epoch;
	s.tick(100);
	s.start(103);
	s.start(120);
	visit(s, cycle, 104, practiceEpoch);
	assert.equal(s.elapsed, 0);
	assert.equal(s.current!.reps, 0);
	visit(s, cycle, 105);
	assert.equal(s.stepIndex, 1);
	assert.equal(s.current!.reps, 0);
	visit(s, cycle, 106);
	assert.deepEqual(
		s.results.map((r) => [r.stepIndex, r.reps, r.partial]),
		[
			[0, 1, false],
			[1, 1, false]
		]
	);
	assert.equal(s.state, 'finished');
	assert.equal(s.completedRounds, 1);
});

test('automatic rests only between adjacent exercises; explicit rests occupy their prescribed positions', () => {
	const s = run([interval, interval, { rest: 3 }, interval], { rest: 5, repeat: { rounds: 2 } });
	s.tick(2);
	assert.deepEqual(s.step, { rest: 5 });
	assert.equal(s.nextExercise, 'squat');
	s.tick(7);
	assert.equal(s.stepIndex, 1);
	assert.equal(s.state, 'exercise');
	s.tick(9);
	assert.deepEqual(s.step, { rest: 3 });
	assert.equal(s.stepIndex, 2);
	s.tick(12);
	assert.equal(s.stepIndex, 3);
	s.tick(14);
	assert.equal(s.completedRounds, 1);
	assert.equal(s.round, 2);
	assert.equal(s.stepIndex, 0);
	assert.deepEqual(s.step, { rest: 5 });
	s.tick(100);
	assert.equal(s.elapsed, 33);
	assert.equal(s.state, 'finished');
	assert.equal(s.results.length, 6);
	assert.equal(s.completedRounds, 2);
});

test('leading, adjacent and terminal explicit rests are not removed', () => {
	const s = run([{ rest: 2 }, interval, { rest: 3 }, { rest: 4 }], {
		rest: 99,
		repeat: { rounds: 2 }
	});
	assert.equal(s.state, 'rest');
	assert.equal(s.nextExercise, 'squat');
	s.tick(7);
	assert.deepEqual(s.step, { rest: 4 });
	assert.equal(s.nextExercise, 'squat');
	s.tick(11);
	assert.equal(s.round, 2);
	assert.deepEqual(s.step, { rest: 2 });
	s.tick(18);
	assert.equal(s.nextExercise, null);
	s.tick(25);
	assert.equal(s.elapsed, 22);
});

test('late ticks traverse exact deadlines; exact circuit/round ties count the completed round', () => {
	const s = run([interval, interval], { repeat: { duration: 8 } });
	s.tick(25);
	assert.equal(s.elapsed, 8);
	assert.equal(s.completedRounds, 2);
	assert.equal(s.round, 2);
	assert.deepEqual(
		s.results.map((r) => [r.round, r.stepIndex, r.partial]),
		[
			[1, 0, false],
			[1, 1, false],
			[2, 0, false],
			[2, 1, false]
		]
	);
	assert.equal(s.circuitRemaining, 0);
});

test('circuit expires during a rep: keep completed reps and discard incomplete motion', () => {
	const s = run([interval, { exercise: 'squat', reps: 4 }], { repeat: { duration: 4 } });
	s.tick(2);
	visit(s, cycle, 2.2);
	visit(s, cycle.slice(0, 2), 3.7);
	s.tick(4.5);
	assert.equal(s.state, 'finished');
	assert.equal(s.elapsed, 4);
	assert.equal(s.completedRounds, 0);
	assert.equal(s.results[1].reps, 1);
	assert.equal(s.results[1].partial, true);
	visit(s, cycle, 6);
	s.finish(10);
	assert.equal(s.results.length, 2);
});

test('stale frame epochs, capture times, invalid clocks and duplicate timestamps do not credit the next step', () => {
	const s = run([interval, interval]);
	const epoch = s.epoch;
	s.tick(2.1);
	visit(s, cycle, 2.15, epoch);
	visit(s, cycle, 1.45, s.epoch);
	for (const f of cycle) for (let i = 0; i < 3; i++) s.observe({ ...f, timestamp: 2.2 }, s.epoch);
	s.tick(NaN);
	s.tick(0);
	s.pause(1);
	s.finish(Infinity);
	assert.equal(s.state, 'exercise');
	assert.equal(s.current!.reps, 0);
	assert.equal(s.elapsed, 2.2);
	// Capture may legitimately lag a rendering tick, within the same epoch.
	s.tick(3);
	visit(s, cycle, 2.5);
	assert.equal(s.current!.reps, 1);
	assert.equal(s.elapsed, 3);
});

test('pause/background suspends rest, step, circuit clocks; foreground reacquires starting posture', () => {
	const s = run([{ rest: 3 }, { exercise: 'squat', reps: 2 }], { repeat: { duration: 8 } });
	s.pause(1);
	s.tick(100);
	assert.equal(s.remaining, 2);
	assert.equal(s.circuitRemaining, 7);
	s.resume(101);
	s.tick(103);
	const epoch = s.epoch;
	visit(s, cycle.slice(0, 2), 103.1);
	s.pause(103.5);
	s.resume(107.5);
	visit(s, cycle, 107.6, epoch);
	visit(s, [cycle[2]], 108.1);
	assert.equal(s.current!.reps, 0);
	visit(s, cycle, 108.4);
	assert.equal(s.current!.reps, 1);
	s.tick(112);
	assert.equal(s.state, 'finished');
	assert.equal(s.elapsed, 8);
});

test('hold target is a continuous streak, not accumulated hold time', () => {
	const s = run([{ exercise: 'plank', hold: 1 }]);
	for (let i = 0; i <= 8; i++) s.observe({ ...plank, timestamp: i / 10 }, s.epoch);
	near(s.current!.held, 0.8);
	s.pause(0.9);
	assert.equal(s.current!.continuous, 0);
	s.resume(5);
	for (let i = 0; i <= 8; i++) s.observe({ ...plank, timestamp: 5 + i / 10 }, s.epoch);
	near(s.current!.held, 1.6);
	near(s.current!.longest, 0.8);
	assert.equal(s.state, 'exercise');
	s.observe({ ...plank, timestamp: 6, missing: true }, s.epoch);
	assert.equal(s.current!.continuous, 0);
	for (let i = 0; i <= 10; i++) s.observe({ ...plank, timestamp: 7 + i / 10 }, s.epoch);
	assert.equal(s.state, 'finished');
	near(s.results[0].held, 2.6);
	near(s.results[0].longest, 1);
});

test('tracking loss and provider interruptions do not stop time or bridge holds', () => {
	const s = run([{ exercise: 'plank', duration: 5 }]);
	visit(s, [plank], 0);
	s.interrupt(0.2);
	visit(s, [plank], 2);
	near(s.current!.held, 0.2);
	near(s.current!.longest, 0.1);
	s.observe({ ...plank, timestamp: 2.2, missing: true }, s.epoch);
	s.tick(7);
	assert.equal(s.elapsed, 5);
	near(s.results[0].lost, 4.6);
	assert.equal(s.results[0].partial, false);
});

test('manual finish while paused preserves partial results without wall clock leakage', () => {
	const s = run([interval]);
	visit(s, cycle, 0.1);
	s.pause(1);
	s.finish(1000);
	assert.equal(s.state, 'finished');
	assert.equal(s.elapsed, 1);
	assert.equal(s.results[0].reps, 1);
	assert.equal(s.results[0].partial, true);
});

test('round target changes preserve progress and control when the session ends', () => {
	const original: Workout = { v: 1, steps: [interval] };
	const s = new Session(original);
	assert.equal(s.setRounds(3), true);
	assert.equal(original.repeat, undefined);
	s.start(0);
	assert.equal(s.setRounds(4), false);
	s.tick(2);
	assert.equal(s.round, 2);
	s.pause(3);
	const earned = structuredClone(s.results);
	assert.equal(s.setRounds(1), false);
	assert.equal(s.setRounds(2), true);
	assert.deepEqual(s.results, earned);
	assert.equal(s.elapsed, 3);
	assert.equal(s.current?.elapsed, 1);
	s.tick(100);
	assert.equal(s.elapsed, 3);
	s.resume(100);
	s.tick(101);
	assert.equal(s.state, 'finished');
	assert.equal(s.completedRounds, 2);
	assert.equal(s.setRounds(5), false);
});

test('invalid round targets and time-budget conversions are rejected', () => {
	const s = new Session({ v: 1, steps: [interval] });
	for (const n of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.equal(s.setRounds(n), false);
	}
	const timed = run([interval], { repeat: { duration: 10 } });
	timed.pause(1);
	assert.equal(timed.setRounds(2), false);
	assert.deepEqual(timed.workout.repeat, { duration: 10 });
});
