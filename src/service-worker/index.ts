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
const contentName = `alez-models:${encodeURIComponent(root.pathname)}:v1`;
const contentKey = (asset: Asset) => path(`.offline/sha256/${asset.sha256}/${asset.size}`);
const clientKey = (id: string) => path(`.offline/client/${id}`);
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

async function verified(asset: Asset, response: Response) {
	if (!response.ok || response.type === 'opaque') throw new Error('download');
	const bytes = await response.clone().arrayBuffer();
	const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
		.map((n) => n.toString(16).padStart(2, '0'))
		.join('');
	if (bytes.byteLength !== asset.size || digest !== asset.sha256) throw new Error('integrity');
	return response;
}

async function download(cache: Cache, url: string, asset?: Asset) {
	const response = await fetch(url === root.pathname ? path('404.html') : url, {
		cache: 'no-store',
		signal: AbortSignal.timeout(120_000)
	});
	if (!response.ok || response.type === 'opaque') throw new Error('download');
	if (asset) await cache.put(contentKey(asset), await verified(asset, response));
	else await cache.put(url, response);
}

async function catalog(cache: Cache): Promise<Record<Model, Asset[]>> {
	const response = await cache.match(path('models/catalog.json'));
	if (!response) throw new Error('catalog');
	return response.json() as Promise<Record<Model, Asset[]>>;
}
const runtime = (model: Model) => built.filter((url) => provider(url) === model);
async function status(model: Model) {
	const cache = await caches.open(cacheName);
	const content = await caches.open(contentName);
	const data = await catalog(cache).catch(() => null);
	const shellReady = (await Promise.all(shell.map((url) => cache.match(url)))).every(Boolean);
	const available: Model[] = [];
	if (data && shellReady)
		for (const id of ['mediapipe', 'movenet'] as const) {
			const chunks = runtime(id);
			const required = [
				...chunks.map((url) => cache.match(url)),
				...data[id].map((asset) => content.match(contentKey(asset)))
			];
			if (chunks.length && (await Promise.all(required)).every(Boolean)) available.push(id);
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
function clientBuild(client: Client) {
	return new Promise<string | null>((resolve) => {
		const channel = new MessageChannel();
		const finish = (value: string | null) => {
			channel.port1.close();
			resolve(value);
		};
		const timer = setTimeout(() => finish(null), 3000);
		channel.port1.onmessage = ({ data }) => {
			clearTimeout(timer);
			finish(typeof data === 'string' ? data : null);
		};
		client.postMessage({ type: 'CLIENT_BUILD' }, [channel.port2]);
	});
}

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await self.clients.claim();
			// Keep builds still used by open tabs; never remove sibling apps' caches.
			const clients = (
				await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
			).filter((client) => client.url.startsWith(root.href));
			const versions = await Promise.all(clients.map(clientBuild));
			// Client IDs belong to documents, not tabs. Persist old document bindings across worker restarts.
			const current = await caches.open(cacheName);
			const builds = (await caches.keys()).filter((name) => name.startsWith(prefix));
			for (const [index, build] of versions.entries()) {
				if (build !== version && builds.length > 1)
					await current.put(clientKey(clients[index].id), new Response(build ?? ''));
			}
			const keep = versions.includes(null)
				? builds
				: [cacheName, ...versions.map((v) => `${prefix}${v}`)];
			const content = await caches.open(contentName);
			const live = new Set<string>();
			let canPrune = true;
			for (const name of builds.filter((name) => keep.includes(name))) {
				const data = await catalog(await caches.open(name)).catch(() => null);
				if (!data) canPrune = false;
				else for (const asset of Object.values(data).flat()) live.add(contentKey(asset));
			}
			for (const name of builds) {
				if (name === cacheName) continue;
				const old = await caches.open(name);
				const data = await catalog(old).catch(() => null);
				// Deployed URL-keyed caches: migrate one verified body at a time, without network.
				for (const asset of data ? Object.values(data).flat() : []) {
					if (!live.has(contentKey(asset))) continue;
					const url = path(asset.path);
					const response = await old.match(url);
					if (!response) continue;
					try {
						if (!(await content.match(contentKey(asset))))
							await content.put(contentKey(asset), await verified(asset, response));
						await old.delete(url);
					} catch {
						/* Migration is optional when space is tight or the old body is invalid. */
					}
				}
				if (!keep.includes(name)) await caches.delete(name);
			}
			if (canPrune)
				for (const req of await content.keys()) {
					if (!live.has(new URL(req.url).pathname)) await content.delete(req);
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
							const content = await caches.open(contentName);
							const required: { url: string; asset?: Asset }[] = [
								...runtime(model).map((url) => ({ url })),
								...data[model].map((asset) => ({ url: path(asset.path), asset }))
							];
							let done = 0;
							for (const item of required) {
								if (item.asset) {
									if (!(await content.match(contentKey(item.asset))))
										await download(content, item.url, item.asset);
								} else if (!(await cache.match(item.url))) await download(cache, item.url);
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
			if (url.pathname.startsWith(path('models/'))) {
				const binding = event.clientId && (await cache.match(clientKey(event.clientId)));
				let build = binding ? await binding.text() : version;
				if (!build) {
					const client = await self.clients.get(event.clientId);
					build = (client && (await clientBuild(client))) || '';
					if (!build) return Response.error();
					await cache.put(clientKey(event.clientId), new Response(build));
				}
				const release = build === version ? cache : await caches.open(`${prefix}${build}`);
				if (url.pathname === path('models/catalog.json'))
					return (
						(await release.match(url.pathname)) ??
						(build === version ? fetch(request) : Response.error())
					);
				const data = await catalog(release).catch(() => null);
				const asset =
					data &&
					Object.values(data)
						.flat()
						.find((asset) => path(asset.path) === url.pathname);
				const body = asset && (await caches.match(contentKey(asset), { cacheName: contentName }));
				if (body) return body;
				// Never supply today's bytes to an old runtime after its expected blob was evicted.
				if (build !== version)
					return asset
						? verified(asset, (await release.match(url.pathname)) ?? (await fetch(request)))
						: Response.error();
				return fetch(request);
			}
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
