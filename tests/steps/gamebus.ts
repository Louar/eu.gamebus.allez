import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();
const embed = (page: Page) => page.frameLocator('iframe');
const activityId = 'b5345f54-f3b3-4a25-90b5-6ab9081d789a';
const timed = {
	v: 1,
	steps: [
		{ exercise: 'squat', duration: 2 },
		{ exercise: 'jumping-jack', duration: 3 }
	]
};
type Write = {
	type: string;
	requestId: string;
	data: { id?: string; template: string; properties: { template: string; obj: unknown }[] };
};
type Host = Window & { writes: Write[]; ready: boolean };
const writes = (page: Page) => page.evaluate(() => (window as Host).writes);
const stepsOf = (write: Write) =>
	write.data.properties.filter((p) => p.template === 'workoutStep').map((p) => p.obj);
const generated = new WeakMap<Page, string[]>();

async function launch(page: Page, baseURL: string, mode: 'page' | 'explicit' | 'random' | 'null') {
	const url = new URL(baseURL);
	url.searchParams.set(
		'workout',
		Buffer.from(JSON.stringify({ v: 1, steps: [{ exercise: 'plank', hold: 99 }] })).toString(
			'base64url'
		)
	);
	url.searchParams.set('model', 'mediapipe');
	url.searchParams.set('sound', '1');
	// Use a real second loopback origin, without bootstrapping a second Allez application.
	const host = new URL('manifest.webmanifest', baseURL);
	host.port = String(Number(url.port) + 3);
	await page.route(host.href, (route) => route.continue());
	await page.goto(host.href);
	await page.setContent('<!doctype html><title>GameBus host</title>');
	await page.evaluate(
		({ src, mode, settings, timed }) => {
			const host = window as Host;
			host.writes = [];
			const child = document.createElement('iframe');
			child.width = '1024';
			child.height = '720';
			const origin = new URL(src).origin;
			window.addEventListener(
				'message',
				({ data, source, origin: sender }: MessageEvent<Write>) => {
					if (source !== child.contentWindow || sender !== origin) return;
					if (data.type === 'IFRAME_READY') {
						host.ready = true;
						if (mode !== 'page')
							child.contentWindow!.postMessage(
								{
									type: 'TASK',
									data: {
										id: 'exercise',
										type: 'userTriggeredEmbedded',
										configuration:
											mode === 'null'
												? null
												: {
														workoutDefinition: mode === 'explicit' ? timed : { steps: 3, rounds: 2 }
													},
										activityTemplates: [{ slug: 'executeHomeWorkout', name: 'Workout' }]
									}
								},
								origin
							);
						if (mode !== 'random')
							child.contentWindow!.postMessage(
								{ type: 'INPUT_COLLECTIONS', data: { allez: { settings } } },
								origin
							);
					} else if (['ACTIVITY', 'SILENT_ACTIVITY'].includes(data.type)) host.writes.push(data);
				}
			);
			child.src = src;
			document.body.append(child);
		},
		{
			src: url.href,
			mode,
			timed,
			settings: { steps: 3, rounds: 2, rest: 0, model: 'movenet', sound: false }
		}
	);
	await expect.poll(() => page.evaluate(() => (window as Host).ready)).toBe(true);
}

