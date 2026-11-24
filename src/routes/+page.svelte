<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale, setLocale } from '#lib/paraglide/runtime.js';
	import Setup from '#lib/Setup.svelte';
	import { decodeWorkout, example, type Workout } from '#lib/workout.js';
	import Shield from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';
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
<header class="sticky top-0 z-10 mb-6">
	<div class="bar">
		<div class="identity">
			<svg width="37" height="37" viewBox="0 0 40 40" aria-hidden="true">
				<rect width="40" height="40" rx="10" fill="#f3713c" /><path
					d="M7 29 18 10h7L14 29zm12 0 8-14 6 14h-7l-1-4-2 4z"
					fill="#172025"
				/>
			</svg><strong>{m.brand()}</strong><span class="descriptor">{m.studio()}</span>
		</div>
		<div class="tools">
			<div class="languages">
				<button
					aria-label={m.english()}
					aria-pressed={locale === 'en'}
					onclick={() => setLocale('en')}
				>
					EN
				</button><button
					aria-label={m.dutch()}
					aria-pressed={locale === 'nl'}
					onclick={() => setLocale('nl')}
				>
					NL
				</button>
			</div>
		</div>
	</div>
</header>
<main>
	{#if ready}<Setup {workout} {error} planner={{ model, sound }} />{/if}
</main>
<footer>
	<!-- <span>{m.brand()} <b>/</b> {m.studio()}</span> -->
	<span class="ml-auto">
		<Shield size={14} aria-hidden="true" />{m.local_blurb()}
	</span>
	<span class="private"><i></i>{m.private_session()}</span>
</footer>

<style>
	header {
		background: #fff;
		border-bottom: 1px solid #dfdfd9;
	}
	.bar,
	main,
	footer {
		max-width: 1208px;
		margin: auto;
		padding-left: clamp(1rem, 3vw, 2rem);
		padding-right: clamp(1rem, 3vw, 2rem);
	}
	.bar,
	.identity,
	.tools,
	.private,
	footer,
	footer span,
	.languages {
		display: flex;
		align-items: center;
	}
	.bar {
		min-height: 72px;
		justify-content: space-between;
	}
	.identity {
		gap: 0.65rem;
	}
	.identity strong {
		font-weight: 820;
		font-size: 1.85rem;
		letter-spacing: -0.08em;
		line-height: 1;
	}
	.descriptor {
		font-size: 0.8rem;
		font-weight: 550;
		color: #656762;
		border-left: 1px solid #dadcd4;
		padding-left: 1rem;
		margin-left: 0.4rem;
	}
	.tools {
		gap: 1.2rem;
	}
	.languages {
		border: 1px solid #d8d9d3;
		border-radius: 0.45rem;
		padding: 2px;
	}
	.languages button {
		padding: 0.25rem 0.45rem;
		color: #5c6262;
		font-weight: 650;
		font-size: 0.68rem;
		letter-spacing: 0.03em;
		border-radius: 0.28rem;
	}
	.languages button[aria-pressed='true'] {
		color: white;
		background: #242b30;
	}
	.private {
		gap: 0.45rem;
		font-size: 0.73rem;
		font-weight: 600;
	}
	.private i {
		height: 7px;
		width: 7px;
		border-radius: 50%;
		background: #43856c;
	}
	main {
		min-height: calc(100svh - 160px);
	}
	footer {
		border-top: 1px solid #dbddd4;
		min-height: 65px;
		margin-top: 1.5rem;
		justify-content: space-between;
		gap: 1.5rem;
		color: #686c67;
		font-size: 0.7rem;
	}
	footer span {
		gap: 0.45rem;
	}
	footer b {
		color: #e37d4b;
	}
	@media (max-width: 620px) {
		.descriptor {
			display: none;
		}
		.bar {
			min-height: 60px;
		}
		.tools {
			gap: 0.7rem;
		}
	}
	@media (max-width: 400px) {
		.private {
			display: none;
		}
	}
</style>
