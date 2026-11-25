import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { decodeWorkout, example } from '../../src/lib/workout';

const { Given, When, Then } = createBdd();
const circuit = (page: Page) => page.getByRole('list', { name: 'Your circuit', exact: true });
const handle = (page: Page, n: number) =>
	page.getByRole('button', { name: `Reorder step ${n}`, exact: true });

Given('I open the focused session planner', async ({ page }) => {
	await page.goto('./');
	await expect(circuit(page)).toBeVisible();
});

Then('only the planner and language controls are shown', async ({ page }) => {
	await expect(page.locator('header, nav, footer')).toHaveCount(0);
	await expect(page.getByText('Workout studio', { exact: true })).toHaveCount(0);
	for (const name of ['English', 'Nederlands']) {
		await expect(page.getByRole('radio', { name, exact: true })).toBeVisible();
	}
	for (const name of ['Prepare offline', 'Start workout']) {
		await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
	}
	await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toBeVisible();
	await expect(page.getByText('Private by design', { exact: true })).toBeVisible();
	await expect(page.getByRole('switch', { name: 'Sound cues' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Copy workout link' })).toHaveCount(0);
	await expect(handle(page, 1)).toHaveCount(0);
	await expect(circuit(page)).toHaveAttribute('tabindex', '-1');
	const planner = page.getByRole('region', { name: 'Session planner' });
	await expect(planner.getByRole('button', { name: 'Start workout' })).toBeVisible();
	const logo = page.getByRole('img', { name: 'Alez' });
	await expect(logo).toBeVisible();
	expect((await logo.boundingBox())!.height).toBeLessThanOrEqual(32);
});

When('I move the first planner step down with the keyboard', async ({ page }) => {
	await page.getByRole('button', { name: 'Edit circuit' }).click();
	await handle(page, 1).focus();
	await page.keyboard.press('Space');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Space');
	await expect(circuit(page).locator('[data-row]').first()).toHaveAttribute('data-row', '2');
	await page.getByRole('button', { name: 'Done editing' }).click();
	await expect(handle(page, 1)).toHaveCount(0);
});

Then('planner inputs show time and repetition suffixes', async ({ page }) => {
	await expect(
		circuit(page).locator('[data-row]').first().locator('[data-slot="badge"]')
	).toHaveText('5 ×');
	await expect(page.getByText('Rounds', { exact: true }).locator('+ dd')).toHaveText('03');
	await page.getByRole('button', { name: 'Edit circuit' }).click();
	const suffix = (input: ReturnType<Page['getByRole']>) =>
		input.locator('..').locator('[data-slot="input-group-addon"][data-align="inline-end"]');
	await expect(suffix(page.getByRole('spinbutton', { name: 'Rounds', exact: true }))).toHaveText(
		'×'
	);
	await expect(
		suffix(page.getByRole('spinbutton', { name: 'Rest between exercises', exact: true }))
	).toHaveText('s');
	for (const [i, unit] of ['×', 's', 's', 's', '×'].entries()) {
		await expect(
			suffix(circuit(page).locator('[data-row]').nth(i).getByRole('spinbutton'))
		).toHaveText(unit);
	}
	await page.getByRole('combobox', { name: 'Repeat mode', exact: true }).click();
	await page.getByRole('option', { name: 'Time limit', exact: true }).click();
	await expect(
		suffix(page.getByRole('spinbutton', { name: 'Circuit time', exact: true }))
	).toHaveText('s');
	await expect(page.getByText(/\(seconds\)/)).toHaveCount(0);
});

When('I drag the first planner step below the second on a narrow screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'Edit circuit' }).click();
	const source = (await handle(page, 1).boundingBox())!;
	const target = (await handle(page, 2).boundingBox())!;
	await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
	await expect(circuit(page).locator('[data-row]').first()).toHaveAttribute('data-row', '2');
	await page.mouse.up();
	await page.getByRole('button', { name: 'Done editing' }).click();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

Then('the mobile start action stays visible while scrolling the planner', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 600 });
	const footer = page.getByTestId('planner-start');
	const start = page.getByRole('button', { name: 'Start workout', exact: true });
	await expect(footer).toHaveCSS('position', 'fixed');
	await expect(start).toBeInViewport({ ratio: 1 });
	await page.getByText('Private by design', { exact: true }).scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
	await expect(start).toBeInViewport({ ratio: 1 });
	const box = (await footer.boundingBox())!;
	expect(box.y + box.height).toBeCloseTo(600, 0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(footer).toHaveCSS('position', 'static');
});

Then('starting the workout preserves the reordered steps', async ({ page }) => {
	await page.getByRole('button', { name: 'Start workout', exact: true }).click();
	await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
	const encoded = new URL(page.url()).pathname.split('/').at(-2)!;
	const steps = [...example.steps];
	[steps[0], steps[1]] = [steps[1], steps[0]];
	expect(decodeWorkout(encoded).steps).toEqual(steps);
});
