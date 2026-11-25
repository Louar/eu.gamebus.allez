<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { demoFrames, type ExerciseId } from './motion';
	import Skeleton from './Skeleton.svelte';
	let { exercise }: { exercise: ExerciseId } = $props();
	let frames = $derived(demoFrames(exercise));
	let time = $state(0);
	let reduced = $state(false);
	onMount(() => {
		const pref = matchMedia('(prefers-reduced-motion: reduce)');
		const change = () => {
			reduced = pref.matches;
		};
		change();
		pref.addEventListener('change', change);
		let raf = 0;
		function next(t: number) {
			if (!pref.matches) time = t / 800;
			raf = requestAnimationFrame(next);
		}
		raf = requestAnimationFrame(next);
		return () => {
			cancelAnimationFrame(raf);
			pref.removeEventListener('change', change);
		};
	});
	let frame = $derived.by(() => {
		const i = Math.floor(time) % frames.length,
			a = frames[i],
			b = frames[(i + 1) % frames.length];
		const t = Math.min(1, (time % 1) * 1.4);
		const f = t * t * (3 - 2 * t);
		return {
			...a,
			points: Object.fromEntries(
				Object.entries(a.points).map(([k, p]) => [
					k,
					{
						...p,
						x: p.x + ((b.points[k]?.x ?? p.x) - p.x) * f,
						y: p.y + ((b.points[k]?.y ?? p.y) - p.y) * f
					}
				])
			)
		};
	});
</script>

<figure class="docked" aria-label={m.demo()}>
	<div class="poses">
		{#if reduced}{#each frames as pose, i (i)}<Skeleton frame={pose} demo />{/each}{:else}<Skeleton
				{frame}
				demo
			/>{/if}
	</div>
</figure>

<style>
	figure {
		border-radius: 0.65rem;
		color: white;
		width: 100%;
	}
	.docked .poses {
		height: clamp(5rem, 18dvh, 12rem);
	}
	@media (max-width: 900px) {
		.docked .poses {
			height: 4rem;
		}
	}
	@media (max-height: 450px) {
		.docked .poses {
			height: 3rem;
		}
		.docked .poses:has(:global(svg:nth-child(4))) :global(svg) {
			height: 1.8rem;
		}
	}
	.poses {
		display: flex;
		background-image: radial-gradient(#ffffff29 1px, transparent 1px);
		background-size: 12px 12px;
	}
	.poses :global(svg) {
		min-width: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.poses:has(:global(svg:nth-child(4))) {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			height: auto;
		}
		.docked .poses {
			display: flex;
		}
	}
</style>
