import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { crc32, deflateSync } from 'node:zlib';

const base = process.env.BASE_PATH ?? '';
const mp = 'static/models/mediapipe';
const mn = 'static/models/movenet';
const full = '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1';
const files = {
	'model.json': '957721af760b24a1abc93ce5d42caf0cb7795723ab873d3791f5f42f5cb8c7ca',
	'group1-shard1of3.bin': '58dd47fd600a4849c342ce14e2ec32102744ca3d5f7fd9e6888d284f7f922cba',
	'group1-shard2of3.bin': '08da980bc00886854f29b49b9c14528cd41626c0498c67b450de394713f1d0bc',
	'group1-shard3of3.bin': 'c1c6b712e33456aa95aa556b6425528d04fe8730ce9b92de38ec58e947fede34'
};
const hash = (buf) => createHash('sha256').update(buf).digest('hex');
async function valid(path, digest) {
	try {
		return hash(await readFile(path)) === digest;
	} catch (error) {
		if (error.code === 'ENOENT') return false;
		throw error;
	}
}
async function download(url, path, digest) {
	const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
	if (!response.ok) throw new Error(`${response.status}: ${url}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (hash(bytes) !== digest) throw new Error(`SHA-256 mismatch: ${url}`);
	await publish(path, bytes);
}
async function publish(path, bytes) {
	const staging = `${path}.${process.pid}.tmp`;
	try {
		await writeFile(staging, bytes);
		await rename(staging, path);
	} finally {
		await rm(staging, { force: true });
	}
}
await mkdir(mp, { recursive: true });
await mkdir(mn, { recursive: true });
const wasm = 'node_modules/@mediapipe/tasks-vision/wasm';
await mkdir(`${mp}/wasm`, { recursive: true });
const wasmFiles = (await readdir(wasm)).sort();
for (const name of wasmFiles) {
	const bytes = await readFile(join(wasm, name));
	const dest = `${mp}/wasm/${name}`;
	if (!(await valid(dest, hash(bytes)))) await publish(dest, bytes);
}
if (!(await valid(`${mp}/full.task`, full))) {
	await download(
		'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
		`${mp}/full.task`,
		full
	);
}
if (
	!(
		await Promise.all(Object.entries(files).map(([name, digest]) => valid(`${mn}/${name}`, digest)))
	).every(Boolean)
) {
	const temp = await mkdtemp(join(tmpdir(), 'allez-model-'));
	try {
		const archive = join(temp, 'thunder.tar.gz');
		await download(
			'https://api.kaggle.com/v1/models/google/movenet/tfJs/singlepose-thunder/4/download',
			archive,
			'9ab8399bc82cd3c5cc0b61ea3b397512b73dde920590ac869872637eff97e522'
		);
		execFileSync('tar', ['-xzf', archive, '-C', temp, ...Object.keys(files)]);
		for (const [name, digest] of Object.entries(files)) {
			if (!(await valid(join(temp, name), digest))) throw new Error(`Invalid shard: ${name}`);
			await publish(`${mn}/${name}`, await readFile(join(temp, name)));
		}
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}
const catalog = {};
for (const [provider, paths] of Object.entries({
	mediapipe: [...wasmFiles.map((name) => `${mp}/wasm/${name}`), `${mp}/full.task`],
	movenet: Object.keys(files).map((name) => `${mn}/${name}`)
})) {
	catalog[provider] = await Promise.all(
		paths.map(async (path) => {
			const bytes = await readFile(path);
			return { path: path.slice('static/'.length), size: bytes.length, sha256: hash(bytes) };
		})
	);
}
await publish('static/models/catalog.json', JSON.stringify(catalog, null, 2) + '\n');

function chunk(type, data) {
	const bytes = Buffer.alloc(data.length + 12);
	bytes.writeUInt32BE(data.length);
	bytes.write(type, 4, 4, 'ascii');
	data.copy(bytes, 8);
	bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
	return bytes;
}

function icon(size) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 2; // RGB, with a filter byte before each scanline.
	const pixels = Buffer.alloc(size * (1 + size * 3));
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const u = (x + 0.5) / size;
			const v = (y + 0.5) / size;
			const edge = 0.5 - (v - 0.2) * 0.45;
			const leg = Math.abs(u - edge) < 0.055 || Math.abs(u - (1 - edge)) < 0.055;
			const bar = v > 0.58 && v < 0.67 && u > edge && u < 1 - edge;
			const mark = v >= 0.2 && v <= 0.8 && (leg || bar);
			const offset = y * (1 + size * 3) + 1 + x * 3;
			pixels.set(mark ? [249, 115, 22] : [24, 24, 27], offset);
		}
	}
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(pixels)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

await mkdir('static/icons', { recursive: true });
const icons = [];
for (const size of [192, 512]) {
	await publish(`static/icons/icon-${size}.png`, icon(size));
	icons.push({
		src: `${base}/icons/icon-${size}.png`,
		sizes: `${size}x${size}`,
		type: 'image/png'
	});
}
await publish(
	'static/manifest.webmanifest',
	JSON.stringify(
		{
			name: 'Alez',
			short_name: 'Alez',
			id: `${base}/`,
			start_url: `${base}/`,
			scope: `${base}/`,
			display: 'standalone',
			background_color: '#18181b',
			theme_color: '#f97316',
			icons
		},
		null,
		2
	) + '\n'
);
console.log('Verified local Full and Thunder model assets.');
console.log('Generated model catalog, Alez manifest, and PNG icons.');
