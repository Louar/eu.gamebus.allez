import { expect, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createBdd } from 'playwright-bdd';
import { demoFrames, type LandmarkDetector, type PoseFrame } from '../../src/lib/motion';
import { encodeWorkout } from '../../src/lib/workout';

const { Given, When, Then, AfterScenario } = createBdd();
type Model = 'mediapipe' | 'movenet';
type Asset = { path: string; sha256: string; size: number };
type Reply = {
	ready: boolean;
	available: string[];
	version: string;
	error?: string;
	done?: number;
	total?: number;
	complete?: boolean;
};
type State = {
	context: BrowserContext;
	page: Page;
	baseURL: string;
	model: Model;
	replies: Reply[];
	errors: string[];
	requests: string[];
	modelDownloads: string[];
	shardURL?: string;
	changedBytes?: Buffer;
	oldDocument?: Page;
	legacyURL?: string;
	versionBeforeUpdate?: string;
	counterBeforeUpdate?: string;
	workoutURL?: string;
	quotaSession?: CDPSession;
};
const visitors = new WeakMap<Page, State>();
const visitor = (page: Page) => visitors.get(page)!;

async function message(page: Page, type: 'STATUS' | 'PREPARE', model: Model): Promise<Reply[]> {
	return page.evaluate(
		({ type, model }) =>
			new Promise<Reply[]>((resolve, reject) => {
				const worker = navigator.serviceWorker.controller;
				if (!worker) return reject(new Error('No controlling service worker'));
				const channel = new MessageChannel();
				const replies: Reply[] = [];
				const timer = setTimeout(() => {
					channel.port1.close();
					reject(new Error(`${type} timed out: ${JSON.stringify(replies)}`));
				}, 120_000);
				channel.port1.onmessage = ({ data }: MessageEvent<Reply>) => {
					replies.push(data);
					if (type === 'STATUS' || data.complete === true) {
						clearTimeout(timer);
						channel.port1.close();
						resolve(replies);
					}
				};
				worker.postMessage({ type, model }, [channel.port2]);
			}),
		{ type, model }
	);
}

async function controlled(page: Page) {
	await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
}

Given(
	/^a fresh (update |preview )?PWA visitor using "(mediapipe|movenet)"$/,
	async ({ browser, page, baseURL, $testInfo }, server: string | undefined, model: Model) => {
		$testInfo.setTimeout(180_000);
		if (server) {
			const url = new URL(baseURL!);
			url.port = String(Number(url.port) + (server === 'preview ' ? 3 : 2));
			baseURL = url.href;
		}
		// The existing global replay hooks prohibit model fetches. Keep this real browser separate.
		const context = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
		context.setDefaultTimeout(15_000);
		const realPage = await context.newPage();
		const state: State = {
			context,
			page: realPage,
			baseURL: baseURL!,
			model,
			replies: [],
			errors: [],
			requests: [],
			modelDownloads: []
		};
		visitors.set(page, state);
		realPage.on('pageerror', (error) => state.errors.push(error.message));
		context.on('request', (request) => {
			state.requests.push(request.url());
			if (request.serviceWorker() && /\/models\/(mediapipe|movenet)\//.test(request.url())) {
				state.modelDownloads.push(request.url());
			}
		});
		// Routing disables the HTTP cache, so offline success must come from the service worker.
		await context.route('**/*', (route) =>
			route.request().url().startsWith(baseURL!) ? route.continue() : route.abort('blockedbyclient')
		);
		await realPage.goto(`?model=${model}`);
		await controlled(realPage);
		await expect(realPage.getByTestId('offline-status')).toBeVisible();
		await expect(realPage.getByTestId('pwa-update')).toHaveCount(0);
		const status = (await message(realPage, 'STATUS', model)).at(-1)!;
		expect(status.ready).toBe(false);
		expect(status.available).not.toContain(model);
		expect(status.version).toEqual(expect.any(String));
		expect(status.version.length).toBeGreaterThan(0);
	}
);

