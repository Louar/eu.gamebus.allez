import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { decodeWorkout, encodeWorkout } from '../../src/lib/workout';

const { Given, When, Then } = createBdd();
const paths = new WeakMap<Page, string>();
const enable = (page: Page) => page.getByRole('button', { name: 'Enable camera', exact: true });
const start = (page: Page) => page.getByRole('button', { name: 'Start workout', exact: true });
const preview = (page: Page) => page.getByTestId('workout-preview');
const segment = (url: URL) => url.pathname.split('/').at(-2)!;

Given('I edit the minimal planner to prescribe 17 squats', async ({ page }) => {
	expect((await page.goto('minimal/'))?.status()).toBe(200);
	await page.getByRole('button', { name: 'Edit circuit' }).click();
	await page.getByLabel('Target 1', { exact: true }).fill('17');
	await page.getByRole('button', { name: 'Done editing' }).click();
	await page.getByRole('combobox', { name: 'Model', exact: true }).click();
	await page.getByRole('option', { name: /MoveNet.*Thunder/i }).click();
});

When(
	'I copy the minimal workout link and start from the planner',
	async ({ page, context, baseURL }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: 'Copy workout link' }).click();
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toContain(`${baseURL}minimal/workouts/`);
		paths.set(page, await page.evaluate(() => navigator.clipboard.readText()));
		await start(page).click();
		await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
	}
);

Then('the workout URL contains the edited prescription and settings', async ({ page }) => {
	await expect(page).toHaveURL(paths.get(page)!);
	const url = new URL(page.url());
	expect(decodeWorkout(segment(url)).steps[0]).toEqual({ exercise: 'squat', reps: 17 });
	expect(url.searchParams.get('model')).toBe('movenet');
	expect(url.searchParams.has('workout')).toBe(false);
});

Given('I open a minimal timed squat link as a new visitor', async ({ page, baseURL }) => {
	const encoded = encodeWorkout({ v: 1, steps: [{ exercise: 'squat', duration: 15 }] });
	const url = `${baseURL}minimal/workouts/${encoded}/`;
	paths.set(page, url);
	expect((await page.goto(url))?.status()).toBe(404);
	await expect(page).toHaveURL(url);
});

When('I reload the shared workout path', async ({ page }) => {
	expect((await page.reload())?.status()).toBe(404);
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
	expect((await page.goto('minimal/workouts/'))?.status()).toBe(200);
});

Then('I get a shareable circuit with three exercises', async ({ page, baseURL }) => {
	await expect(enable(page)).toBeVisible();
	const url = new URL(page.url());
	expect(url.href).toBe(`${baseURL}minimal/workouts/${segment(url)}/`);
	expect(decodeWorkout(segment(url)).steps.filter((s) => 'exercise' in s)).toHaveLength(3);
	paths.set(page, url.href);
});

Then('the generated circuit remains available for practice', async ({ page }) => {
	const steps = decodeWorkout(segment(new URL(paths.get(page)!))).steps;
	await expect(preview(page).getByRole('listitem')).toHaveCount(steps.length);
	await enable(page).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
});

Given('I visit a minimal workout path with invalid encoding', async ({ page }) => {
	expect((await page.goto('minimal/workouts/!bad!/'))?.status()).toBe(404);
});

Then('I can return from the link error to the minimal planner', async ({ page, baseURL }) => {
	await expect(page.getByRole('alert')).toContainText(/workout|link/i);
	await expect(enable(page)).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to setup' }).click();
	await expect(page).toHaveURL(`${baseURL}minimal/`);
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

Then('the immersive timed workout HUD fits the viewport', async ({ page }) => {
	const stage = page.getByTestId('stage');
	await expect(stage).toHaveAttribute('data-stage', 'exercise');
	await expect(stage).toHaveAttribute('data-immersive', 'true');
	await expect(page.getByTestId('counter')).toContainText('00:15');
	const viewport = page.viewportSize()!;
	const video = page.locator('video');
	await expect(video).toHaveCSS('object-fit', 'cover');
	const box = await video.boundingBox();
	expect(box?.width).toBeCloseTo(viewport.width, 0);
	expect(box?.height).toBeCloseTo(viewport.height, 0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		viewport.width
	);
	for (const item of [
		page.getByTestId('counter'),
		page.getByRole('button', { name: 'Pause', exact: true })
	]) {
		await expect(item).toBeInViewport({ ratio: 1 });
	}
});

Then('I can toggle workout sound without interrupting the exercise', async ({ page }) => {
	const sound = page.getByRole('button', { name: 'Sound cues', exact: true });
	const stage = page.getByTestId('stage');
	await expect(sound).toHaveAttribute('aria-pressed', 'false');
	await sound.click();
	await expect(sound).toHaveAttribute('aria-pressed', 'true');
	await expect(stage).toHaveAttribute('data-stage', 'exercise');
	await sound.click();
	await expect(sound).toHaveAttribute('aria-pressed', 'false');
	await expect(stage).toHaveAttribute('data-stage', 'exercise');
	await sound.click();
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('button', { name: 'Back to setup', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: 'Sound cues' })).toBeChecked();
});

Then('a missing static asset returns the Pages 404 document', async ({ request }) => {
	const shell = await request.get('404.html');
	expect(shell.status()).toBe(200);
	const missing = await request.get('missing-script.js');
	expect(missing.status()).toBe(404);
	expect(missing.headers()['content-type']).toContain('text/html');
	expect(await missing.text()).toBe(await shell.text());
});
