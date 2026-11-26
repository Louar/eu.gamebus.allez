import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { decodeWorkout, encodeWorkout } from '../../src/lib/workout';

const { Given, When, Then } = createBdd();
const paths = new WeakMap<Page, string>();
const enable = (page: Page) =>
	page.getByRole('button', { name: 'Enable camera to start', exact: true });
const start = (page: Page) => page.getByRole('button', { name: 'Start workout', exact: true });
const preview = (page: Page) => page.getByTestId('workout-preview');
const segment = (url: URL) => url.pathname.split('/').at(-2)!;

Given('I edit the minimal planner to prescribe 17 squats', async ({ page }) => {
	expect((await page.goto('./'))?.status()).toBe(200);
	await page.getByRole('button', { name: 'Edit circuit' }).click();
	await page.getByLabel('Target 1', { exact: true }).fill('17');
	await page.getByRole('button', { name: 'Done editing' }).click();
	await page.getByRole('combobox', { name: 'Model', exact: true }).click();
	await page.getByRole('option', { name: /MoveNet.*Thunder/i }).click();
});

When('I start from the planner and share the address-bar link', async ({ page }) => {
	await start(page).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
	paths.set(page, page.url());
});

Then('the workout URL contains the edited prescription and settings', async ({ page, baseURL }) => {
	const url = new URL(paths.get(page)!);
	await expect(page).toHaveURL(url.href);
	expect(url.href).toBe(`${baseURL}workouts/${segment(url)}/${url.search}`);
	expect(decodeWorkout(segment(url)).steps[0]).toEqual({ exercise: 'squat', reps: 17 });
	expect(url.searchParams.get('model')).toBe('movenet');
	expect(url.searchParams.has('workout')).toBe(false);
});

Given('I open a minimal timed squat link as a new visitor', async ({ page, baseURL }) => {
	const encoded = encodeWorkout({ v: 1, steps: [{ exercise: 'squat', duration: 15 }] });
	const url = `${baseURL}workouts/${encoded}/`;
	paths.set(page, url);
	expect((await page.goto(url))?.status()).toBe(404);
	await expect(page).toHaveURL(url);
});

Given('I open a minimal squat link with a 45-second workout limit', async ({ page, baseURL }) => {
	const encoded = encodeWorkout({
		v: 1,
		steps: [{ exercise: 'squat', duration: 15 }],
		rest: 0,
		repeat: { duration: 45 }
	});
	await page.goto(`${baseURL}workouts/${encoded}/`);
});

Then('the workout status shows only the countdown and current round', async ({ page }) => {
	const rounds = page.getByTestId('round-control');
	const clock = page.getByTestId('circuit-clock');
	await expect(rounds).toHaveText('1');
	await expect(rounds).toHaveJSProperty('tagName', 'SPAN');
	await expect(clock).toHaveText('00:45');
	await expect(clock.locator('svg.lucide-hourglass')).toHaveCount(1);
	await expect(page.getByTestId('workout-clock')).toHaveCount(0);
	expect(
		await clock.evaluate((node) => ({
			previous: node.previousElementSibling?.getAttribute('aria-label'),
			next: node.nextElementSibling?.getAttribute('data-testid')
		}))
	).toEqual({ previous: 'Pause', next: 'round-control' });
	await expect(page.getByTestId('session-controls')).toBeInViewport({ ratio: 1 });
	await page.evaluate(() =>
		(window as typeof window & { __alez: { advance(s: number): void } }).__alez.advance(15)
	);
	await expect(rounds).toHaveText('2');
	await expect(clock).toHaveText('00:30');
});

When('I reload the shared workout path', async ({ page }) => {
	const response = await page.reload();
	expect(response).not.toBeNull();
	expect(response!.status()).toBe(response!.fromServiceWorker() ? 200 : 404);
	await expect(page).toHaveURL(paths.get(page)!);
});

Then('I can preview 17 squats before enabling the camera', async ({ page }) => {
	await expect(preview(page).getByRole('listitem').first()).toHaveText(/squat.*17/is);
	await expect(enable(page)).toBeVisible();
	await expect(page.locator('video')).toHaveCount(0);
});

Then('I can preview the timed squat before enabling the camera', async ({ page }) => {
	await expect(preview(page).getByRole('listitem')).toHaveText(/squat.*15/is);
	await expect(enable(page)).toBeVisible();
	await expect(page.locator('video')).toHaveCount(0);
});

Given('I open minimal workouts without a prescription', async ({ page }) => {
	expect((await page.goto('workouts/'))?.status()).toBe(200);
});

Then(
	'different random draws at the bare workout path produce different exercise lists',
	async ({ page }) => {
		await page.addInitScript(() => {
			if (location.pathname.endsWith('/workouts/')) {
				const draw = Number(new URLSearchParams(location.search).get('draw'));
				Math.random = () => draw;
			}
		});
		const draws = [];
		for (const draw of [0.1, 0.9]) {
			await page.goto(`workouts/?draw=${draw}`);
			await expect(enable(page)).toBeVisible();
			const workout = decodeWorkout(segment(new URL(page.url())));
			draws.push(workout.steps.filter((s) => 'exercise' in s).map((s) => s.exercise));
		}
		expect(draws[0]).not.toEqual(draws[1]);
	}
);

