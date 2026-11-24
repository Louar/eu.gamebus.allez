// Candidate evaluation only. No application import or SDK dependency.
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const source = resolve(process.argv[2]);
const outDir = await mkdtemp(join(tmpdir(), 'rtmo-eval-'));
let server, browser;
try {
	for (const name of ['end2end.onnx', 'frame.png', 'reference.json'])
		await cp(join(source, name), join(outDir, name));
	for (const name of [
		'ort.wasm.min.mjs',
		'ort-wasm-simd-threaded.mjs',
		'ort-wasm-simd-threaded.wasm'
	])
		await cp(join(source, 'package/dist', name), join(outDir, name));
	await cp('scripts/provider-check/rtmo.html', join(outDir, 'index.html'));
	server = await preview({
		configFile: false,
		base: '/allez.gamebus.eu/',
		build: { outDir },
		preview: { host: '127.0.0.1', port: 0 }
	});
	browser = await chromium.launch();
	const page = await browser.newPage();
	const root = `http://127.0.0.1:${server.httpServer.address().port}/allez.gamebus.eu/`;
	await page.route('**/*', (route) =>
		route.request().url().startsWith(root) && route.request().method() === 'GET'
			? route.continue()
			: route.abort()
	);
	await page.goto(root);
	const result = await page.evaluate(() => window.rtmo());
	console.log(result);
	assert(
		result.maxErrorPx <= 2 && result.maxScoreDiff <= 0.02,
		'Reference parity exceeded tolerance'
	);
} finally {
	await browser?.close();
	await server?.close();
	await rm(outDir, { recursive: true, force: true });
}
