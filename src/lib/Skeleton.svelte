<script lang="ts">
	import { bones, type PoseFrame } from './motion';
	let { frame, demo = false }: { frame: PoseFrame; demo?: boolean } = $props();
</script>

<svg viewBox={`0 0 ${frame.width} ${frame.height}`} aria-hidden="true" class:demo>
	{#if !frame.missing}
		{#each bones as [a, b] (`${a}-${b}`)}
			{@const p = frame.points[a]}
			{@const q = frame.points[b]}
			{#if p?.score >= 0.25 && q?.score >= 0.25}<line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />{/if}
		{/each}
		{#each Object.entries(frame.points) as [key, p] (key)}
			{#if p.score >= 0.25 && (key === 'nose' || bones.some((edge) => edge.includes(key)))}<circle
					cx={p.x}
					cy={p.y}
					r={frame.width * (key === 'nose' && demo ? 0.031 : 0.008)}
				/>{/if}
		{/each}
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	line {
		stroke: #ffd573;
		stroke-width: 3;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	circle {
		fill: #ff784a;
		stroke: #21201d;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.demo line {
		stroke: #ef7744;
		stroke-width: 4;
	}
	.demo circle {
		stroke: #fe945d;
		fill: #ffcf9a;
	}
</style>
