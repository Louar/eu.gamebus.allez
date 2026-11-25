<script lang="ts">
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import Live from '#lib/Live.svelte';
	import { randomWorkout } from '#lib/minimal-workout.js';
	import { updateLocked } from '#lib/offline.js';
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { name, reps } from '#lib/words.js';
	import { decodeWorkout, encodeWorkout, type Workout } from '#lib/workout.js';
	import WorkoutSettings from '#lib/WorkoutSettings.svelte';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Camera from '@lucide/svelte/icons/camera';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	let workout = $state.raw<Workout | null>(null);
	let entered = $state(false),
		invalid = $state(false);
	let model = $state<'mediapipe' | 'movenet'>('mediapipe');
	let cameraId = $state('');
	function changeModel(value: 'mediapipe' | 'movenet') {
		model = value;
		const url = new URL(page.url.href);
		url.searchParams.set('model', value);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- Current URL already includes the app base path.
		void replaceState(url, page.state);
	}
	let sound = $state(true);
	let plannerQuery = $derived<`?${string}` | ''>(
		workout
			? `?${new URLSearchParams({ workout: encodeWorkout(workout), model, sound: sound ? '1' : '0' })}`
			: ''
	);

	afterNavigate(({ type, from }) => {
		document.documentElement.lang = getLocale();
		sound = page.url.searchParams.get('sound') !== '0';
		model = page.url.searchParams.get('model') === 'movenet' ? 'movenet' : 'mediapipe';
		const encoded = page.params.workout;
		invalid = false;
		entered = false;
		workout = null;
		if (!encoded) {
			const generated = encodeWorkout(randomWorkout());
			void goto(resolve(`workouts/${generated}/${page.url.search}`), { replace: true });
			return;
		}
		try {
			workout = decodeWorkout(encoded);
			// Only Start workout navigates programmatically from the planner. Pasted
			// links, history traversal and reloads always require Enable camera.
			entered = !$updateLocked && type === 'goto' && from?.route.id === '/';
		} catch {
			invalid = true;
		}
	});
</script>

<svelte:head>
	<title>{m.live()} · {m.brand()}</title><meta name="theme-color" content="#172026" />
</svelte:head>

<main class="min-h-svh">
	{#if workout && entered}
		{#key workout}
			<Live
				{workout}
				{model}
				bind:cameraId
				onmodelchange={changeModel}
				bind:sound
				onexit={() => void goto(resolve(`/${plannerQuery}`))}
			/>
		{/key}
	{:else if workout || invalid}
		<section
			class="grid min-h-svh place-items-center bg-studio-ink bg-[radial-gradient(#ffffff16_1px,transparent_1px)] bg-size-[18px_18px] p-[clamp(1rem,5vw,3rem)]"
			data-testid="workout-preview"
		>
			<Card.Root class="w-full max-w-xl  [--card:var(--studio-paper)]">
				<Card.Header>
					{#if workout}
						<Card.Action>
							<WorkoutSettings {model} bind:cameraId bind:sound onmodelchange={changeModel} />
						</Card.Action>
					{/if}
					<Card.Title>
						<h1 class="text-[clamp(1.5rem,5vw,2rem)] leading-[1.05] font-[750] tracking-[-0.055em]">
							{workout ? m.setup_circuit() : m.live()}
						</h1>
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if workout}
						<p class="text-xs text-muted-foreground">
							{workout.repeat && 'duration' in workout.repeat
								? `${m.setup_time()}: ${m.setup_s({ n: workout.repeat.duration })}`
								: `${m.setup_rounds()}: ${workout.repeat?.rounds ?? 1}`} · {m.setup_auto_short()}: {m.setup_s(
								{ n: workout.rest ?? 0 }
							)}
						</p>
						<ol>
							{#each workout.steps as step, i (i)}
								<li class="flex flex-wrap items-baseline gap-3 border-b py-2.5">
									<span
										class="font-mono text-xs font-bold tracking-[0.12em] text-studio-rust"
										aria-hidden="true"
									>
										{String(i + 1).padStart(2, '0')}
									</span><strong>
										{'exercise' in step ? name(step.exercise) : m.rest_title()}
									</strong><span class="ml-auto text-sm text-muted-foreground">
										{'reps' in step
											? reps(step.reps)
											: 'hold' in step
												? `${m.setup_hold()} · ${m.setup_s({ n: step.hold })}`
												: m.setup_s({ n: 'rest' in step ? step.rest : step.duration })}
									</span>
								</li>
							{/each}
						</ol>
					{:else}
						<Alert.Root variant="destructive">
							<Alert.Description>{m.invalid_link()}</Alert.Description>
						</Alert.Root>
					{/if}
				</Card.Content>
				<Card.Footer class="flex w-full  flex-col gap-3">
					<div class="flex w-full flex-wrap justify-between gap-3 md:flex-nowrap">
						<Button
							size="lg"
							class="w-full md:w-fit"
							variant="outline"
							href={resolve(`/${plannerQuery}`)}
						>
							<ArrowLeft data-icon="inline-start" />{m.back_setup()}
						</Button>
						{#if workout}
							<Button
								size="lg"
								class="ml-auto w-full md:w-fit"
								disabled={$updateLocked}
								onclick={() => (entered = true)}
							>
								<Camera data-icon="inline-start" />{m.camera_enable()}
							</Button>
						{/if}
					</div>
					<Alert.Root
						role="note"
						class="w-full [--card-foreground:var(--privacy-foreground)] [--card:var(--privacy-background)] [--muted-foreground:var(--privacy-foreground)]"
					>
						<ShieldCheck />
						<Alert.Title>{m.setup_privacy_title()}</Alert.Title>
						<Alert.Description>{m.setup_privacy()}</Alert.Description>
					</Alert.Root>
				</Card.Footer>
			</Card.Root>
		</section>
	{/if}
</main>
