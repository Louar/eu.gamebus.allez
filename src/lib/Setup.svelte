<script lang="ts">
	import StudioHero from './StudioHero.svelte';
	import SetupCircuit from './SetupCircuit.svelte';
	import { example, type Workout } from './workout';
	import * as m from '#lib/paraglide/messages.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	let {
		workout = example,
		error,
		planner,
		onpractice
	}: {
		workout: Workout;
		error: string;
		planner?: { model: 'mediapipe' | 'movenet'; sound: boolean };
		onpractice?: (w: Workout, model: 'mediapipe' | 'movenet', sound: boolean) => void;
	} = $props();
</script>

<div
	class="studio mx-auto grid w-full max-w-[1160px] gap-[22px] text-foreground"
	data-testid="stage"
	data-stage="setup"
>
	{#if !planner}<StudioHero />{/if}
	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Description>{m.setup_bad_link()}</Alert.Description>
		</Alert.Root>
	{/if}
	{#key workout}<SetupCircuit {workout} {planner} {onpractice} />{/key}
</div>

<style>
	.studio {
		--foreground: #20262b;
		--primary: #fc9252;
		--primary-foreground: #211d18;
		--background: #fffefa;
		--card: #fffefa;
		--card-foreground: #20262b;
		--border: #dddcd5;
		--input: #cfcec6;
		--ring: #b94f16;
		--muted: #f3f1eb;
		--muted-foreground: #4b5356;
		--secondary: #f3f2ed;
		--secondary-foreground: #444b48;
		--accent: #f0eee8;
		--accent-foreground: #20262b;
		--destructive: #8d381b;
		--radius-md: 8px;
	}
</style>
