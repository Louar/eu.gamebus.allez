import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

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
for (const name of await readdir(wasm)) {
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
console.log('Verified local Full and Thunder model assets.');