Given(
	'a GameBus page opens a conflicting Allez link with random workout settings',
	async ({ page, baseURL }) => launch(page, baseURL!, 'page')
);
Given(
	'a GameBus task supplies a random workout definition without input collections',
	async ({ page, baseURL }) => launch(page, baseURL!, 'random')
);
Given(
	'a GameBus task has null configuration and supplies collection settings',
	async ({ page, baseURL }) => launch(page, baseURL!, 'null')
);
Given(
	'a GameBus task opens a conflicting Allez link with two timed exercises',
	async ({ page, baseURL }) => {
		await launch(page, baseURL!, 'explicit');
		await expect(embed(page).locator('li[data-row]')).toHaveCount(2);
	}
);
Then('setup offers 3 distinct exercises for 2 rounds without rest', async ({ page }) => {
	const setup = embed(page);
	const rows = setup.locator('li[data-row]');
	await expect(rows).toHaveCount(3);
	const labels = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!));
	expect(new Set(labels).size).toBe(3);
	await setup.getByRole('button', { name: 'Edit circuit' }).click();
	await expect(setup.getByLabel('Rounds', { exact: true })).toHaveValue('2');
	await expect(setup.getByLabel('Rest between exercises', { exact: true })).toHaveValue('0');
	const slugs: string[] = [];
	for (let i = 1; i <= 3; i++) {
		await setup.getByRole('combobox', { name: `Exercise ${i}`, exact: true }).click();
		slugs.push((await setup.getByRole('option', { selected: true }).getAttribute('data-value'))!);
		await page.keyboard.press('Escape');
	}
	generated.set(page, slugs);
	await setup.getByRole('button', { name: 'Done editing' }).click();
});
When('I enter practice in the embed', async ({ page }) => {
	await embed(page).getByRole('button', { name: 'Start workout', exact: true }).click();
	await expect(embed(page).getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
});
Then(
	'the practice link preserves the generated circuit and GameBus preferences',
	async ({ page }) => {
		const url = new URL(
			await embed(page)
				.locator('body')
				.evaluate(() => location.href)
		);
		const match = url.pathname.match(/\/workouts\/([\w-]+)\/?$/);
		expect(match).toBeTruthy();
		const plan = JSON.parse(Buffer.from(match![1], 'base64url').toString()) as typeof timed;
		expect(plan.steps.map((s: { exercise: string }) => s.exercise)).toEqual(generated.get(page));
		expect(plan).toMatchObject({ repeat: { rounds: 2 }, rest: 0 });
		expect(url.searchParams.get('model')).toBe('movenet');
		expect(url.searchParams.get('sound')).toBe('0');
	}
);
Then('GameBus has received no workout activity', async ({ page }) =>
	expect(await writes(page)).toEqual([])
);
When('I start the embedded workout', async ({ page }) => {
	await embed(page).getByRole('button', { name: 'Start workout', exact: true }).click();
	await expect(embed(page).getByTestId('stage')).toHaveAttribute('data-stage', 'countdown');
});
Then('GameBus receives an incomplete activity with no steps', async ({ page }) => {
	await expect.poll(() => writes(page)).toHaveLength(1);
	const [create] = await writes(page);
	expect(create).toMatchObject({
		type: 'SILENT_ACTIVITY',
		data: { template: 'executeHomeWorkout' }
	});
	expect(create.requestId).toMatch(/^.{1,100}$/);
	expect(create.data).not.toHaveProperty('id');
	expect(stepsOf(create)).toEqual([]);
	expect(create.data.properties).toEqual(
		expect.arrayContaining([
			{ template: 'isCompleted', obj: { value: false } },
			{ template: 'workoutRounds', obj: { value: 0 } },
			{ template: 'workoutQuality', obj: { value: 0 } },
			{ template: 'duration', obj: { value: 0, unit: 'SECONDS' } }
		])
	);
});
When('I complete both timed exercises before GameBus acknowledges the create', async ({ page }) => {
	const frame = page.frames().find((f) => f.parentFrame())!;
	for (const seconds of [3, 2, 3])
		await frame.evaluate(
			(s) => (window as Window & { __alez: { advance(seconds: number): void } }).__alez.advance(s),
			seconds
		);
	await expect(embed(page).getByTestId('stage')).toHaveAttribute('data-stage', 'summary');
	expect(await writes(page)).toHaveLength(1);
});
async function acknowledge(page: Page, write: Write) {
	await page.evaluate(
		({ write, id }) => {
			const child = document.querySelector('iframe')!;
			child.contentWindow!.postMessage(
				{
					type: 'ACTIVITY_RESULT',
					requestId: write.requestId,
					data: { operation: write.data.id ? 'update' : 'create', success: true, id }
				},
				new URL(child.src).origin
			);
		},
		{ write, id: activityId }
	);
}
Then('GameBus receives each completed step on the acknowledged activity', async ({ page }) => {
	for (const [i, expected] of timed.steps.entries()) {
		await acknowledge(page, (await writes(page))[i]);
		await expect.poll(() => writes(page)).toHaveLength(i + 2);
		const update = (await writes(page))[i + 1];
		expect(update).toMatchObject({
			type: 'SILENT_ACTIVITY',
			data: { template: 'executeHomeWorkout', id: activityId }
		});
		const steps = stepsOf(update);
		expect(steps).toHaveLength(i + 1);
		expect(steps.slice(0, i)).toEqual(stepsOf((await writes(page))[i]));
		expect(steps[i]).toMatchObject({
			round: 1,
			step: i + 1,
			exercise: expected.exercise,
			duration: { value: expected.duration, unit: 'SECONDS' }
		});
	}
});
Then('the final activity marks the round and workout complete', async ({ page }) => {
	const stepUpdate = (await writes(page)).at(-1)!;
	await acknowledge(page, stepUpdate);
	await expect
		.poll(async () => (await writes(page)).at(-1)!.data.properties)
		.toContainEqual({ template: 'isCompleted', obj: { value: true } });
	const all = await writes(page);
	for (const write of all) {
		expect(write.data.properties.filter((p) => p.template === 'workoutDefinition')).toEqual([
			{ template: 'workoutDefinition', obj: timed }
		]);
	}
	const final = all.at(-1)!;
	expect(final.data.id).toBe(activityId);
	expect(stepsOf(final)).toEqual(stepsOf(stepUpdate));
	expect(new Set(all.map((w) => w.requestId)).size).toBe(all.length);
	expect(final.data.properties).toContainEqual({ template: 'workoutRounds', obj: { value: 1 } });
	expect(final.data.properties).toContainEqual({
		template: 'duration',
		obj: { value: 5, unit: 'SECONDS' }
	});
	// Timed exercises without tracked movement have no quality samples.
	expect(final.data.properties).toContainEqual({ template: 'workoutQuality', obj: { value: 0 } });
});
