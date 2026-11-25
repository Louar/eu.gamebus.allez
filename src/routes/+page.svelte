<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale, setLocale } from '#lib/paraglide/runtime.js';
	import Setup from '#lib/Setup.svelte';
	import { decodeWorkout, example, type Workout } from '#lib/workout.js';
	import Shield from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
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
<header class="sticky top-0 z-10 mb-6 border-b bg-background">
	<div
		class="mx-auto flex min-h-15 max-w-302 items-center justify-between px-[clamp(1rem,3vw,2rem)] min-[621px]:min-h-18"
	>
		<div class="flex items-center gap-2.5">
			<svg width="37" height="37" viewBox="0 0 40 40" aria-hidden="true">
				<rect width="40" height="40" rx="10" fill="#f3713c" /><path
					d="M7 29 18 10h7L14 29zm12 0 8-14 6 14h-7l-1-4-2 4z"
					fill="#172025"
				/>
			</svg><strong class="text-[1.85rem] leading-none font-[820] tracking-[-0.08em]">
				{m.brand()}
			</strong>
			<Separator orientation="vertical" class="ml-1 hidden h-5 min-[621px]:block" />
			<span class="hidden text-sm font-medium text-muted-foreground min-[621px]:inline">
				{m.studio()}
			</span>
		</div>
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
</header>
<main class="mx-auto min-h-[calc(100svh-160px)] max-w-302 px-[clamp(1rem,3vw,2rem)]">
	{#if ready}<Setup {workout} {error} planner={{ model, sound }} />{/if}
</main>
<footer
	class="mx-auto mt-6 flex min-h-16 max-w-302 items-center justify-between gap-6 border-t px-[clamp(1rem,3vw,2rem)] text-[0.7rem] text-muted-foreground"
>
	<span class="ml-auto flex items-center gap-2">
		<Shield size={14} aria-hidden="true" />{m.local_blurb()}
	</span>
	<span class="hidden items-center gap-2 text-xs font-semibold min-[401px]:flex">
		<i class="size-[7px] rounded-full bg-studio-success"></i>{m.private_session()}
	</span>
</footer>
