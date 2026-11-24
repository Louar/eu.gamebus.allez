import test from 'node:test';
import assert from 'node:assert/strict';
import { exercises, Tracker, demoFrames } from '../src/lib/motion.ts';

function replay(id, frames) {
	const tracker = new Tracker(id);
	let n = 0;
	return frames.flatMap((f) =>
		Array.from({ length: 3 }, () => tracker.update({ ...f, timestamp: n++ / 20 }))
	);
}
function reps(id, frames) {
	return replay(id, frames).filter((u) => u.rep).length;
}
for (const id of exercises) {
	test(`three ${id} cycles or observed hold`, () => {
		const poses = demoFrames(id);
		if (poses.length === 1) {
			const observed = replay(id, Array(10).fill(poses[0]));
			assert.equal(observed.at(-1).continuous, 1.45);
			assert.equal(
				observed.reduce((sum, u) => sum + u.held, 0),
				1.45
			);
		} else assert.equal(reps(id, [...poses, ...poses, ...poses]), 3);
	});
}
test('wrong exercises, rest and truncated movements never earn a rep', () => {
	const jack = demoFrames('jumping-jack'),
		burpee = demoFrames('burpee'),
		squat = demoFrames('squat');
	for (const [id, poses] of [
		['squat', jack],
		['front-jack', jack],
		['jumping-jack', demoFrames('front-jack')],
		['squat', Array(10).fill(squat[0])],
		['squat', [squat[0], ...Array(10).fill(squat[1])]],
		['burpee', burpee.filter((_, i) => i !== 2)],
		['burpee', burpee.filter((_, i) => i !== 5)],
		['squat', [squat[0], squat[1], { ...squat[1], missing: true }, squat[2]]]
	])
		assert.equal(reps(id, poses), 0, id);
});
test('hold jitter freezes observations; confirmed mismatch, loss, gap and model change break continuity', () => {
	const t = new Tracker('plank'),
		[p] = demoFrames('plank'),
		wrong = demoFrames('push-up')[0];
	const at = (timestamp, f = p) => t.update({ ...f, timestamp });
	at(0);
	assert.equal(at(0.1).continuous, 0.1);
	assert.equal(at(0.2, wrong).continuous, 0.1);
	assert.equal(at(0.3).held, 0);
	assert.ok(Math.abs(at(0.4).continuous - 0.2) < 1e-9);
	at(0.5, wrong);
	assert.equal(at(0.6, wrong).continuous, 0);
	at(0.7);
	at(0.8);
	assert.equal(at(0.9, { ...p, missing: true }).continuous, 0);
	assert.equal(at(1).held, 0);
	at(1.1);
	assert.equal(at(2).continuous, 0);
	at(2.1);
	assert.equal(at(2.2, { ...p, provider: 'different' }).continuous, 0);
});
test('provider switch, gap and low confidence invalidate a partial rep', () => {
	const [start, low] = demoFrames('squat');
	for (const cause of ['provider', 'gap', 'invisible', 'reset']) {
		const t = new Tracker('squat');
		[start, start, low, low].forEach((f, i) => t.update({ ...f, timestamp: i / 20 }));
		if (cause === 'invisible')
			assert.equal(t.update({ ...low, points: {}, timestamp: 0.2 }).status, 'lost');
		if (cause === 'reset') t.reset('squat');
		for (let i = 0; i < 4; i++)
			assert.equal(
				t.update({
					...start,
					provider: cause === 'provider' ? 'other' : 'demo',
					timestamp: (cause === 'gap' ? 1 : 0.25) + i / 20
				}).rep,
				false
			);
	}
});
