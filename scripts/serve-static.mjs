import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// No SPA fallback or cross-origin isolation: missing assets must really 404 as on Pages.
const mount = `${process.env.BASE_PATH ?? '/allez.gamebus.eu'}/`;
const root = resolve(process.env.VITE_REPLAY === 'true' ? 'build-replay' : 'build');
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.woff2': 'font/woff2',
	'.svg': 'image/svg+xml',
	'.webm': 'video/webm',
	'.mp4': 'video/mp4'
};

createServer(async (req, res) => {
	try {
		if (!['HEAD', 'GET'].includes(req.method)) return res.writeHead(405).end();
		const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
		if (!path.startsWith(mount)) return res.writeHead(404).end();
		const file = resolve(
			root,
			path.slice(mount.length),
			...(path.endsWith('/') ? ['index.html'] : [])
		);
		if (!file.startsWith(root + sep)) return res.writeHead(404).end();
		const info = await stat(file);
		if (!info.isFile()) return res.writeHead(404).end();
		res.writeHead(200, {
			'Content-Length': info.size,
			'Content-Type': types[extname(file)] ?? 'application/octet-stream'
		});
		if (req.method === 'HEAD') return res.end();
		createReadStream(file)
			.on('error', () => res.destroy())
			.pipe(res);
	} catch {
		res.writeHead(404).end();
	}
}).listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
