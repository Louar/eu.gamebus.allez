import './assets.mjs';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// A compiled static harness, not a dev server, replay fixture or mocked SDK.
const outDir = await mkdtemp(join(tmpdir(), 'allez-clips-'));
const base = '/allez.gamebus.eu/';
let server, browser;
try {
	const config = {
		configFile: false,
		root: resolve('scripts/provider-check'),
		base,
		logLevel: 'warn',
		publicDir: false,
		build: { outDir }
	};
	await build(config);
	await cp('static/models', join(outDir, 'models'), { recursive: true });
	if (process.argv[2]) await cp(process.argv[2], join(outDir, 'clip.webm'));
	else {
		// Test input acquisition is host-side only; do not redistribute the source video.
		execFileSync(
			'ffmpeg',
			[
				'-hide_banner',
				'-loglevel',
				'error',
				'-ss',
				'101',
				'-i',
				'https://www.projectraoul.nl/research/fitness-videos/serve/_knIf9vF4k4.mp4',
				'-t',
				'3',
				'-vf',
				'scale=640:-2,fps=10',
				'-an',
				'-c:v',
				'libvpx-vp9',
				join(outDir, 'clip.webm')
			],
			{ timeout: 120_000 }
		);
	}
	server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
	const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
	browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
	console.log('Chromium', browser.version(), process.platform, process.arch);
	for (const [id, backend] of [
		['mediapipe', 'wasm'],
		['movenet', 'webgl'],
		['movenet', 'cpu']
	]) {
		const page = await browser.newPage();
		const requests = [],
			violations = [];
		await page.route('**/*', (route) => {
			const req = route.request();
			if (!req.url().startsWith(origin + base) || req.method() !== 'GET') {
				violations.push(req.url());
				return route.abort();
			}
			requests.push(req.url().slice(origin.length + base.length));
			return route.continue();
		});
		// TFJS reads feature overrides before initializing its priority-ordered backends.
		await page.goto(origin + base + (backend === 'cpu' ? '?tfjsflags=HAS_WEBGL:false' : ''));
		await page.waitForFunction(() => typeof window.check === 'function');
		const result = await page.evaluate(
			([id, exercise]) => window.check(id, exercise),
			[id, process.argv[3] ?? 'push-up']
		);
		assert.deepEqual(violations, []);
		assert.equal(result.backend, backend);
		const assets = requests.filter((p) => p.startsWith('models/'));
		assert(assets.every((p) => p.startsWith(`models/${id}/`)));
		assert(assets.some((p) => p.endsWith(id === 'mediapipe' ? '.wasm' : '.bin')));
		console.log(JSON.stringify({ ...result, assets }));
		await page.close();
	}
} finally {
	await browser?.close();
	await server?.close();
	await rm(outDir, { recursive: true, force: true });
}
