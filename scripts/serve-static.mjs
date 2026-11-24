import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Pages serves the site's custom 404 document without changing the URL or status.
const mount = `${process.env.BASE_PATH ?? '/allez.gamebus.eu'}/`;
const testing = process.env.VITE_REPLAY === 'true';
const switching = testing && process.env.TEST_DEPLOYMENT_SWITCH === 'true';
let nextRelease = false;
const primaryRoot = resolve(testing ? 'build-replay' : 'build');
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.png': 'image/png',
	'.wasm': 'application/wasm',
	'.woff2': 'font/woff2',
	'.svg': 'image/svg+xml',
	'.webm': 'video/webm',
	'.mp4': 'video/mp4'
};

createServer(async (req, res) => {
	try {
		const url = new URL(req.url, 'http://localhost');
		// The update scenario has its own origin; browser worker-update requests omit cookies.
		if (switching && req.method === 'POST' && url.pathname === `${mount}__test/deploy-next`) {
			nextRelease = true;
			return res.writeHead(204).end();
		}
		const root = switching && nextRelease ? resolve('build-next') : primaryRoot;
		if (!['HEAD', 'GET'].includes(req.method)) return res.writeHead(405).end();
		const path = decodeURIComponent(url.pathname);
		if (!path.startsWith(mount)) return res.writeHead(404).end();
		let file = resolve(
			root,
			path.slice(mount.length),
			...(path.endsWith('/') ? ['index.html'] : [])
		);
		if (!file.startsWith(root + sep)) return res.writeHead(404).end();
		let info = await stat(file).catch(() => null);
		if (info?.isDirectory()) {
			return res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
		}
		const status = info?.isFile() ? 200 : 404;
		if (status === 404) {
			file = resolve(root, '404.html');
			info = await stat(file);
		}
		res.writeHead(status, {
			'Content-Length': info.size,
			'Content-Type': types[extname(file)] ?? 'application/octet-stream',
			...(extname(file) === '.html' || file === resolve(root, 'service-worker.js')
				? { 'Cache-Control': 'no-cache' }
				: {})
		});
		if (req.method === 'HEAD') return res.end();
		createReadStream(file)
			.on('error', () => res.destroy())
			.pipe(res);
	} catch {
		res.writeHead(404).end();
	}
}).listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
