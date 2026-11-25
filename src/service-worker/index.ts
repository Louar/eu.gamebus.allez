import { self } from '$app/service-worker';
import { version } from '$app/env';
import { immutable, assets } from '$app/manifest';
import providers from 'virtual:offline-providers';

type Model = 'mediapipe' | 'movenet';
type Asset = { path: string; size: number; sha256: string };
const root = new URL(self.registration.scope);
const path = (name: string) => new URL(name.replace(/^\//, ''), root).pathname;
const prefix = `alez:${encodeURIComponent(root.pathname)}:`;
const cacheName = `${prefix}${version}`;
const built = immutable.map((asset) => path(asset.path));
const provider = (url: string) =>
	(['mediapipe', 'movenet'] as const).find((id) =>
		providers[id].some((file) => path(file) === url)
	);
const shell = [
	...new Set([
		root.pathname,
		...built.filter((url) => !provider(url)),
		...assets
			.map((asset) => path(asset.path))
			.filter((url) => !url.includes('/models/') || url.endsWith('/catalog.json'))
	])
];

async function download(cache: Cache, url: string, asset?: Asset) {
	const response = await fetch(url === root.pathname ? path('404.html') : url, {
		cache: 'no-store',
		signal: AbortSignal.timeout(120_000)
	});
	if (!response.ok || response.type === 'opaque') throw new Error('download');
	if (asset) {
		const bytes = await response.clone().arrayBuffer();
		const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
			.map((n) => n.toString(16).padStart(2, '0'))
			.join('');
		if (bytes.byteLength !== asset.size || digest !== asset.sha256) throw new Error('integrity');
	}
	await cache.put(url, response);
}

async function catalog(cache: Cache): Promise<Record<Model, Asset[]>> {
	const response = await cache.match(path('models/catalog.json'));
	if (!response) throw new Error('catalog');
	return response.json() as Promise<Record<Model, Asset[]>>;
}
const runtime = (model: Model) => built.filter((url) => provider(url) === model);
async function status(model: Model) {
	const cache = await caches.open(cacheName);
	const data = await catalog(cache).catch(() => null);
	const shellReady = (await Promise.all(shell.map((url) => cache.match(url)))).every(Boolean);
	const available: Model[] = [];
	if (data && shellReady)
		for (const id of ['mediapipe', 'movenet'] as const) {
			const chunks = runtime(id);
			const required = [...chunks, ...data[id].map((asset) => path(asset.path))];
			if (
				chunks.length &&
				(await Promise.all(required.map((url) => cache.match(url)))).every(Boolean)
			)
				available.push(id);
		}
	return { ready: available.includes(model), available, version, complete: true };
}

self.addEventListener('install', (event) => {
	// Do not skipWaiting: an installed update must never interrupt a workout.
	event.waitUntil(
		(async () => {
			const cache = await caches.open(cacheName);
			await Promise.all(shell.map((url) => download(cache, url)));
		})()
	);
});
self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await self.clients.claim();
			// Keep builds still used by open tabs; never remove sibling apps' caches.
			const clients = (
				await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
			).filter((client) => client.url.startsWith(root.href));
			const versions = await Promise.all(
				clients.map(
					(client) =>
						new Promise<string | null>((resolve) => {
							const channel = new MessageChannel();
							const timer = setTimeout(() => {
								channel.port1.close();
								resolve(null);
							}, 3000);
							channel.port1.onmessage = (reply: MessageEvent<unknown>) => {
								clearTimeout(timer);
								channel.port1.close();
								resolve(typeof reply.data === 'string' ? reply.data : null);
							};
							client.postMessage({ type: 'CLIENT_BUILD' }, [channel.port2]);
						})
				)
			);
			if (versions.every((value) => value !== null)) {
				const keep = new Set([cacheName, ...versions.map((value) => `${prefix}${value}`)]);
				for (const key of await caches.keys())
					if (key.startsWith(prefix) && !keep.has(key)) await caches.delete(key);
			}
		})()
	);
});

