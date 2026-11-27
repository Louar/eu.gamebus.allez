import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { decodeWorkout, encodeWorkout } from '../../src/lib/workout';
import { exercises } from '../../src/lib/motion';

const { Given, When, Then } = createBdd();
const circuit = (page: Page) => page.getByRole('list', { name: 'Your circuit', exact: true });
const handle = (page: Page, n: number) =>
	page.getByRole('button', { name: `Reorder step ${n}`, exact: true });

Given('I open the focused session planner', async ({ page }) => {
	await page.goto('./');
	await expect(circuit(page)).toBeVisible();
});

Given('I open a planner URL prescribing only 2 random exercises', async ({ page }) => {
	const encoded = Buffer.from(JSON.stringify({ steps: 2 })).toString('base64url');
	await page.goto(`?workout=${encoded}`);
});

Given(
	'I request a random circuit of {int} steps for two rounds',
	async ({ page }, steps: number) => {
		const encoded = Buffer.from(JSON.stringify({ steps, rounds: 2 })).toString('base64url');
		await page.goto(`?workout=${encoded}`);
	}
);

Then(
	'the planner shows {int} steps drawing from the whole catalog before repeating',
	async ({ page }, count: number) => {
		const rows = circuit(page).getByRole('listitem');
		await expect(rows).toHaveCount(count);
		const names = await rows.evaluateAll((items) =>
			items.map((item) => item.getAttribute('aria-label'))
		);
		expect(new Set(names.slice(0, exercises.length)).size).toBe(Math.min(count, exercises.length));
		for (let i = 0; i < count; i++) expect(names[i]).not.toBe(names[(i + 1) % count]);
	}
);

Then('the planner warns that the workout link is invalid', async ({ page }) => {
	await expect(page.getByText(/This workout link could not be opened/)).toBeVisible();
});

Then(
	'I can search the ordered exercise categories and choose a result with the keyboard',
	async ({ page }) => {
		await page.getByRole('button', { name: 'Edit circuit' }).click();
		const picker = page.getByRole('button', { name: 'Exercise 1', exact: true });
		await picker.press('Enter');
		const dialog = page.getByRole('dialog', { name: 'Exercise 1' });
		const groups = dialog.getByRole('listbox').getByRole('group');
		const expected = {
			'Upper body': ['push-up', 'plank', 'burpee'],
			'Lower body': [
				'glute-bridge',
				'squat',
				'squat-hold',
				'reverse-lunge',
				'forward-lunge',
				'pogo-jump',
				'squat-jump'
			],
			Core: ['dead-bug', 'heel-tap', 'glute-bridge', 'plank', 'sit-up', 'bicycle-crunch'],
			'Full body': ['front-jack', 'jumping-jack', 'burpee'],
			Cardio: ['front-jack', 'jumping-jack', 'pogo-jump', 'squat-jump', 'burpee'],
			Stability: [
				'glute-bridge',
				'dead-bug',
				'squat-hold',
				'plank',
				'reverse-lunge',
				'forward-lunge'
			]
		};
		await expect(groups).toHaveCount(6);
		for (const [i, [category, ids]] of Object.entries(expected).entries()) {
			await expect(groups.nth(i)).toHaveAccessibleName(category);
			expect(
				await groups
					.nth(i)
					.getByRole('option')
					.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-exercise')))
			).toEqual(ids);
		}
		const search = dialog.getByRole('combobox', { name: 'Search exercises or categories' });
		await expect(search).toBeFocused();
		await search.fill('no such exercise');
		await expect(dialog.getByRole('status')).toHaveText('No matching exercises.');
		await search.fill('dead bug');
		await expect(dialog.getByRole('option')).toHaveCount(2);
		await search.press('ArrowDown');
		await search.press('Enter');
		await expect(picker).toHaveAttribute('data-exercise', 'dead-bug');
		await expect(picker).toBeFocused();
		await picker.click();
		await expect(search).toHaveValue('');
		await search.press('Escape');
		await expect(picker).toBeFocused();
	}
);

Then('I can search the Dutch exercise picker for opdrukken', async ({ page }) => {
	await page.getByRole('button', { name: 'Circuit bewerken' }).click();
	const picker = page.getByRole('button', { name: 'Oefening 1', exact: true });
	await picker.click();
	const search = page.getByRole('combobox', { name: 'Zoek oefeningen of categorieën' });
	await search.fill('BOVENLICHAAM');
	await expect(page.getByRole('option')).toHaveCount(3);
	await search.fill('opdruk');
	await page.getByRole('option', { name: 'Opdrukken' }).click();
	await expect(picker).toHaveText('Opdrukken');
});

Then(
	'the planner offers two distinct exercises for one round with 15 seconds of rest',
	async ({ page }) => {
		const rows = circuit(page).getByRole('listitem');
		await expect(rows).toHaveCount(2);
		await page.getByRole('button', { name: 'Start workout', exact: true }).click();
		await expect(page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
		const workout = decodeWorkout(new URL(page.url()).pathname.split('/').at(-2)!);
		expect(workout).toMatchObject({ rest: 15, repeat: { rounds: 1 } });
		expect(new Set(workout.steps.filter((s) => 'exercise' in s).map((s) => s.exercise)).size).toBe(
			2
		);
	}
);

Then(
	'the planner lists squat, plank and jumping-jack for one round with 15 seconds of rest',
	async ({ page }) => {
		const rows = circuit(page).getByRole('listitem');
		await expect(rows).toHaveCount(3);
		for (const [i, name] of ['Squat', 'Plank', 'Jumping-jack'].entries())
			await expect(rows.nth(i)).toHaveAccessibleName(name);
		await page.getByRole('button', { name: 'Edit circuit' }).click();
		await expect(page.getByLabel('Rounds', { exact: true })).toHaveValue('1');
		await expect(page.getByLabel('Rest between exercises', { exact: true })).toHaveValue('15');
	}
);

Given('I open a planner with repetitions, a hold, a break and an interval', async ({ page }) => {
	const encoded = encodeWorkout({
		v: 1,
		steps: [
			{ exercise: 'squat', reps: 5 },
			{ exercise: 'plank', hold: 10 },
			{ rest: 5 },
			{ exercise: 'jumping-jack', duration: 15 }
		],
		repeat: { rounds: 3 }
	});
	await page.goto(`?workout=${encoded}`);
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
	for (const [i, unit] of ['×', 's', 's', 's'].entries()) {
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
	expect(decodeWorkout(encoded).steps).toEqual([
		{ exercise: 'plank', hold: 15 },
		{ exercise: 'squat', reps: 5 },
		{ exercise: 'jumping-jack', duration: 15 }
	]);
});