AfterScenario('@offline', async ({ page }) => {
	const state = visitors.get(page);
	if (!state) return;
	await state.context.close();
	expect(state.errors, 'No unhandled browser errors').toEqual([]);
	expect(
		state.requests.filter((url) => !url.startsWith(state.baseURL)),
		'All app, SDK, WASM and model requests stay under the production base'
	).toEqual([]);
});

Then('the install manifest and icons are local and installable', async ({ page }) => {
	const state = visitor(page);
	const href = await state.page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBeTruthy();
	const url = new URL(href!, state.page.url());
	expect(url.href.startsWith(state.baseURL)).toBe(true);
	const response = await state.context.request.get(url.href);
	expect(response.ok()).toBe(true);
	expect(response.headers()['content-type']).toContain('application/manifest+json');
	const manifest = (await response.json()) as {
		name: string;
		short_name: string;
		id: string;
		display: string;
		start_url: string;
		scope: string;
		icons: { src: string; sizes: string; type: string; purpose?: string }[];
	};
	expect(manifest.name).toBe('Alez');
	expect(manifest.short_name).toBe('Alez');
	expect(new URL(manifest.id, url).href).toBe(state.baseURL);
	expect(manifest.display).toBe('standalone');
	expect(new URL(manifest.start_url, url).href).toBe(state.baseURL);
	expect(new URL(manifest.scope, url).href).toBe(state.baseURL);
	expect(manifest.icons).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
			expect.objectContaining({ sizes: '512x512', type: 'image/png' })
		])
	);
	for (const icon of manifest.icons) {
		const iconURL = new URL(icon.src, url);
		expect(iconURL.href.startsWith(state.baseURL)).toBe(true);
		const image = await state.context.request.get(iconURL.href);
		expect(image.ok()).toBe(true);
		expect(image.headers()['content-type']).toContain('image/png');
		const bytes = await image.body();
		expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
		expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
	}
	const registrations = await state.page.evaluate(async () =>
		(await navigator.serviceWorker.getRegistrations()).map((registration) => ({
			scope: registration.scope,
			script: registration.active?.scriptURL
		}))
	);
	expect(registrations).toEqual([
		{ scope: state.baseURL, script: `${state.baseURL}service-worker.js` }
	]);
	await state.page.goto(new URL(manifest.start_url, url).href);
	await expect(
		state.page.getByRole('button', { name: 'Start workout', exact: true })
	).toBeVisible();
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'setup');
});

When('storage capacity is exhausted during preparation', async ({ page }) => {
	const state = visitor(page);
	state.quotaSession = await state.context.newCDPSession(state.page);
	await state.quotaSession.send('Storage.overrideQuotaForOrigin', {
		origin: new URL(state.baseURL).origin,
		quotaSize: 1
	});
	await state.page.getByRole('button', { name: 'Prepare offline', exact: true }).click();
	await expect(state.page.getByTestId('offline-status')).toContainText('Not enough storage', {
		timeout: 30_000
	});
});

