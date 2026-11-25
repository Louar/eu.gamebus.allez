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

function shallowerSquat(id) {
	const f = demoFrames(id).find((p) => p.points.left_hip.y === 113);
	for (const side of ['left', 'right'])
		f.points[`${side}_ankle`].x = f.points[`${side}_knee`].x + 10;
	return f;
}

test('round quality averages completed reps, not frames or unfinished cycles', () => {
	const t = new Tracker('squat');
	const [standing, deep] = demoFrames('squat');
	const shallow = shallowerSquat('squat');
	let tick = 0;
	const phase = (f, n = 2) =>
		Array.from({ length: n }, () => t.update({ ...f, timestamp: tick++ / 20 }));
	phase(standing);
	phase(shallow, 8);
	assert.equal(t.roundQuality, null);
	assert.ok(phase(standing).at(-1).rep);
	const first = t.roundQuality;
	assert.ok(first > 0 && first < 90);
	phase(shallow);
	phase({ ...standing, missing: true });
	assert.equal(t.roundQuality, first);
	phase(standing);
	phase(shallow);
	phase(deep);
	assert.ok(phase(standing).at(-1).rep);
	assert.ok(Math.abs(t.roundQuality - (first + 100) / 2) <= 1);
	t.reset('squat');
	assert.equal(t.roundQuality, null);
});

test('hold quality weights observed seconds and excludes gaps', () => {
	const t = new Tracker('squat-hold');
	const [deep] = demoFrames('squat-hold');
	const shallow = shallowerSquat('squat-hold');
	const at = (timestamp, f) => t.update({ ...f, timestamp });
	at(0, shallow);
	assert.equal(t.roundQuality, null);
	at(0.1, shallow);
	const first = t.roundQuality;
	assert.ok(first > 0 && first < 75);
	assert.equal(at(2, deep).held, 0);
	assert.equal(t.roundQuality, first);
	at(2.3, deep);
	assert.ok(Math.abs(t.roundQuality - (first + 300) / 4) <= 1);
});

for (const id of ['jumping-jack', 'front-jack']) {
	test(`${id} rewards wider foot spread with identical arm positions`, () => {
		const score = (inset) => {
			const t = new Tracker(id);
			const frames = demoFrames(id);
			frames[1].points.left_ankle.x -= inset;
			frames[1].points.right_ankle.x += inset;
			let tick = 0;
			for (const f of frames)
				for (let i = 0; i < 3; i++) t.update({ ...f, timestamp: tick++ / 20 });
			return t.roundQuality;
		};
		const narrow = score(10);
		assert.notEqual(narrow, null);
		assert.ok(score(0) > narrow);
	});
}

test('all exercise demonstrations produce bounded scores', () => {
	for (const id of exercises) {
		const t = new Tracker(id);
		let tick = 0;
		for (const f of demoFrames(id))
			for (let n = 0; n < 2; n++) t.update({ ...f, timestamp: tick++ / 20 });
		assert.ok(Number.isInteger(t.roundQuality) && t.roundQuality > 0 && t.roundQuality <= 100, id);
	}
});
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
test('front-facing forward reach counts, lateral shoulder-height reach does not', () => {
	const [closed, raised] = demoFrames('front-jack');
	for (const side of ['left', 'right']) {
		const p = raised.points;
		p[`${side}_elbow`].x = p[`${side}_shoulder`].x;
		p[`${side}_wrist`].x = p[`${side}_shoulder`].x;
	}
	assert.equal(reps('front-jack', [closed, raised, closed]), 1);
	raised.points.left_wrist.x += 38;
	raised.points.right_wrist.x -= 38;
	assert.equal(reps('front-jack', [closed, raised, closed]), 0);
});
test('sit-up with extended legs requires sitting up and returning to the floor', () => {
	const poses = demoFrames('sit-up');
	for (const { points: p } of poses)
		for (const side of ['left', 'right']) p[`${side}_knee`].y = p[`${side}_hip`].y;
	assert.equal(reps('sit-up', poses.slice(0, 2)), 0);
	assert.equal(reps('sit-up', poses), 1);
});
test('straightening before burpee takeoff does not cancel the rep or replace the jump', () => {
	const poses = demoFrames('burpee');
	poses.splice(5, 0, poses[0]);
	assert.equal(reps('burpee', poses), 1);
	assert.equal(
		reps(
			'burpee',
			poses.filter((_, i) => i !== 6)
		),
		0
	);
	poses.splice(5, 0, ...Array(12).fill(poses[0]));
	assert.equal(reps('burpee', poses), 0);
});
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
