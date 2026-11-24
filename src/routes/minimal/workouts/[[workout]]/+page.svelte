<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { decodeWorkout, encodeWorkout, type Workout } from '#lib/workout.js';
	import { randomWorkout } from '#lib/minimal-workout.js';
	import { name, reps } from '#lib/words.js';
	import Live from '#lib/Live.svelte';
	import Camera from '@lucide/svelte/icons/camera';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let workout = $state.raw<Workout | null>(null);
	let entered = $state(false),
		invalid = $state(false);
	let model = $derived(
		page.url.searchParams.get('model') === 'movenet' ? ('movenet' as const) : ('mediapipe' as const)
	);
	let sound = $state(false);
	let plannerQuery = $derived<`?${string}` | ''>(
		workout
			? `?${new URLSearchParams({ workout: encodeWorkout(workout), model, sound: sound ? '1' : '0' })}`
			: ''
	);

	afterNavigate(({ type, from }) => {
		document.documentElement.lang = getLocale();
		sound = page.url.searchParams.get('sound') === '1';
		const encoded = page.params.workout;
		invalid = false;
		entered = false;
		workout = null;
		if (!encoded) {
			const generated = encodeWorkout(randomWorkout());
			void goto(resolve(`minimal/workouts/${generated}/${page.url.search}`), { replace: true });
			return;
		}
		try {
			workout = decodeWorkout(encoded);
			// Only Start workout navigates programmatically from the planner. Pasted
			// links, history traversal and reloads always require Enable camera.
			entered = type === 'goto' && from?.route.id === '/minimal';
		} catch {
			invalid = true;
		}
	});
</script>

<svelte:head>
	<title>{m.live()} · {m.brand()}</title><meta name="theme-color" content="#172026" />
</svelte:head>

<main>
	{#if workout && entered}
		{#key workout}
			<Live
				immersive
				{workout}
				{model}
				bind:sound
				onexit={() => void goto(resolve(`/minimal${plannerQuery}`))}
			/>
		{/key}
	{:else if workout || invalid}
		<section class="entry" data-testid="workout-preview">
			<div class="sheet">
				<p class="eyebrow">{m.brand()} / {m.private_session()}</p>
				{#if workout}
					<h1>{m.setup_circuit()}</h1>
					<p class="intro">{m.camera_entry()}</p>
					<ol>
						{#each workout.steps as step, i (i)}
							<li>
								<span class="index" aria-hidden="true">
									{String(i + 1).padStart(2, '0')}
								</span><strong>
									{'exercise' in step ? name(step.exercise) : m.rest_title()}
								</strong><span>
									{'reps' in step
										? reps(step.reps)
										: 'hold' in step
											? `${m.setup_hold()} · ${m.setup_s({ n: step.hold })}`
											: m.setup_s({ n: 'rest' in step ? step.rest : step.duration })}
								</span>
							</li>
						{/each}
					</ol>
					<p class="meta">
						{workout.repeat && 'duration' in workout.repeat
							? `${m.setup_time()}: ${m.setup_s({ n: workout.repeat.duration })}`
							: `${m.setup_rounds()}: ${workout.repeat?.rounds ?? 1}`} · {m.setup_auto_short()}: {m.setup_s(
							{ n: workout.rest ?? 0 }
						)}
					</p>
				{:else}
					<h1>{m.live()}</h1>
					<p class="intro" role="alert">{m.invalid_link()}</p>
				{/if}
				<div class="entry-actions">
					{#if workout}<Button size="lg" onclick={() => (entered = true)}>
							<Camera data-icon="inline-start" />{m.camera_enable()}
						</Button>{/if}
					<Button variant="outline" href={resolve(`/minimal${plannerQuery}`)}>
						<ArrowLeft data-icon="inline-start" />{m.back_setup()}
					</Button>
				</div>
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		min-height: 100svh;
	}
	.entry {
		min-height: 100svh;
		background: #172026;
		display: grid;
		place-items: center;
		padding: clamp(1rem, 5vw, 3rem);
		background-image: radial-gradient(#ffffff16 1px, transparent 1px);
		background-size: 18px 18px;
	}
	.sheet {
		width: min(100%, 36rem);
		padding: clamp(1.5rem, 5vw, 3rem);
		border-radius: 1rem;
		background: var(--studio-paper);
		border-top: 5px solid #f3713c;
	}
	.eyebrow,
	.index {
		font:
			700 0.7rem/1.5 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #89401e;
	}
	h1 {
		font-weight: 750;
		letter-spacing: -0.055em;
		font-size: clamp(2.5rem, 6vw, 3.6rem);
		line-height: 1.05;
		margin: 0.6rem 0 1rem;
	}
	.intro,
	.meta {
		color: #555c59;
	}
	.meta {
		font-size: 0.8rem;
	}
	ol {
		margin: 1.5rem 0 0.7rem;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
		border-bottom: 1px solid #d6d9d0;
		padding: 0.65rem 0;
	}
	li span:last-child {
		margin-left: auto;
		color: #4c5553;
		font-size: 0.84rem;
	}
	.entry-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}
</style>