Then('the storage failure keeps readiness incomplete and offers Retry', async ({ page }) => {
	const state = visitor(page);
	const status = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	expect(status.ready).toBe(false);
	expect(status.available).not.toContain(state.model);
	await expect(state.page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

When('storage capacity is restored and I retry', async ({ page }) => {
	const state = visitor(page);
	await state.quotaSession!.send('Storage.overrideQuotaForOrigin', {
		origin: new URL(state.baseURL).origin
	});
	await state.page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(state.page.getByTestId('offline-status')).toContainText('Ready offline', {
		timeout: 120_000
	});
	state.replies = await message(state.page, 'PREPARE', state.model);
});

When('I change the selected provider to {string}', async ({ page }, model: Model) => {
	const state = visitor(page);
	await state.page.getByRole('combobox', { name: 'Model', exact: true }).click();
	await state.page
		.getByRole('option', { name: model === 'movenet' ? /MoveNet/ : /MediaPipe/ })
		.click();
	state.model = model;
});

Then('the selected provider remains ready after online and offline reloads', async ({ page }) => {
	const state = visitor(page);
	for (const offline of [false, true]) {
		await state.context.setOffline(offline);
		await state.page.reload();
		await expect(state.page.getByRole('combobox', { name: 'Model', exact: true })).toContainText(
			state.model === 'movenet' ? 'MoveNet' : 'MediaPipe'
		);
		await expect(state.page.getByTestId('offline-status')).toContainText('Ready offline');
		expect((await message(state.page, 'STATUS', state.model)).at(-1)!.ready).toBe(true);
	}
});

When('I prepare the selected provider for offline use', async ({ page }) => {
	const state = visitor(page);
	// UI starts the operation; STATUS must only become ready after the complete asset set exists.
	await state.page.getByRole('button', { name: /prepare.*offline/i }).click();
	await expect
		.poll(async () => (await message(state.page, 'STATUS', state.model)).at(-1)!.ready, {
			timeout: 120_000
		})
		.toBe(true);
	state.replies = await message(state.page, 'PREPARE', state.model);
});

Then('offline preparation reports complete assets and progress', async ({ page }) => {
	const state = visitor(page);
	const final = state.replies.at(-1)!;
	expect(final.complete).toBe(true);
	expect(final.ready).toBe(true);
	expect(final.error).toBeFalsy();
	expect(final.available).toEqual([state.model]);
	expect(final.version.length).toBeGreaterThan(0);
	const progress = state.replies.filter((reply) => typeof reply.done === 'number');
	expect(progress.length).toBeGreaterThan(0);
	for (const reply of progress) {
		expect(reply.total).toBeGreaterThan(0);
		expect(reply.done).toBeGreaterThanOrEqual(0);
		expect(reply.done!).toBeLessThanOrEqual(reply.total!);
	}
	expect(progress.at(-1)!.done).toBe(progress.at(-1)!.total);
	const modelRequests = state.requests.filter((url) => /\/models\/(mediapipe|movenet)\//.test(url));
	expect(modelRequests.length).toBeGreaterThan(0);
	expect(modelRequests.every((url) => url.includes(`/models/${state.model}/`))).toBe(true);
	expect(
		modelRequests.some((url) => url.endsWith(state.model === 'mediapipe' ? '.wasm' : '.bin'))
	).toBe(true);
	await expect(state.page.getByTestId('offline-status')).toContainText(/ready|prepared/i);
});

When('I disconnect and open a previously unseen workout link', async ({ page }) => {
	const state = visitor(page);
	const encoded = encodeWorkout({ v: 1, steps: [{ exercise: 'squat', reps: 23 }] });
	state.workoutURL = `${state.baseURL}workouts/${encoded}/?model=${state.model}&sound=1`;
	expect(state.requests).not.toContain(state.workoutURL);
	await state.context.setOffline(true);
	// A new document also rules out an already-loaded detector or an in-memory SDK instance.
	await state.page.close();
	state.page = await state.context.newPage();
	state.page.on('pageerror', (error) => state.errors.push(error.message));
	await state.page.goto(state.workoutURL);
	await controlled(state.page);
});

Then('the unseen workout survives an offline reload', async ({ page }) => {
	const state = visitor(page);
	for (let pass = 0; pass < 2; pass++) {
		if (pass) await state.page.reload();
		await expect(state.page).toHaveURL(state.workoutURL!);
		await expect(state.page.getByTestId('workout-preview')).toContainText(/squat.*23/is);
		await expect(
			state.page.getByRole('button', { name: 'Enable camera to start', exact: true })
		).toBeVisible();
		await expect(state.page.locator('video')).toHaveCount(0);
		expect((await message(state.page, 'STATUS', state.model)).at(-1)!.ready).toBe(true);
	}
});

Then('the real {string} detector infers locally while offline', async ({ page }, model: Model) => {
	const state = visitor(page);
	expect(await state.page.evaluate(() => navigator.onLine)).toBe(false);
	const frames = await state.page.evaluate(
		async ({ model, base }) => {
			const bridge = (
				window as typeof window & {
					__alezLoadDetector?: (id: Model, base: string) => Promise<LandmarkDetector>;
				}
			).__alezLoadDetector;
			if (!bridge) throw new Error('Missing test-only __alezLoadDetector dynamic import bridge');
			const detector = await bridge(model, base);
			try {
				// A local deterministic image exercises real inference, not pose replay or accuracy.
				const canvas = document.createElement('canvas');
				canvas.width = 320;
				canvas.height = 480;
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = '#ddd';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.strokeStyle = '#222';
				ctx.lineWidth = 18;
				ctx.beginPath();
				ctx.arc(160, 80, 30, 0, 2 * Math.PI);
				ctx.moveTo(160, 110);
				ctx.lineTo(160, 280);
				ctx.moveTo(70, 230);
				ctx.lineTo(160, 150);
				ctx.lineTo(250, 230);
				ctx.moveTo(90, 430);
				ctx.lineTo(160, 280);
				ctx.lineTo(230, 430);
				ctx.stroke();
				const image = await createImageBitmap(canvas);
				try {
					return [await detector.estimate(image, 1), await detector.estimate(image, 2)];
				} finally {
					image.close();
				}
			} finally {
				await detector.dispose();
			}
		},
		{ model, base: new URL(state.baseURL).pathname }
	);
	expect(frames).toHaveLength(2);
	for (const [index, frame] of frames.entries()) {
		expect(frame.provider).toBe(model);
		expect(frame.timestamp).toBe(index + 1);
		expect(frame.width).toBe(320);
		expect(frame.height).toBe(480);
		expect(typeof frame.missing).toBe('boolean');
		if (model === 'movenet') expect(Object.keys(frame.points)).toHaveLength(17);
		if (!frame.missing) expect(Object.keys(frame.points).length).toBeGreaterThan(0);
		for (const point of Object.values(frame.points)) {
			expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
			expect(point.score).toBeGreaterThanOrEqual(0);
			expect(point.score).toBeLessThanOrEqual(1);
		}
	}
});

Then('a previously unseen root workout query can start offline', async ({ page }) => {
	const state = visitor(page);
	const encoded = encodeWorkout({ v: 1, steps: [{ exercise: 'squat', reps: 29 }] });
	const url = `${state.baseURL}?workout=${encoded}&model=${state.model}`;
	expect(state.requests).not.toContain(url);
	await state.page.close();
	state.page = await state.context.newPage();
	state.page.on('pageerror', (error) => state.errors.push(error.message));
	await state.page.goto(url);
	await state.page.reload();
	await expect(state.page).toHaveURL(url);
	await state.page.getByRole('button', { name: 'Edit circuit', exact: true }).click();
	await expect(state.page.getByLabel('Target 1', { exact: true })).toHaveValue('29');
	await state.page.getByRole('button', { name: 'Done editing', exact: true }).click();
	await state.page.getByRole('button', { name: 'Start workout', exact: true }).click();
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
	await expect(state.page).toHaveURL(
		`${state.baseURL}workouts/${encoded}/?model=${state.model}&sound=1`
	);
	const guide = state.page.getByRole('figure', { name: 'Movement guide' });
	await expect(guide).toBeVisible();
	await expect(guide.locator('svg').first()).toBeVisible();
	await expect(guide.locator('svg').first().locator('line').first()).toBeVisible();
	await state.page.getByRole('button', { name: 'Start workout', exact: true }).click();
	await state.page.evaluate(() =>
		(
			window as typeof window & {
				__alez: {
					advance(seconds: number): void;
				};
			}
		).__alez.advance(5)
	);
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'exercise');
	await expect(state.page.getByTestId('counter')).toContainText('0 / 29');
	await expect(state.page.getByTestId('stage')).toContainText('00:02');
});

When('a model shard download is interrupted during preparation', async ({ page }) => {
	const state = visitor(page);
	let interrupted = false;
	await state.context.route('**/models/movenet/*.bin', async (route) => {
		interrupted = true;
		await route.abort('connectionreset');
	});
	state.replies = await message(state.page, 'PREPARE', state.model);
	expect(interrupted, 'The service worker really requested a model shard').toBe(true);
});

Then('the incomplete provider is not ready offline', async ({ page }) => {
	const state = visitor(page);
	const final = state.replies.at(-1)!;
	expect(final.complete).toBe(true);
	expect(final.ready).toBe(false);
	expect(final.error).toEqual(expect.any(String));
	expect(final.error!.length).toBeGreaterThan(0);
	await state.context.setOffline(true);
	const status = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	expect(status.ready).toBe(false);
	expect(status.available).not.toContain(state.model);
	await state.page.reload();
	const notice = state.page.getByTestId('offline-status');
	await expect(notice).toContainText('not available offline');
	await expect(notice).not.toContainText('Ready offline:');
});

When('a cached model shard is evicted and I disconnect', async ({ page }) => {
	const state = visitor(page);
	state.shardURL = await state.page.evaluate(async (base) => {
		const data = (await (await fetch(`${base}models/catalog.json`)).json()) as Record<
			Model,
			Asset[]
		>;
		const shard = data.movenet.find((asset) => asset.path.endsWith('.bin'))!;
		const cache = await caches.open(`alez-models:${encodeURIComponent(new URL(base).pathname)}:v1`);
		if (!(await cache.delete(`${base}.offline/sha256/${shard.sha256}/${shard.size}`)))
			throw new Error('No prepared shard');
		return new URL(shard.path, base).href;
	}, state.baseURL);
	state.modelDownloads.length = 0;
	await state.context.setOffline(true);
	await state.page.reload();
});

Then('only the evicted shard was downloaded on retry', ({ page }) => {
	const state = visitor(page);
	expect(state.modelDownloads).toEqual([state.shardURL]);
});

When('the catalog changes the expected hash of one shard', async ({ page }) => {
	const state = visitor(page);
	const catalogURL = `${state.baseURL}models/catalog.json`;
	const data = (await (await state.context.request.get(catalogURL)).json()) as Record<
		Model,
		Asset[]
	>;
	const shard = data.movenet.find((asset) => asset.path.endsWith('.bin'))!;
	state.shardURL = new URL(shard.path, state.baseURL).href;
	state.changedBytes = await (await state.context.request.get(state.shardURL)).body();
	state.changedBytes[0] ^= 1; // Same length, different SHA-256.
	shard.sha256 = createHash('sha256').update(state.changedBytes).digest('hex');
	const { version } = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	const name = `alez:${encodeURIComponent(new URL(state.baseURL).pathname)}:${version}`;
	await state.page.evaluate(
		async ({ name, catalogURL, data }) => {
			await (await caches.open(name)).put(catalogURL, Response.json(data));
		},
		{ name, catalogURL, data }
	);
	state.modelDownloads.length = 0;
});

Then('the unchanged server response fails integrity verification', async ({ page }) => {
	const state = visitor(page);
	expect((await message(state.page, 'STATUS', state.model)).at(-1)!.ready).toBe(false);
	expect((await message(state.page, 'PREPARE', state.model)).at(-1)).toMatchObject({
		ready: false,
		error: 'download',
		available: []
	});
	expect(state.modelDownloads).toEqual([state.shardURL]);
});

When('the server supplies the changed shard', async ({ page }) => {
	const state = visitor(page);
	state.modelDownloads.length = 0;
	await state.context.route(state.shardURL!, (route) =>
		route.fulfill({ body: state.changedBytes!, contentType: 'application/octet-stream' })
	);
	expect((await message(state.page, 'PREPARE', state.model)).at(-1)!.ready).toBe(true);
	await state.context.unroute(state.shardURL!);
});

Then('only that verified shard is replaced and served offline', async ({ page }) => {
	const state = visitor(page);
	expect(state.modelDownloads).toEqual([state.shardURL]);
	await state.context.setOffline(true);
	const digest = await state.page.evaluate(async (url) => {
		const bytes = await (await fetch(url)).arrayBuffer();
		return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
			n.toString(16).padStart(2, '0')
		).join('');
	}, state.shardURL!);
	expect(digest).toBe(createHash('sha256').update(state.changedBytes!).digest('hex'));
});

Then('the evicted provider loses its offline readiness', async ({ page }) => {
	const state = visitor(page);
	const status = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	expect(status.ready).toBe(false);
	expect(status.available).not.toContain(state.model);
	await expect(state.page.getByTestId('offline-status')).toContainText(
		/not.*(offline|available)|connect/i
	);
});

When('I retry preparation with the network restored', async ({ page }) => {
	const state = visitor(page);
	await state.context.setOffline(false);
	await state.context.unroute('**/models/movenet/*.bin');
	state.replies = await message(state.page, 'PREPARE', state.model);
	await state.page.reload();
});

When(
	'I disconnect without preparing a provider in {string}',
	async ({ page }, language: string) => {
		const state = visitor(page);
		if (language === 'nl')
			await state.page.getByRole('radio', { name: 'Nederlands', exact: true }).click();
		await expect(state.page.locator('html')).toHaveAttribute('lang', language);
		await state.context.setOffline(true);
		await state.page.reload();
	}
);

Then(
	'the offline options explain the uncached model in {string}',
	async ({ page }, language: string) => {
		const state = visitor(page);
		await expect(state.page.locator('html')).toHaveAttribute('lang', language);
		const status = state.page.getByTestId('offline-status');
		await expect(status).toContainText(
			language === 'nl'
				? /niet.*(offline|beschikbaar)|verbinding/i
				: /not.*(offline|available)|connect/i
		);
		await expect(
			state.page.getByRole('button', {
				name:
					language === 'nl'
						? /offline.*(voorbereiden|klaarmaken)|voorbereiden.*offline/i
						: /prepare.*offline/i
			})
		).toBeVisible();
		expect((await message(state.page, 'STATUS', state.model)).at(-1)!.available).toEqual([]);
	}
);

When('I select an uncached provider offline in {string}', async ({ page }, language: string) => {
	const state = visitor(page);
	if (language === 'nl')
		await state.page.getByRole('radio', { name: 'Nederlands', exact: true }).click();
	await expect(state.page.locator('html')).toHaveAttribute('lang', language);
	await state.context.setOffline(true);
	await state.page.getByRole('combobox', { name: 'Model', exact: true }).click();
	await state.page.getByRole('option', { name: /MediaPipe/ }).click();
	state.model = 'mediapipe';
});

Then('the cached alternative is explained in {string}', async ({ page }, language: string) => {
	const state = visitor(page);
	const status = state.page.getByTestId('offline-status');
	await expect(status).toContainText(
		language === 'nl' ? /MediaPipe.*niet offline beschikbaar/ : /MediaPipe.*not available offline/
	);
	await expect(status).toContainText(
		language === 'nl' ? /Offline beschikbaar: MoveNet/ : /Available offline: MoveNet/
	);
	const reply = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	expect(reply.ready).toBe(false);
	expect(reply.available).toEqual(['movenet']);
});

When('an old document stays open with a legacy cached model asset', async ({ page }) => {
	const state = visitor(page);
	const { version } = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	const name = `alez:${encodeURIComponent(new URL(state.baseURL).pathname)}:${version}`;
	// A controlled document which consents to activation without navigating to the new shell.
	state.oldDocument = await state.context.newPage();
	await state.oldDocument.goto(`${state.baseURL}models/catalog.json`);
	await controlled(state.oldDocument);
	state.legacyURL = await state.oldDocument.evaluate(
		async ({ base, name, version, digest }) => {
			navigator.serviceWorker.addEventListener(
				'message',
				(event: MessageEvent<{ type: string }>) => {
					if (event.data.type === 'CLIENT_BUILD') event.ports[0].postMessage(version);
					if (event.data.type === 'SAFE_TO_UPDATE') event.ports[0].postMessage(true);
				}
			);
			const release = await caches.open(name);
			const catalogURL = `${base}models/catalog.json`;
			const data = (await (await release.match(catalogURL))!.json()) as Record<Model, Asset[]>;
			const asset = data.mediapipe.find((asset) => asset.path.endsWith('.js'))!;
			asset.sha256 = digest;
			asset.size = 'legacy fixture'.length;
			const url = new URL(asset.path, base).href;
			await release.put(catalogURL, Response.json(data));
			await release.put(url, new Response('legacy fixture'));
			return url;
		},
		{
			base: state.baseURL,
			name,
			version,
			digest: createHash('sha256').update('legacy fixture').digest('hex')
		}
	);
});

Then('the old document can still read its original model asset offline', async ({ page }) => {
	const state = visitor(page);
	await state.context.setOffline(true);
	try {
		expect(
			await state.oldDocument!.evaluate(async (url) => (await fetch(url)).text(), state.legacyURL!)
		).toBe('legacy fixture');
		// The new document's catalog expects different bytes at exactly this URL.
		expect(
			await state.page.evaluate(
				async (url) =>
					fetch(url).then(
						() => true,
						() => false
					),
				state.legacyURL!
			)
		).toBe(false);
	} finally {
		await state.oldDocument!.close();
		await state.context.setOffline(false);
	}
});

When('a new service worker is installed during an active workout', async ({ page }) => {
	const state = visitor(page);
	const encoded = encodeWorkout({ v: 1, steps: [{ exercise: 'squat', duration: 10 }] });
	await state.page.goto(`?workout=${encoded}&model=movenet`);
	await state.page.getByRole('button', { name: 'Start workout', exact: true }).click();
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'practice');
	await state.page.getByRole('button', { name: 'Start workout', exact: true }).click();
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'countdown');
	await state.page.evaluate((poses) => {
		const replay = (
			window as typeof window & {
				__alez: {
					advance(seconds: number): void;
					now(): number;
					frame(pose: PoseFrame): void;
				};
			}
		).__alez;
		replay.advance(3);
		let now = replay.now();
		for (const pose of poses)
			for (let i = 0; i < 4; i++) {
				now += 0.05;
				replay.frame({ ...pose, timestamp: now });
			}
		replay.advance(2);
	}, demoFrames('squat'));
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'exercise');
	await expect(state.page.getByTestId('counter').locator('..').locator('strong')).toHaveText(
		/\b1\b/
	);
	state.counterBeforeUpdate = (await state.page.getByTestId('counter').textContent())!.trim();
	state.versionBeforeUpdate = (await message(state.page, 'STATUS', state.model)).at(-1)!.version;
	expect(state.modelDownloads.some((url) => url.endsWith('.bin'))).toBe(true);
	state.modelDownloads.length = 0;
	const deployment = await state.context.request.post(
		new URL('__test/deploy-next', state.baseURL).href
	);
	expect(deployment.ok()).toBe(true);
	await state.page.evaluate(async () => {
		const registration = await navigator.serviceWorker.getRegistration();
		if (!registration) throw new Error('No service worker registration');
		(window as typeof window & { __offlineController: ServiceWorker | null }).__offlineController =
			navigator.serviceWorker.controller;
		await registration.update();
	});
	await expect
		.poll(
			() =>
				state.page.evaluate(
					async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state
				),
			{ timeout: 30_000 }
		)
		.toBe('installed');
});

