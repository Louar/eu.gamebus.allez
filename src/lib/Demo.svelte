<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { demoFrames, type ExerciseId } from './motion';
	import Skeleton from './Skeleton.svelte';
	let { exercise, docked = false }: { exercise: ExerciseId; docked?: boolean } = $props();
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

<figure class:docked>
	<figcaption><i></i>{m.demo()}</figcaption>
	<div class="poses">
		{#if reduced}{#each frames as pose, i (i)}<Skeleton frame={pose} demo />{/each}{:else}<Skeleton
				{frame}
				demo
			/>{/if}
	</div>
</figure>

<style>
	figure {
		position: absolute;
		inset: auto 0.8rem 0.8rem auto;
		border-radius: 0.65rem;
		background: #1c242bfa;
		color: white;
		border: 1px solid #647079;
		width: clamp(7.5rem, 21%, 12rem);
		padding: 0.55rem;
		box-shadow: 0 5px 20px #0002;
	}
	figcaption {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 700;
	}
	figure.docked {
		position: static;
		width: clamp(7rem, 20vw, 13rem);
		flex: none;
	}
	.docked .poses {
		height: clamp(3rem, 10dvh, 7rem);
	}
	@media (max-height: 450px) {
		.docked .poses:has(:global(svg:nth-child(4))) :global(svg) {
			height: 1.8rem;
		}
	}
	i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: #ff9160;
	}
	.poses {
		display: flex;
		height: clamp(3.5rem, 10vw, 6rem);
		background-image: radial-gradient(#ffffff29 1px, transparent 1px);
		background-size: 12px 12px;
	}
	.poses :global(svg) {
		min-width: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		figure:not(.docked):has(:global(svg:nth-child(4))) {
			width: min(60%, 19rem);
		}
		.poses:has(:global(svg:nth-child(4))) {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			height: auto;
		}
		.poses:has(:global(svg:nth-child(4))) :global(svg) {
			height: 3rem;
		}
	}
</style>