const preparing = new Map<Model, { work: Promise<void>; ports: Set<MessagePort> }>();
self.addEventListener('message', (event) => {
	const port = event.ports[0];
	const data = event.data as { model?: Model; type?: string } | undefined;
	const model = data?.model;
	if (data?.type === 'APPLY_UPDATE') {
		event.waitUntil(
			(async () => {
				const clients = (
					await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
				).filter((client) => client.url.startsWith(root.href));
				const safe = await Promise.all(
					clients.map(
						(client) =>
							new Promise<boolean>((resolve) => {
								const channel = new MessageChannel();
								const timer = setTimeout(() => {
									channel.port1.close();
									resolve(false);
								}, 3000);
								channel.port1.onmessage = (reply) => {
									clearTimeout(timer);
									channel.port1.close();
									resolve(reply.data === true);
								};
								client.postMessage({ type: 'SAFE_TO_UPDATE' }, [channel.port2]);
							})
					)
				);
				if (safe.every(Boolean)) await self.skipWaiting();
				else for (const client of clients) client.postMessage({ type: 'UPDATE_RELEASE' });
				port?.postMessage({ applied: safe.every(Boolean), complete: true });
			})()
		);
		return;
	}
	if (!port || (model !== 'mediapipe' && model !== 'movenet')) return;
	event.waitUntil(
		(async () => {
			try {
				if (data?.type === 'PREPARE') {
					let preparation = preparing.get(model);
					if (!preparation) {
						const ports = new Set([port]);
						const progress = (value: { done?: number; total?: number }) => {
							for (const recipient of ports) recipient.postMessage({ ...value, complete: false });
						};
						const work = (async () => {
							const cache = await caches.open(cacheName);
							for (const url of shell) {
								if (!(await cache.match(url))) await download(cache, url);
								progress({});
							}
							const data = await catalog(cache);
							const required: { url: string; asset?: Asset }[] = [
								...runtime(model).map((url) => ({ url })),
								...data[model].map((asset) => ({ url: path(asset.path), asset }))
							];
							let done = 0;
							for (const item of required) {
								if (!(await cache.match(item.url))) await download(cache, item.url, item.asset);
								progress({ done: ++done, total: required.length });
							}
						})();
						preparation = { work, ports };
						preparing.set(model, preparation);
						void work.finally(() => preparing.delete(model)).catch(() => {});
					} else preparation.ports.add(port);
					await preparation.work;
				}
				port.postMessage(await status(model));
			} catch (error) {
				const state = await status(model);
				port.postMessage({
					...state,
					ready: false,
					error:
						error instanceof DOMException && error.name === 'QuotaExceededError'
							? 'storage'
							: 'download'
				});
			}
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (
		request.method !== 'GET' ||
		url.origin !== root.origin ||
		!url.pathname.startsWith(root.pathname)
	)
		return;
	const appNavigation =
		request.mode === 'navigate' &&
		(url.pathname === root.pathname ||
			/^workouts\/(?:[^/]+\/?)?$/.test(url.pathname.slice(root.pathname.length)));
	const known =
		shell.includes(url.pathname) ||
		built.includes(url.pathname) ||
		url.pathname.startsWith(path('_app/immutable/')) ||
		url.pathname.startsWith(path('models/'));
	if (!appNavigation && !known) return;
	event.respondWith(
		(async () => {
			const cache = await caches.open(cacheName);
			// A single entry page preserves the request URL, including the exact prescription.
			const cached = await cache.match(appNavigation ? root.pathname : url.pathname);
			if (cached) return cached;
			// Other safe tabs may still render the prior build until they are reloaded.
			if (url.pathname.startsWith(path('_app/immutable/'))) {
				for (const name of await caches.keys()) {
					if (!name.startsWith(prefix) || name === cacheName) continue;
					const prior = await (await caches.open(name)).match(url.pathname);
					if (prior) return prior;
				}
			}
			return fetch(request);
		})()
	);
});