Then('I get a shareable circuit with three exercises', async ({ page, baseURL }) => {
	await expect(enable(page)).toBeVisible();
	const url = new URL(page.url());
	expect(url.href).toBe(`${baseURL}workouts/${segment(url)}/`);
	const workout = decodeWorkout(segment(url));
	expect(workout).toMatchObject({ repeat: { rounds: 1 }, rest: 15 });
	expect(workout.steps).toHaveLength(3);
	expect(new Set(workout.steps.filter((s) => 'exercise' in s).map((s) => s.exercise)).size).toBe(3);
	paths.set(page, url.href);
});

Then('the generated circuit remains available for practice', async ({ page }) => {
	const steps = decodeWorkout(segment(new URL(paths.get(page)!))).steps;
	await expect(preview(page).getByRole('listitem')).toHaveCount(steps.length);
	await enable(page).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
});

Given('I visit a minimal workout path with invalid encoding', async ({ page }) => {
	expect((await page.goto('workouts/!bad!/'))?.status()).toBe(404);
});

Then('I can return from the link error to the minimal planner', async ({ page, baseURL }) => {
	await expect(page.getByRole('alert')).toContainText(/workout|link/i);
	await expect(enable(page)).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to setup' }).click();
	await expect(page).toHaveURL(baseURL!);
	await expect(start(page)).toBeVisible();
});

When('I enable the workout camera and start the countdown', async ({ page }) => {
	await enable(page).click();
	await expect(page.getByRole('combobox', { name: 'Practice exercise' })).toHaveText(/squat/i);
	await start(page).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'countdown');
	await page.evaluate(() =>
		(window as typeof window & { __alez: { advance(s: number): void } }).__alez.advance(3)
	);
});

When('I enable the camera for practice', async ({ page }) => {
	await enable(page).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
});

Then('the practice cards and controls fit the viewport', async ({ page }) => {
	for (const id of ['session-controls', 'current-exercise', 'exercise-progress']) {
		await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
	}
	await expect(page.getByRole('figure', { name: 'Movement guide' })).toBeVisible();
	await expect(page.getByTestId('current-exercise')).not.toContainText('Movement guide');
	const viewport = page.viewportSize()!;
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		viewport.width
	);
	const exercise = (await page.getByTestId('current-exercise').boundingBox())!;
	const progress = (await page.getByTestId('exercise-progress').boundingBox())!;
	if (viewport.width <= 900) {
		expect(exercise.x + exercise.width).toBeLessThanOrEqual(progress.x);
		expect(exercise.y).toBeCloseTo(progress.y, 0);
		const heading = (await page
			.getByTestId('current-exercise')
			.getByRole('heading')
			.boundingBox())!;
		const guide = (await page.getByRole('figure', { name: 'Movement guide' }).boundingBox())!;
		expect(guide.x).toBeGreaterThanOrEqual(heading.x + heading.width);
		expect(exercise.height).toBeLessThan(160);
	} else {
		expect(exercise.y + exercise.height).toBeLessThanOrEqual(progress.y);
		expect(exercise.x).toBeGreaterThan(viewport.width / 2);
	}
	const controls = page.getByTestId('session-controls');
	await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
	await expect(controls.getByRole('combobox')).toHaveCount(0);
	await expect(controls.getByRole('button', { name: 'Start workout', exact: true })).toHaveText(
		'Start workout'
	);
	const picker = page
		.getByTestId('current-exercise')
		.getByRole('combobox', { name: 'Practice exercise' });
	await expect(picker).toBeVisible();
	const headingSize = await picker
		.locator('..')
		.evaluate((node) => getComputedStyle(node).fontSize);
	await expect(picker).toHaveCSS('font-size', headingSize);
	await picker.click();
	await page.getByRole('option', { name: 'Jumping-jack', exact: true }).click();
	await expect(picker).toHaveText('Jumping-jack');
	await expect(page.getByTestId('counter')).toHaveText('0');
	for (const button of await controls.getByRole('button').all()) {
		const radii = await button.evaluate((node) => {
			const card = node.closest('[data-testid="session-controls"]')!;
			return {
				inner: parseFloat(getComputedStyle(node).borderTopRightRadius),
				outer: parseFloat(getComputedStyle(card).borderTopRightRadius),
				padding: parseFloat(getComputedStyle(card).paddingTop)
			};
		});
		expect(radii.inner).toBeCloseTo(radii.outer - radii.padding);
	}
});

