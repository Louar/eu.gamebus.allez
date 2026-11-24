// Node 22.18+. No model downloads, npm dependencies, or network access.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { posture } from '../src/lib/motion.ts';

const dir = new URL('../_INPUT/training-data/', import.meta.url);
const text = (file) => readFileSync(new URL(file, dir), 'utf8').replace(/^\uFEFF/, '');
const lines = (file) => text(file).trimEnd().split(/\r?\n/).slice(1);
const heldOut = new Set(['_knIf9vF4k4', 'tmEeghaHoz0', '3sEeVJEXTfY']);
const development = process.argv.includes('--dev');
const frames = new Map();
for (const line of lines('frames-grid.csv')) {
	// The first five fields are unquoted IDs/numbers; ignore the attachment metadata.
	const [id, source, time, exercise, state] = line.split(',', 5);
	if (!frames.has(id)) frames.set(id, { source, time: +time, exercise, state: +state });
}
const labels = {
	'jumping-jack': ['open', 'closed'],
	squat: ['standing', 'lowered'],
	'push-up': ['support', 'lowered'],
	plank: ['plank']
};
const phaseFrames = [...frames].filter(([, v]) => heldOut.has(v.source) !== development);
console.log(
	`${frames.size} unique frame IDs, ${new Set([...frames.values()].map((x) => x.source)).size} source videos; ${phaseFrames.length} ${development ? 'development' : 'held-out'} frames`
);
const providers = [];
for (const file of readdirSync(dir)
	.filter((name) => name.startsWith('labels-'))
	.sort()) {
	const rows = new Map();
	for (const line of lines(file)) {
		// This export has five unquoted scalar columns then one quoted JSON array.
		const fields = /^\d+,([^,]+),([^,]+),(\d+),[^,]+,"(.*)"$/.exec(line);
		assert.ok(fields, 'unexpected detector CSV schema');
		const [, id, exercise, state, payload] = fields;
		if (rows.has(id)) continue;
		if (frames.has(id)) {
			assert.equal(exercise, frames.get(id).exercise);
			assert.equal(+state, frames.get(id).state);
		}
		rows.set(id, JSON.parse(payload.replaceAll('""', '"')));
	}
	providers.push(rows);
	const metrics = {};
	for (const [key, { exercise, state, time }] of phaseFrames) {
		const joints = rows.get(key) ?? [];
		const points = Object.fromEntries(joints.map((p) => [p.name, p]));
		// Dimensions are absent in CSV; the production rule uses joint vectors,
		// not frame-relative clipping or guessed aspect-ratio normalization.
		const phase = posture(exercise, {
			points,
			timestamp: time,
			missing: !joints.length,
			provider: file,
			width: 1,
			height: 1
		});
		const m = (metrics[exercise] ??= { n: 0, correct: 0, lost: 0, absent: 0 });
		m.n++;
		m.correct += +(phase === labels[exercise][state - 1]);
		m.lost += +(phase === 'lost');
		m.absent += +!joints.length;
	}
	console.log(file, 'unique rows:', rows.size);
	console.table(metrics);
}
console.log(
	'Shared frame IDs across all four exports:',
	[...frames.keys()].filter((id) => providers.every((p) => p.has(id))).length
);
