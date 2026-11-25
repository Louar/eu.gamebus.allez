<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale, setLocale } from '#lib/paraglide/runtime.js';
	import Setup from '#lib/Setup.svelte';
	import { decodeWorkout, example, type Workout } from '#lib/workout.js';
	import { onMount } from 'svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	let workout = $state<Workout>(example),
		error = $state(''),
		ready = $state(false);
	let model = $state<'mediapipe' | 'movenet'>('mediapipe'),
		sound = $state(false);
	let locale = $state<'nl' | 'en'>('en');
	onMount(() => {
		locale = getLocale();
		document.documentElement.lang = locale;
		const params = new URL(location.href).searchParams;
		model = params.get('model') === 'movenet' ? 'movenet' : 'mediapipe';
		sound = params.get('sound') === '1';
		const encoded = params.get('workout');
		if (encoded !== null) {
			try {
				workout = decodeWorkout(encoded);
			} catch {
				error = m.invalid_link();
			}
		}
		ready = true;
	});
</script>

<svelte:head>
	<title>{m.page_title()}</title><meta name="theme-color" content="#f8f8f4" />
</svelte:head>
<main class="mx-auto max-w-302 px-[clamp(1rem,3vw,2rem)] py-4 sm:py-6">
	<div class="mb-4 flex items-center justify-between">
		<Card.Root class="size-8 gap-0 overflow-hidden rounded-md p-0 shadow-none">
			<svg class="size-full" viewBox="0 0 40 40" role="img" aria-label={m.brand()}>
				<rect width="40" height="40" fill="#f3713c" />
				<path d="M7 29 18 10h7L14 29zm12 0 8-14 6 14h-7l-1-4-2 4z" fill="#172025" />
			</svg>
		</Card.Root>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			value={locale}
			onValueChange={(value: string) => {
				if (value === 'en' || value === 'nl') void setLocale(value);
			}}
		>
			<ToggleGroup.Item value="en" aria-label={m.english()}>EN</ToggleGroup.Item>
			<ToggleGroup.Item value="nl" aria-label={m.dutch()}>NL</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>
	{#if ready}<Setup {workout} {error} planner={{ model, sound }} />{/if}
</main>
