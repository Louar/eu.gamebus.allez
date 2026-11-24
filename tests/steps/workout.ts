import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import type { ExerciseId, PoseFrame } from '../../src/lib/motion';

const { Given, When, Then, BeforeScenario, AfterScenario } = createBdd();
type Replay = {
	now(): number;
	epoch(): number;
	advance(seconds: number): void;
	frame(frame: PoseFrame, epoch?: number): void;
	visibility(hidden: boolean): void;
};
// This type belongs only to the test runner; production builds expose no replay API.
type ReplayWindow = typeof window & { __alez: Replay };
const violations = new WeakMap<Page, string[]>();
const oldRequest = new WeakMap<Page, number>();
const copied = new WeakMap<Page, string>();
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const stage = (page: Page, name: string) =>
	expect(page.getByTestId('stage')).toHaveAttribute('data-stage', name);

BeforeScenario(async ({ page, baseURL }) => {
	const problems: string[] = [];
	violations.set(page, problems);
	await page.addInitScript(() => {
		navigator.mediaDevices.getUserMedia = () => {
			document.documentElement.dataset.cameraRequested = 'true';
			return Promise.reject(new Error('Unexpected camera request during detector replay'));
		};
	});
	page.on('pageerror', (error) => problems.push(error.message));
	page.on('response', (response) => {
		if (response.status() >= 400 && response.request().resourceType() !== 'document') {
			problems.push(`${response.status()} ${response.url()}`);
		}
	});
	await page.route('**/*', async (route) => {
		const request = route.request();
		if (new URL(request.url()).pathname.includes('/models/')) {
			problems.push(`Unexpected model fetch in replay: ${request.url()}`);
		}
		if (!request.url().startsWith(baseURL!) || !['HEAD', 'GET'].includes(request.method())) {
			problems.push(`${request.method()} ${request.url()}`);
			await route.abort();
		} else await route.continue();
	});
});
AfterScenario(async ({ page }) => {
	await expect(page.locator('html')).not.toHaveAttribute('data-camera-requested', 'true');
	expect(violations.get(page), 'Only local static GET/HEAD requests; no browser errors').toEqual(
		[]
	);
});

async function openCircuit(page: Page, steps: unknown[], options: Record<string, unknown> = {}) {
	const link = Buffer.from(JSON.stringify({ v: 1, steps, ...options })).toString('base64url');
	await page.goto(`?workout=${link}`);
	await expect(button(page, 'Start workout')).toBeVisible();
}
async function advance(page: Page, seconds: number) {
	await page.evaluate((seconds) => (window as ReplayWindow).__alez.advance(seconds), seconds);
}
async function start(page: Page, dutch = false) {
	await button(page, dutch ? 'Start training' : 'Start workout').click();
	await stage(page, 'countdown');
	await advance(page, 3);
	await stage(page, 'exercise');
}
async function poses(exercise: string) {
	const { demoFrames } = await import('../../src/lib/motion');
	return demoFrames(exercise as ExerciseId);
}
async function replay(page: Page, poses: PoseFrame[], repetitions = 4, epoch?: number) {
	await page.evaluate(
		({ poses, repetitions, epoch }) => {
			const replay = (window as ReplayWindow).__alez;
			let now = replay.now();
			for (const pose of poses) {
				for (let i = 0; i < repetitions; i++) {
					now += 0.05;
					replay.frame({ ...pose, timestamp: now }, epoch);
				}
			}
		},
		{ poses, repetitions, epoch }
	);
}