Then('the update waits without reloading or replacing the active worker', async ({ page }) => {
	const state = visitor(page);
	const result = await state.page.evaluate(async () => {
		const registration = await navigator.serviceWorker.getRegistration();
		return {
			unchanged:
				navigator.serviceWorker.controller ===
				(window as typeof window & { __offlineController: ServiceWorker | null })
					.__offlineController,
			waiting: registration?.waiting?.state,
			active: registration?.active?.scriptURL,
			installing: registration?.installing?.state,
			scope: registration?.scope
		};
	});
	expect(result.unchanged).toBe(true);
	expect(result.waiting, JSON.stringify(result)).toBe('installed');
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'exercise');
	await expect(state.page.getByTestId('counter')).toHaveText(state.counterBeforeUpdate!);
	await expect(state.page.getByTestId('counter').locator('..').locator('strong')).toHaveText(
		/\b1\b/
	);
	await expect(state.page.getByTestId('pwa-update')).toHaveCount(0);
});

Then('the workout finishes with its original repetition count and timer', async ({ page }) => {
	const state = visitor(page);
	await state.page.evaluate(() =>
		(
			window as typeof window & {
				__alez: {
					advance(seconds: number): void;
				};
			}
		).__alez.advance(20)
	);
	await expect(state.page.getByTestId('stage')).toHaveAttribute('data-stage', 'summary');
	await expect(state.page.getByTestId('result').locator('strong')).toHaveText(/\b1\b/);
	await expect(state.page.getByTestId('result')).toContainText('Interval: 10 / 10 s');
	await expect(state.page.getByTestId('pwa-update')).toHaveCount(0);
	expect(
		await state.page.evaluate(
			async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state
		)
	).toBe('installed');
});

