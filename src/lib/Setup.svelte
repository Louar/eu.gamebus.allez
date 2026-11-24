<script lang="ts">
	import StudioHero from './StudioHero.svelte';
	import SetupCircuit from './SetupCircuit.svelte';
	import { example, type Workout } from './workout';
	import * as m from '#lib/paraglide/messages.js';
	let {
		workout = example,
		error,
		onpractice
	}: {
		workout: Workout;
		error: string;
		onpractice: (w: Workout, model: 'mediapipe' | 'movenet', sound: boolean) => void;
	} = $props();
</script>

<div class="studio" data-testid="stage" data-stage="setup">
	<StudioHero />
	{#if error}<p role="alert">{m.setup_bad_link()}</p>{/if}
	{#key workout}<SetupCircuit {workout} {onpractice} />{/key}
</div>

<style>
	.studio {
		max-width: 1160px;
		width: 100%;
		margin: 0 auto;
		display: grid;
		gap: 22px;
		color: #20262b;
		--primary: #fc9252;
		--primary-foreground: #211d18;
		--background: #fffefa;
		--border: #dddcd5;
		--ring: #b94f16;
		--muted: #f3f1eb;
		--muted-foreground: #4b5356;
		--accent: #f0eee8;
		--accent-foreground: #20262b;
		--radius-md: 8px;
	}
	p[role='alert'] {
		margin: 0;
		border-left: 3px solid #a94619;
		background: #fff1e2;
		color: #763510;
		padding: 12px 16px;
	}
</style>