Given(
	'my circuit prescribes {int} reps of {string}',
	async ({ page }, reps: number, exercise: string) => {
		await openCircuit(page, [{ exercise, reps }]);
	}
);
Given(
	'my circuit prescribes {int} seconds held in {string}',
	async ({ page }, hold: number, exercise: string) => {
		await openCircuit(page, [{ exercise, hold }]);
	}
);
Given(
	'my circuit prescribes {int} seconds of {string}',
	async ({ page }, duration: number, exercise: string) => {
		await openCircuit(page, [{ exercise, duration }]);
	}
);
Given(
	'a {int}-second circuit prescribing {int} reps of {string}',
	async ({ page }, duration: number, reps: number, exercise: string) => {
		await openCircuit(page, [{ exercise, reps }], { repeat: { duration } });
	}
);
Given(
	'two successive squat intervals of {int} and {int} seconds',
	async ({ page }, a: number, b: number) => {
		await openCircuit(
			page,
			[a, b].map((duration) => ({ exercise: 'squat', duration }))
		);
	}
);
Given(
	'two rounds of one squat, one jumping-jack, a 4-second rest and one sit-up with 2 seconds between exercises',
	async ({ page }) => {
		await openCircuit(
			page,
			[
				{ exercise: 'squat', reps: 1 },
				{ exercise: 'jumping-jack', reps: 1 },
				{ rest: 4 },
				{ exercise: 'sit-up', reps: 1 }
			],
			{ repeat: { rounds: 2 }, rest: 2 }
		);
	}
);
When('I start the workout after practice', async ({ page }) => {
	await button(page, 'Start workout').click();
	await stage(page, 'practice');
	await start(page);
});
When('I perform {int} cycle(s) of {string}', async ({ page }, cycles: number, exercise: string) => {
	const frames = await poses(exercise);
	for (let i = 0; i < cycles; i++) await replay(page, frames);
});
When('I hold {string} for {int} seconds', async ({ page }, exercise: string, seconds: number) => {
	await replay(page, [(await poses(exercise))[0]], seconds * 20);
});
When('I do a burpee without the {string}', async ({ page }, phase: string) => {
	const frames = await poses('burpee');
	await replay(
		page,
		frames.filter((_, index) => index !== (phase === 'jump' ? 5 : 2))
	);
});
When('I start a squat without returning to standing', async ({ page }) => {
	await replay(page, (await poses('squat')).slice(0, -1));
});
When('I return to standing', async ({ page }) => {
	await replay(page, [(await poses('squat'))[0]]);
});
When('the camera loses my pose', async ({ page }) => {
	await replay(page, [{ ...(await poses('squat'))[0], missing: true, points: {} }], 6);
});
When('{int} seconds pass', async ({ page }, seconds: number) => {
	await advance(page, seconds);
});
Then('the counter reads {string}', async ({ page }, text: string) => {
	await expect(page.getByTestId('counter')).toContainText(text);
});
Then('the interval repetition count reads {string}', async ({ page }, text: string) => {
	await expect(page.getByTestId('counter').locator('..').getByRole('strong')).toHaveText(text);
});
Then('I see feedback {string}', async ({ page }, text: string) => {
	await expect(page.getByTestId('feedback')).toContainText(text);
});
Then('the circuit clock shows {string}', async ({ page }, text: string) => {
	await expect(page.getByTestId('circuit-clock')).toContainText(text);
});
Then('a {int}-second rest precedes {string}', async ({ page }, seconds: number, next: string) => {
	await stage(page, 'rest');
	await expect(page.getByTestId('rest-clock')).toContainText(
		`00:${String(seconds).padStart(2, '0')}`
	);
	await expect(page.getByTestId('next')).toContainText(new RegExp(next, 'i'));
});
Then('I see the summary with {int} result(s)', async ({ page }, results: number) => {
	await stage(page, 'summary');
	await expect(page.getByTestId('result')).toHaveCount(results);
});
Then('the result includes {string}', async ({ page }, text: string) => {
	await expect(page.getByTestId('result')).toContainText(text);
});
When('I background the page for {int} seconds', async ({ page }, seconds: number) => {
	await page.evaluate((seconds) => {
		const replay = (window as ReplayWindow).__alez;
		replay.visibility(true);
		replay.advance(seconds);
		replay.visibility(false);
	}, seconds);
	if (await button(page, 'Resume').isVisible()) await button(page, 'Resume').click();
});
When('I pause the workout for {int} seconds', async ({ page }, seconds: number) => {
	await button(page, 'Pause').click();
	await advance(page, seconds);
	await button(page, 'Resume').click();
});
When('I remember the current detector request', async ({ page }) => {
	oldRequest.set(page, await page.evaluate(() => (window as ReplayWindow).__alez.epoch()));
});
When('the old request delivers a complete squat', async ({ page }) => {
	await replay(page, await poses('squat'), 4, oldRequest.get(page));
});
Given('I open a malformed link', async ({ page }) => {
	await page.goto('?workout=!!!');
});
Given('I open setup without a workout link', async ({ page }) => {
	await page.goto('./');
});
Then('setup offers both local models', async ({ page }) => {
	const model = page.getByRole('combobox', { name: 'Model', exact: true });
	await expect(model).toBeVisible();
	await model.click();
	await expect(page.getByRole('option')).toHaveText([/MediaPipe.*Full/i, /MoveNet.*Thunder/i]);
	await page.keyboard.press('Escape');
	await expect(page.locator('html')).not.toHaveAttribute('data-camera-requested', 'true');
});
Then('the model and runtime files are served under the repository path', async ({ request }) => {
	const files = [
		'models/mediapipe/full.task',
		'models/mediapipe/wasm/vision_wasm_internal.wasm',
		'models/movenet/model.json',
		...Array.from({ length: 3 }, (_, i) => `models/movenet/group1-shard${i + 1}of3.bin`)
	];
	for (const file of files) {
		const response = await request.head(file);
		expect(response.status(), file).toBe(200);
		expect(Number(response.headers()['content-length']), file).toBeGreaterThan(1000);
		if (file.endsWith('.wasm')) expect(response.headers()['content-type']).toBe('application/wasm');
		await response.dispose();
	}
});
When('I practise {string}', async ({ page }, exercise: string) => {
	await button(page, 'Start workout').click();
	await stage(page, 'practice');
	await page.getByRole('combobox', { name: 'Practice exercise', exact: true }).click();
	await page
		.getByRole('option')
		.and(page.locator(`[data-value="${exercise}"]`))
		.click();
});
When('I leave practice and start the countdown', async ({ page }) => {
	await start(page);
});
Given(
	'my screen is {int} by {int} and I prefer reduced motion',
	async ({ page }, width: number, height: number) => {
		await page.setViewportSize({ width, height });
		await page.emulateMedia({ reducedMotion: 'reduce' });
	}
);
Then('I can see the squat key poses without obscuring my counter', async ({ page }) => {
	const guide = page.getByRole('figure', { name: 'Movement guide' });
	await expect(guide).toBeVisible();
	const poses = guide.locator('svg');
	await expect(poses).toHaveCount(3);
	for (const pose of await poses.all()) await expect(pose.locator('line').first()).toBeVisible();
	const counter = page.getByTestId('counter');
	await expect(counter).toBeVisible();
	const [a, b] = await Promise.all([guide.boundingBox(), counter.boundingBox()]);
	expect(
		a &&
			b &&
			(a.x + a.width <= b.x ||
				b.x + b.width <= a.x ||
				a.y + a.height <= b.y ||
				b.y + b.height <= a.y)
	).toBe(true);
});
Then('setup shows a link error and an edit action', async ({ page }) => {
	await expect(page.getByRole('alert')).toContainText(/link|workout/i);
	await expect(button(page, 'Edit circuit')).toBeVisible();
});
When(
	'I change the first target to {int} and copy the workout link',
	async ({ page, context, baseURL }, target: number) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await button(page, 'Edit circuit').click();
		await page.getByLabel('Target 1', { exact: true }).fill(String(target));
		await button(page, 'Done editing').click();
		await button(page, 'Copy workout link').click();
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toContain(`${baseURL}workouts/`);
		const url = new URL(await page.evaluate(() => navigator.clipboard.readText()));
		expect(url.pathname).toBe(
			`${new URL(baseURL!).pathname}workouts/${url.pathname.split('/').at(-2)}/`
		);
		expect(url.pathname.split('/').at(-2)).toMatch(/^[\w-]+$/);
		expect(url.searchParams.has('workout')).toBe(false);
		copied.set(page, url.href);
	}
);
When('I open the copied workout link', async ({ page }) => {
	await page.goto(copied.get(page)!);
	await page.getByRole('link', { name: 'Back to setup', exact: true }).click();
});
Then(
	'the editable target is {int} reps of {string}',
	async ({ page }, target: number, exercise: string) => {
		await button(page, 'Edit circuit').click();
		await expect(page.getByLabel('Target 1', { exact: true })).toHaveValue(String(target));
		await page.getByRole('combobox', { name: 'Exercise 1', exact: true }).click();
		await expect(page.getByRole('option', { selected: true })).toHaveAttribute(
			'data-value',
			exercise
		);
		await page.keyboard.press('Escape');
		await page.getByRole('combobox', { name: 'Target type 1', exact: true }).click();
		await expect(page.getByRole('option', { selected: true })).toHaveAttribute(
			'data-value',
			'reps'
		);
		await page.keyboard.press('Escape');
	}
);
When('I switch setup to Dutch', async ({ page }) => {
	await button(page, 'Nederlands').click();
	await expect(page.getByRole('heading', { name: 'Trainingsstudio' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
});
When('I open Dutch practice for {string}', async ({ page }, exercise: string) => {
	await button(page, 'Start training').click();
	await stage(page, 'practice');
	await page.getByRole('combobox', { name: 'Oefening uitproberen', exact: true }).click();
	await page
		.getByRole('option')
		.and(page.locator(`[data-value="${exercise}"]`))
		.click();
});
Then('the practice counter shows one repetition', async ({ page }) => {
	await expect(page.getByTestId('counter')).toContainText(/\b1\b/);
});
When('I start the Dutch workout', async ({ page }) => {
	await start(page, true);
});
Then('I can pause and resume in Dutch', async ({ page }) => {
	await button(page, 'Pauzeren').click();
	await button(page, 'Hervatten').click();
	await expect(button(page, 'Afronden')).toBeVisible();
});
Then('the Dutch summary reports the squat result', async ({ page }) => {
	await expect(page.getByTestId('result')).toContainText('2 / 2');
	await expect(page.getByTestId('stage')).toContainText(/ronde/i);
});