Then('the immersive timed workout HUD fits the viewport', async ({ page }) => {
	const stage = page.getByTestId('stage');
	await expect(stage).toHaveAttribute('data-stage', 'exercise');
	await expect(stage).toHaveAttribute('data-immersive', 'true');
	await expect(page.getByTestId('counter')).toContainText('00:15');
	const viewport = page.viewportSize()!;
	const video = page.locator('video');
	await expect(video).toHaveCSS('object-fit', 'contain');
	const box = await video.boundingBox();
	expect(box?.width).toBeCloseTo(viewport.width, 0);
	expect(box?.height).toBeCloseTo(viewport.height, 0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		viewport.width
	);
	for (const item of [
		page.getByTestId('counter'),
		page.getByTestId('current-exercise'),
		page.getByTestId('exercise-progress'),
		page.getByRole('button', { name: 'Pause', exact: true })
	]) {
		await expect(item).toBeInViewport({ ratio: 1 });
	}
	await expect(page.getByTestId('current-exercise')).toContainText('Current exercise');
	await expect(page.getByTestId('current-exercise')).not.toContainText(/Round|Step|Movement guide/);
	await expect(page.getByTestId('exercise-progress')).not.toContainText('Workout time');
	await expect(page.getByTestId('tracking-warning')).toHaveCount(0);
	const toolbarItems = await page
		.getByTestId('session-controls')
		.locator('button, .session-time')
		.all();
	const toolbar = (await page.getByTestId('session-controls').boundingBox())!;
	for (const item of toolbarItems) {
		const bounds = (await item.boundingBox())!;
		expect(bounds.y + bounds.height / 2).toBeCloseTo(toolbar.y + toolbar.height / 2, 0);
	}
	const exercise = (await page.getByTestId('current-exercise').boundingBox())!;
	const progress = (await page.getByTestId('exercise-progress').boundingBox())!;
	if (viewport.width <= 900) {
		expect(exercise.x + exercise.width).toBeLessThanOrEqual(progress.x);
		expect(exercise.y).toBeCloseTo(progress.y, 0);
		const heading = (await page
			.getByTestId('current-exercise')
			.getByRole('heading')
			.boundingBox())!;
		const guide = (await page.getByRole('figure', { name: 'Movement guide' }).boundingBox())!;
		expect(guide.x).toBeGreaterThanOrEqual(heading.x + heading.width);
		expect(exercise.height).toBeLessThan(160);
		expect(exercise.width).toBeCloseTo(progress.width, 0);
	} else {
		expect(exercise.y + exercise.height).toBeLessThanOrEqual(progress.y);
		expect(exercise.x).toBeCloseTo(progress.x, 0);
		expect(exercise.x).toBeGreaterThan(viewport.width / 2);
	}
});

Then('rounds are read-only and I can inspect the circuit while paused', async ({ page }) => {
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	const rounds = page.getByTestId('round-control');
	await expect(rounds).toHaveText('1/1');
	await expect(rounds).toHaveJSProperty('tagName', 'SPAN');
	await rounds.click();
	await expect(pause).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByTestId('circuit-clock')).toHaveCount(0);
	await expect(page.getByTestId('workout-clock').locator('svg.lucide-timer')).toHaveCount(1);
	await page.getByTestId('step-control').click();
	await expect(pause).toHaveAttribute('aria-pressed', 'true');
	const circuit = page.getByRole('dialog', { name: 'Your circuit' });
	await expect(circuit.getByRole('listitem')).toHaveCount(1);
	await expect(circuit.getByRole('listitem')).toContainText('Squat');
	await expect(circuit.locator('[aria-current="step"]')).toHaveCount(1);
	await expect(circuit.locator('input, [role="combobox"]')).toHaveCount(0);
	await page.evaluate(() =>
		(window as typeof window & { __alez: { advance(s: number): void } }).__alez.advance(30)
	);
	await expect(page.getByTestId('counter')).toContainText('00:15');
	await page.keyboard.press('Escape');
	await pause.click();
	await page.getByRole('menuitem', { name: 'Resume', exact: true }).click();
	await page.evaluate(() =>
		(window as typeof window & { __alez: { advance(s: number): void } }).__alez.advance(15)
	);
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'summary');
});

Then(
	'I can toggle workout sound while paused and keep the setting for the next start',
	async ({ page }) => {
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		const sound = page.getByRole('menuitemcheckbox', { name: 'Sound cues', exact: true });
		const stage = page.getByTestId('stage');
		await expect(sound).toBeChecked();
		await sound.click();
		await expect(sound).not.toBeChecked();
		await expect(stage).toHaveAttribute('data-stage', 'exercise');
		await sound.click();
		await expect(sound).toBeChecked();
		await expect(stage).toHaveAttribute('data-stage', 'exercise');
		await sound.click();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('menu')).toHaveCount(0);
		const pause = page.getByRole('button', { name: 'Pause', exact: true });
		await expect(pause).toHaveAttribute('aria-pressed', 'true');
		await pause.click();
		await page.getByRole('menuitem', { name: 'Finish', exact: true }).click();
		await page.getByRole('button', { name: 'Back to setup', exact: true }).click();
		await start(page).click();
		await expect(stage).toHaveAttribute('data-stage', 'practice');
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		await expect(sound).toHaveAttribute('aria-checked', 'false');
	}
);

Then('a missing static asset returns the Pages 404 document', async ({ request }) => {
	const shell = await request.get('404.html');
	expect(shell.status()).toBe(200);
	const missing = await request.get('missing-script.js');
	expect(missing.status()).toBe(404);
	expect(missing.headers()['content-type']).toContain('text/html');
	expect(await missing.text()).toBe(await shell.text());
});