When('I finish reviewing and explicitly apply the update', async ({ page }) => {
	const state = visitor(page);
	await state.page.getByRole('button', { name: 'Back to setup', exact: true }).click();
	await expect(state.page.getByTestId('pwa-update')).toBeVisible();
	await state.context.setOffline(true);
	await expect(state.page.getByTestId('pwa-update')).toHaveCount(0);
	expect(
		await state.page.evaluate(
			async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state
		)
	).toBe('installed');
	await state.context.setOffline(false);
	await expect(state.page.getByTestId('pwa-update')).toBeVisible();
	await state.page
		.getByTestId('pwa-update')
		.getByRole('button', { name: 'Later', exact: true })
		.first()
		.click();
	await expect(state.page.getByTestId('pwa-update')).toBeHidden();
	expect(
		await state.page.evaluate(
			async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state
		)
	).toBe('installed');
	await state.page.reload();
	await expect(state.page.getByTestId('pwa-update')).toBeVisible();
	await Promise.all([
		state.page.waitForEvent('framenavigated', (frame) => frame === state.page.mainFrame()),
		state.page.getByRole('button', { name: 'Apply update', exact: true }).click()
	]);
	await state.page.waitForLoadState('domcontentloaded');
	await controlled(state.page);
});

Then('the new build controls the page without claiming old models are ready', async ({ page }) => {
	const state = visitor(page);
	await expect
		.poll(() =>
			state.page.evaluate(async () => {
				const registration = await navigator.serviceWorker.getRegistration();
				return {
					waiting: !!registration?.waiting,
					active: registration?.active?.state,
					controlled: navigator.serviceWorker.controller === registration?.active
				};
			})
		)
		.toEqual({ waiting: false, active: 'activated', controlled: true });
	const status = (await message(state.page, 'STATUS', state.model)).at(-1)!;
	expect(status.version).not.toBe(state.versionBeforeUpdate);
	expect(status.version).toMatch(/-next$/);
	expect(status.ready).toBe(false);
	await expect(
		state.page.getByRole('button', { name: 'Start workout', exact: true })
	).toBeVisible();
});

Then('the UI-only update downloaded no model data', ({ page }) => {
	expect(visitor(page).modelDownloads).toEqual([]);
});
