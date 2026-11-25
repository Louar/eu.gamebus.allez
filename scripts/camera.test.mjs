import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { setImmediate as settle } from 'node:timers/promises';

const loadDetector = mock.fn();
mock.module('../src/lib/providers.ts', { namedExports: { loadDetector } });
const { camera } = await import('../src/lib/camera.ts');

function scheduler() {
	let next = 0;
	const queue = new Map();
	return {
		queue,
		request(callback) {
			const id = next++;
			queue.set(id, callback);
			return id;
		},
		cancel: mock.fn((id) => queue.delete(id)),
		fire(...args) {
			assert.equal(queue.size, 1);
			const [[id, callback]] = queue;
			queue.delete(id);
			callback(...args);
		}
	};
}

async function setup(t, decoded = true) {
	const frames = scheduler(),
		raf = scheduler();
	const state = { active: true, epoch: 1, now: 2000 };
	const video = { play: async () => {}, currentTime: 0, readyState: 2 };
	if (decoded)
		Object.assign(video, {
			requestVideoFrameCallback: frames.request,
			cancelVideoFrameCallback: frames.cancel
		});
	const track = { stop: mock.fn() };
	const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
	const bitmap = { close: mock.fn() };
	const capture = mock.fn(async () => bitmap);
	const detector = {
		estimate: mock.fn(async (_, timestamp) => ({ timestamp })),
		dispose: mock.fn()
	};
	loadDetector.mock.mockImplementation(async () => detector);
	const receive = mock.fn(),
		error = mock.fn();
	const source = camera(
		video,
		'mediapipe',
		'',
		() => state.active,
		() => state.epoch,
		receive,
		error
	);
	t.after(source.close);
	for (const [key, value] of Object.entries({
		navigator: { mediaDevices: { getUserMedia: async () => stream } },
		performance: { now: () => state.now },
		requestAnimationFrame: raf.request,
		cancelAnimationFrame: raf.cancel,
		createImageBitmap: capture
	})) {
		const original = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, { configurable: true, value });
		t.after(() =>
			original
				? Object.defineProperty(globalThis, key, original)
				: Reflect.deleteProperty(globalThis, key)
		);
	}
	assert.deepEqual(await Promise.all([source.start(), source.start()]), [true, true]);
	const fire = (captureTime = state.now) =>
		frames.fire(state.now, { captureTime, presentationTime: state.now, mediaTime: 0 });
	return {
		source,
		frames,
		fire,
		raf,
		video,
		state,
		capture,
		bitmap,
		detector,
		track,
		receive,
		error
	};
}

test('decoded frames drive inference even with unchanged currentTime; pause skips work', async (t) => {
	const { fire, raf, frames, state, capture, receive } = await setup(t);
	fire(1950);
	assert.equal(frames.queue.size, 0);
	await settle();
	state.active = false;
	fire();
	await settle();
	assert.equal(capture.mock.callCount(), 1);
	state.active = true;
	fire();
	await settle();
	assert.deepEqual(
		receive.mock.calls.map((c) => c.arguments),
		[
			[{ timestamp: 1.95 }, 1],
			[{ timestamp: 2 }, 1]
		]
	);
	assert.equal(raf.queue.size, 0);
});

for (const change of ['pause', 'epoch', 'expired', 'close']) {
	test(`an in-flight estimate cannot overlap or deliver after ${change}`, async (t) => {
		const { source, frames, fire, state, detector, bitmap, receive, track, error } = await setup(t);
		const pending = Promise.withResolvers();
		detector.estimate.mock.mockImplementation(() => pending.promise);
		fire();
		await settle();
		assert.equal(detector.estimate.mock.callCount(), 1);
		assert.equal(frames.queue.size, 0);
		if (change === 'pause') state.active = false;
		if (change === 'epoch') state.epoch++;
		if (change === 'expired') state.now += 650;
		if (change === 'close') source.close();
		assert.equal(detector.dispose.mock.callCount(), 0);
		pending.resolve({ timestamp: 2 });
		await settle();
		assert.equal(bitmap.close.mock.callCount(), 1);
		assert.equal(receive.mock.callCount(), 0);
		assert.equal(error.mock.callCount(), 0);
		assert.equal(frames.queue.size, change === 'close' ? 0 : 1);
		source.close();
		assert.equal(track.stop.mock.callCount(), 1);
		assert.equal(detector.dispose.mock.callCount(), 1);
	});
}

test('late callback and slow bitmap capture do not start stale inference', async (t) => {
	const { fire, state, capture, detector, bitmap } = await setup(t);
	fire(state.now - 651);
	assert.equal(capture.mock.callCount(), 0);
	const pending = Promise.withResolvers();
	capture.mock.mockImplementation(() => pending.promise);
	fire();
	state.now += 650;
	pending.resolve(bitmap);
	await settle();
	assert.equal(detector.estimate.mock.callCount(), 0);
	assert.equal(bitmap.close.mock.callCount(), 1);
});

for (const decoded of [true, false]) {
	test(`close cancels the pending ${decoded ? 'video' : 'animation'} callback, including handle zero`, async (t) => {
		const { source, frames, raf, capture, video } = await setup(t, decoded);
		const scheduler = decoded ? frames : raf;
		const late = scheduler.queue.get(0);
		source.close();
		assert.equal(video.srcObject, null);
		assert.deepEqual(scheduler.cancel.mock.calls[0].arguments, [0]);
		assert.equal((decoded ? raf : frames).cancel.mock.callCount(), 0);
		late(2000, { presentationTime: 2000 });
		assert.equal(capture.mock.callCount(), 0);
		assert.equal(scheduler.queue.size, 0);
	});
}

test('animation fallback only captures ready video when currentTime advances', async (t) => {
	const { raf, capture, video, receive } = await setup(t, false);
	video.readyState = 1;
	raf.fire();
	assert.equal(capture.mock.callCount(), 0);
	video.readyState = 2;
	raf.fire();
	await settle();
	raf.fire();
	assert.equal(capture.mock.callCount(), 1);
	video.currentTime += 0.04;
	raf.fire();
	await settle();
	assert.equal(receive.mock.callCount(), 2);
});
