<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import * as m from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Session, type Workout } from './workout';
	import {
		Tracker,
		exercises,
		type ExerciseId,
		type PoseFrame,
		type TrackingUpdate
	} from './motion';
	import { camera } from './camera';
	import { workoutBusy } from './offline';
	import { name, feedback, cue, clock, reps, staticExercise } from './words';
	import Skeleton from './Skeleton.svelte';
	import Demo from './Demo.svelte';
	import LocalizedSelect from './LocalizedSelect.svelte';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Scan from '@lucide/svelte/icons/scan-line';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	let {
		workout,
		model,
		sound = $bindable(),
		onexit,
		immersive = false
	}: {
		workout: Workout;
		model: 'mediapipe' | 'movenet';
		sound: boolean;
		onexit: () => void;
		immersive?: boolean;
	} = $props();
	const session = new Session(untrack(() => workout));
	let practice = $state<ExerciseId>(
		untrack(() => workout.steps.find((s) => 'exercise' in s)!.exercise)
	);
	const tracker = new Tracker(untrack(() => practice));
	const replay = import.meta.env.VITE_REPLAY === 'true';
	let stage = $state<'practice' | 'countdown' | 'exercise' | 'rest' | 'summary'>('practice');
	let paused = $state(false),
		error = $state<'' | 'camera' | 'model'>(''),
		loaded = $state(false);
	let value = $state(0),
		hold = $state(0),
		signal = $state<TrackingUpdate | null>(null),
		image = $state.raw<PoseFrame | null>(null);
	let video: HTMLVideoElement,
		source: ReturnType<typeof camera> | undefined,
		audio: AudioContext | undefined;
	let deadline = 0,
		countdown = $state(3),
		virtual = 0,
		generation = 0,
		beat = $state(0),
		gone = false;
	let activeId = $state<ExerciseId>(untrack(() => practice)),
		position = $state(''),
		circuit = $state<number | null>(null),
		next = $state<ExerciseId | null>(null),
		readout = $state('');
	let lastCapture = -Infinity,
		lastBeatEpoch = -1;
	let elapsed = $state('00:00'),
		interval = $state(''),
		intervalCount = $state('');
	const practiceOptions = $derived(exercises.map((value) => ({ value, label: name(value) })));
	$effect(() => {
		// Keep the results screen intact too; leaving Live is the update-safe point.
		workoutBusy.set(true);
		return () => workoutBusy.set(false);
	});
	function focusTitle(node: HTMLElement) {
		if (immersive) node.focus({ preventScroll: true });
	}
	const now = () => (replay ? virtual : performance.now() / 1000);
	const epoch = () => (stage === 'practice' ? -1 - generation : session.epoch);
	function beep(freq = 620) {
		if (!sound) return;
		try {
			audio ??= new AudioContext();
			void audio.resume();
			const o = audio.createOscillator(),
				g = audio.createGain();
			o.connect(g);
			g.connect(audio.destination);
			o.frequency.value = freq;
			g.gain.setValueAtTime(0.055, audio.currentTime);
			g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.1);
			o.start();
			o.stop(audio.currentTime + 0.12);
		} catch {
			/* Audio is optional. */
		}
	}
	function clearMotion() {
		image = null;
		signal = null;
		lastCapture = -Infinity;
		generation++;
	}
	function resetPractice() {
		clearMotion();
		activeId = practice;
		tracker.reset(practice);
		value = 0;
		hold = 0;
	}
	function snapshot() {
		if (session.state === 'finished') {
			if (stage !== 'summary') {
				source?.close();
				beep(840);
			}
			stage = 'summary';
			return;
		}
		if (session.state === 'ready') return;
		if (lastBeatEpoch !== session.epoch) {
			clearMotion();
			if (lastBeatEpoch >= 0 && !paused) beep(440);
			lastBeatEpoch = session.epoch;
		}
		const s = session.step,
			r = session.current;
		stage = 'rest' in s ? 'rest' : 'exercise';
		paused = session.state === 'paused';
		circuit = session.circuitRemaining;
		elapsed = clock(Math.floor(session.elapsed));
		interval = 'duration' in s ? clock(session.remaining ?? 0) : '';
		next = session.nextExercise;
		position = m.position({
			round: session.round,
			step: session.stepIndex + 1,
			total: workout.steps.length
		});
		if ('rest' in s) {
			readout = clock(session.remaining ?? 0);
			return;
		}
		activeId = s.exercise;
		signal = session.update;
		const seconds = Math.floor((r?.held ?? 0) + 1e-8),
			count = r?.reps ?? 0;
		if ('reps' in s) readout = m.rep_target({ now: count, target: s.reps });
		else if ('hold' in s)
			readout = m.hold_target({ now: Math.floor((r?.continuous ?? 0) + 1e-8), target: s.hold });
		else {
			intervalCount = staticExercise(s.exercise) ? m.held_s({ n: seconds }) : reps(count);
			readout = m.time_readout({
				count: intervalCount,
				left: m.time_left({ time: clock(session.remaining ?? 0) })
			});
		}
	}
	function step(t: number) {
		if (stage === 'countdown' && !paused) {
			countdown = Math.max(0, deadline - t);
			if (countdown <= 0) {
				session.start(deadline);
				session.tick(t);
				snapshot();
			}
		} else if (stage === 'exercise' || stage === 'rest') {
			session.tick(t);
			snapshot();
		}
		if (
			(stage === 'exercise' || stage === 'practice') &&
			!paused &&
			loaded &&
			t - lastCapture > 0.65 &&
			Number.isFinite(lastCapture)
		) {
			receive(
				{ timestamp: t, width: 1, height: 1, points: {}, missing: true, provider: model },
				epoch()
			);
		}
	}
	function receive(frame: PoseFrame, token: number) {
		if (
			paused ||
			token !== epoch() ||
			frame.timestamp <= lastCapture ||
			(stage !== 'exercise' && stage !== 'practice')
		)
			return;
		lastCapture = frame.timestamp;
		image = frame;
		if (stage === 'practice') {
			signal = tracker.update(frame);
			value += Number(signal.rep);
			const prev = hold;
			hold += signal.held;
			if (signal.rep || Math.floor(hold) > Math.floor(prev)) {
				beat++;
				beep();
			}
		} else {
			const r = session.current,
				prev = r?.reps ?? 0,
				h = Math.floor(r?.held ?? 0);
			session.observe(frame, token);
			if (r && (r.reps > prev || Math.floor(r.held) > h)) {
				beat++;
				beep();
			}
			snapshot();
		}
	}
	function toggle() {
		const t = now();
		if (stage === 'countdown') {
			if (paused) deadline = t + countdown;
			else countdown = Math.max(0, deadline - t);
			paused = !paused;
			return;
		}
		if (paused) session.resume(t);
		else session.pause(t);
		snapshot();
	}
	function visibility(hidden: boolean) {
		if (!hidden) return;
		if (stage === 'practice') {
			tracker.reset(practice);
			clearMotion();
		} else if (!paused && stage !== 'summary') toggle();
	}
	function start() {
		clearMotion();
		deadline = now() + 3;
		countdown = 3;
		stage = 'countdown';
		beep(440);
	}
	function finish() {
		session.finish(now());
		source?.close();
		stage = 'summary';
	}
	async function connect() {
		source?.close();
		loaded = false;
		error = '';
		clearMotion();
		tracker.reset(practice);
		if (stage === 'exercise') session.interrupt(now());
		if (replay) {
			loaded = true;
			return;
		}
		const active = camera(
			video,
			model,
			resolve('/'),
			() => !document.hidden && !paused && (stage === 'practice' || stage === 'exercise'),
			epoch,
			receive,
			(k) => {
				loaded = false;
				error = k;
				if (stage === 'exercise') session.interrupt(now());
				image = null;
			}
		);
		source = active;
		const ok = await active.start();
		if (source === active && !gone) {
			loaded = ok;
			if (ok) lastCapture = now();
		}
	}
	function attachCamera(node: HTMLVideoElement) {
		video = node;
		untrack(() => void connect());
		return () => source?.close();
	}
	onMount(() => {
		let raf = 0;
		const run = () => {
			step(now());
			raf = requestAnimationFrame(run);
		};
		if (!replay) raf = requestAnimationFrame(run);
		const vis = () => visibility(document.hidden);
		document.addEventListener('visibilitychange', vis);
		const exit = () => {
			source?.close();
		};
		window.addEventListener('pagehide', exit);
		if (replay)
			Object.assign(window, {
				__alez: {
					now,
					epoch,
					visibility,
					advance: (s: number) => {
						virtual += Math.max(0, s);
						step(virtual);
					},
					frame: (f: PoseFrame, token = epoch()) => {
						virtual = Math.max(virtual, f.timestamp);
						if (stage !== 'practice') {
							session.tick(virtual);
							snapshot();
						}
						receive(f, token);
					}
				}
			});
		return () => {
			gone = true;
			source?.close();
			cancelAnimationFrame(raf);
			document.removeEventListener('visibilitychange', vis);
			window.removeEventListener('pagehide', exit);
			if (audio) void audio.close();
			if (replay) Reflect.deleteProperty(window, '__alez');
		};
	});
</script>

{#snippet preview()}
	<video {@attach attachCamera} muted autoplay playsinline aria-label={m.preview()}></video>
	{#if image && !paused && stage !== 'rest'}<div class="overlay">
			<Skeleton frame={image} cover={immersive} />
		</div>{/if}
	{#if !image && (replay || !loaded)}<Scan class="scan" aria-hidden="true" />{/if}
{/snippet}

{#snippet selector()}
	<small>{m.practice_select()}</small>
	<LocalizedSelect
		label={m.practice_select()}
		value={practice}
		options={practiceOptions}
		onchange={(id: ExerciseId) => {
			practice = id;
			resetPractice();
		}}
	/>
{/snippet}

{#snippet controls()}
	{#if error}<p role="alert">{error === 'camera' ? m.camera_error() : m.model_error()}</p>
		<Button variant="outline" onclick={connect}>{m.retry()}</Button>
	{:else if !loaded}<p role="status">{m.loading()}</p>{/if}
	<div class="actions">
		<Button variant="outline" aria-pressed={sound} onclick={() => (sound = !sound)}>
			{#if sound}<Volume2 data-icon="inline-start" />{:else}<VolumeX
					data-icon="inline-start"
				/>{/if}{m.setup_sound()}
		</Button>
		{#if stage === 'practice'}<Button size="lg" disabled={!loaded} onclick={start}>
				<Play data-icon="inline-start" />{m.start_workout()}
			</Button><Button variant="outline" onclick={resetPractice}>
				{m.restart_practice()}
			</Button><Button variant="ghost" onclick={onexit}>{m.back_setup()}</Button>
		{:else}<Button onclick={toggle}>
				{#if paused}<Play data-icon="inline-start" />{m.resume()}{:else}<Pause
						data-icon="inline-start"
					/>{m.pause()}{/if}
			</Button><Button variant="outline" onclick={finish}>{m.finish()}</Button>{/if}
	</div>
{/snippet}

<section
	data-testid="stage"
	data-stage={stage}
	data-immersive={immersive || undefined}
	class:immersive
>
	{#if stage === 'summary'}
		<div class="eyebrow"><i></i>{m.private_session()}</div>
		<h1 tabindex="-1" {@attach focusTitle}>{m.summary()}</h1>
		<p>{m.summary_note()}</p>
		<div class="stats">
			<div><span>{m.completed_rounds()}</span><strong>{session.completedRounds}</strong></div>
			<div><span>{m.active_time()}</span><strong>{clock(session.elapsed)}</strong></div>
		</div>
		<p>{m.round_progress({ round: session.round, step: session.stepIndex + 1 })}</p>
		<div class="results">
			{#each session.results as r (`${r.round}-${r.stepIndex}`)}
				{@const target = workout.steps[r.stepIndex]}
				<article data-testid="result">
					<small>
						{m.position({ round: r.round, step: r.stepIndex + 1, total: workout.steps.length })}
					</small>
					<h2>{name(r.exercise)}</h2>
					<b>
						{'reps' in target
							? m.rep_target({ now: r.reps, target: target.reps })
							: 'hold' in target
								? m.hold_target({ now: Math.floor(r.longest), target: target.hold })
								: staticExercise(r.exercise)
									? m.held_s({ n: Math.floor(r.held) })
									: reps(r.reps)}
					</b>
					<p>
						{r.partial ? m.partial() : m.complete()}{#if 'duration' in target}
							· {m.duration_result({ actual: Math.floor(r.elapsed), target: target.duration })}{/if}
					</p>
					{#if staticExercise(r.exercise)}<p>
							{m.held_s({ n: r.held.toFixed(1) })} · {m.longest({ n: r.longest.toFixed(1) })}
						</p>{/if}
					<p>{m.time_lost({ n: r.lost.toFixed(1) })}</p>
				</article>
			{/each}
		</div>
		<Button onclick={onexit}>{m.back_setup()}</Button>
	{:else if immersive}
		<div class="backdrop screen">{@render preview()}</div>
		<div class="hud">
			<div class="topline">
				<header class="pane identity">
					<div class="eyebrow"><i></i>{stage === 'practice' ? m.practice_title() : m.live()}</div>
					<h1 tabindex="-1" {@attach focusTitle}>
						{stage === 'countdown' ? m.ready() : stage === 'rest' ? m.rest_title() : name(activeId)}
					</h1>
					{#if stage === 'practice'}<p>{m.practice_intro()}</p>{:else}<small data-testid="position">
							{stage === 'countdown'
								? m.position({ round: 1, step: 1, total: workout.steps.length })
								: position}
						</small>{/if}
				</header>
				{#if !paused && (stage === 'practice' || stage === 'exercise')}<Demo
						exercise={activeId}
						docked
					/>{/if}
			</div>
			<div class="deck">
				<div class="pane telemetry">
					<small>
						{stage === 'countdown'
							? m.ready()
							: stage === 'rest'
								? m.rest_title()
								: stage === 'exercise' && interval
									? m.setup_interval()
									: staticExercise(activeId)
										? m.setup_hold()
										: m.setup_reps()}
					</small>
					{#key beat}<div class="digits" data-testid="counter" class:pulse={beat > 0}>
							{#if stage === 'practice'}{staticExercise(practice)
									? m.held_s({ n: Math.floor(hold) })
									: reps(value)}{:else if stage === 'countdown'}{Math.ceil(
									countdown
								)}{:else if stage === 'rest'}<span data-testid="rest-clock">
									{readout}
								</span>{:else}{interval || readout}{/if}
						</div>{/key}
					{#if stage === 'exercise' && interval}<strong>{intervalCount}</strong>{/if}
					{#if circuit !== null}<small data-testid="circuit-clock">
							{m.circuit_left({ time: clock(circuit) })}
						</small>{:else if stage === 'exercise' || stage === 'rest'}<small>
							{m.active_time()} · {elapsed}
						</small>{/if}
				</div>
				<div class="pane command dark">
					{#if paused}<strong role="status">
							{m.paused()}
						</strong>{:else if stage === 'rest' && next}<strong data-testid="next">
							{m.next_ex({ exercise: name(next) })}
						</strong>{:else if stage === 'practice' || stage === 'exercise'}<div>
							<b data-testid="feedback">{feedback(activeId, signal)}</b>
							<p>{cue(activeId)}</p>
						</div>{/if}
					{#if stage === 'practice'}{@render selector()}{/if}
					{@render controls()}
				</div>
			</div>
		</div>
	{:else}
		<div class="eyebrow"><i></i>{stage === 'practice' ? m.practice_title() : m.live()}</div>
		<h1>
			{stage === 'practice'
				? m.practice_title()
				: stage === 'countdown'
					? m.ready()
					: stage === 'rest'
						? m.rest_title()
						: name(activeId)}
		</h1>
		{#if stage === 'practice'}<p>{m.practice_intro()}</p>{:else}<p data-testid="position">
				{position}
			</p>{/if}
		<div class="live-grid">
			<div class="screen">
				{@render preview()}
				{#if stage === 'practice' || stage === 'exercise'}<Demo exercise={activeId} />{/if}
			</div>
			<aside>
				{#if stage === 'practice'}{@render selector()}{/if}
				{#if circuit !== null}<small data-testid="circuit-clock">
						{m.circuit_left({ time: clock(circuit) })}
					</small>{/if}
				{#key beat}<div data-testid="counter" class="digits" class:pulse={beat > 0}>
						{#if stage === 'practice'}{staticExercise(practice)
								? m.held_s({ n: Math.floor(hold) })
								: reps(value)}{:else if stage === 'countdown'}{Math.ceil(
								countdown
							)}{:else if stage === 'rest'}<span data-testid="rest-clock">
								{readout}
							</span>{:else}{readout}{/if}
					</div>{/key}
				{#if paused}<b>{m.paused()}</b>{:else if stage === 'rest'}{#if next}<p data-testid="next">
							{m.next_ex({ exercise: name(next) })}
						</p>{/if}{:else if stage !== 'countdown'}<b
						data-testid="feedback"
						class:lost={signal?.status === 'lost'}
					>
						{feedback(activeId, signal)}
					</b>
					<p>{cue(activeId)}</p>{/if}
				{@render controls()}
			</aside>
		</div>
	{/if}
</section>

<style>
	section {
		padding: 2rem 0 3rem;
	}
	.eyebrow,
	small,
	.stats span {
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #9d3c1c;
	}
	.eyebrow i {
		width: 1.3rem;
		height: 3px;
		background: #ea702d;
	}
	h1 {
		font-size: clamp(2.3rem, 5vw, 4rem);
		line-height: 1;
		letter-spacing: -0.065em;
		font-weight: 720;
		margin: 0.65rem 0;
	}
	p {
		color: #565b60;
		line-height: 1.5;
	}
	.live-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(17rem, 1fr);
		gap: 1.25rem;
		margin-top: 1.6rem;
	}
	.screen {
		position: relative;
		min-height: 22rem;
		background: #182026;
		overflow: hidden;
		border-radius: 1rem;
		isolation: isolate;
	}
	video,
	.overlay {
		position: absolute;
		width: 100%;
		height: 100%;
		inset: 0;
		object-fit: contain;
		transform: scaleX(-1);
	}
	.screen :global(.scan) {
		position: absolute;
		width: 3.2rem;
		height: 3.2rem;
		color: #718087;
		left: calc(50% - 1.6rem);
		top: calc(50% - 1.6rem);
	}
	aside,
	article,
	.stats {
		padding: clamp(1.25rem, 3vw, 2rem);
		border: 1px solid #deded6;
		background: white;
		border-radius: 1rem;
	}
	aside {
		display: flex;
		align-items: flex-start;
		flex-direction: column;
		gap: 0.75rem;
	}
	.digits {
		font-weight: 720;
		font-size: clamp(2rem, 4.4vw, 4.2rem);
		letter-spacing: -0.065em;
		line-height: 1.08;
		font-variant-numeric: tabular-nums;
	}
	.pulse {
		animation: bump 0.24s ease-out;
	}
	@keyframes bump {
		from {
			transform: scale(1.04);
			color: #ca5320;
		}
	}
	aside b {
		color: #166a51;
	}
	aside .lost {
		color: #a33b22;
	}
	.actions {
		display: flex;
		gap: 0.55rem;
		flex-wrap: wrap;
		margin-top: auto;
		padding-top: 1rem;
	}
	.stats {
		display: flex;
		gap: 3rem;
		margin: 1.5rem 0;
	}
	.stats span,
	.stats strong {
		display: block;
	}
	.stats strong {
		font-size: 2.2rem;
	}
	.results {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1rem;
		margin: 1rem 0;
	}
	article h2 {
		font-size: 1.35rem;
		font-weight: 700;
	}
	article b {
		font-size: 1.75rem;
	}
	article small {
		color: #986143;
	}
	@media (max-width: 730px) {
		.live-grid {
			grid-template-columns: 1fr;
		}
		.screen {
			min-height: 0;
			aspect-ratio: 4/3;
		}
		.actions {
			margin-top: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
		}
	}
	.immersive {
		position: fixed;
		inset: 0;
		height: 100dvh;
		padding: 0;
		overflow: auto;
		overscroll-behavior: contain;
		isolation: isolate;
		background: var(--studio-paper);
	}
	.immersive[data-stage='summary'] {
		padding: clamp(1rem, 5vw, 4rem) max(1rem, calc((100% - 64rem) / 2));
	}
	.immersive .backdrop {
		position: fixed;
		inset: 0;
		min-height: 0;
		aspect-ratio: auto;
		border-radius: 0;
	}
	.backdrop video {
		object-fit: cover;
	}
	.hud {
		--gutter: clamp(0.7rem, 2.2vw, 2rem);
		--ink: #172026;
		--signal: #ffc789;
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: clamp(2rem, 12dvh, 9rem);
		min-height: 100%;
		padding: max(var(--gutter), env(safe-area-inset-top))
			max(var(--gutter), env(safe-area-inset-right)) max(var(--gutter), env(safe-area-inset-bottom))
			max(var(--gutter), env(safe-area-inset-left));
	}
	.topline,
	.deck {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.65rem;
	}
	.pane {
		min-width: 0;
		border-radius: 0.75rem;
		padding: clamp(0.7rem, 1.5vw, 1.3rem);
	}
	.identity,
	.telemetry {
		background: var(--ink);
		color: white;
		box-shadow: inset 3px 0 var(--signal);
	}
	.identity {
		max-width: 27rem;
	}
	.hud h1 {
		font-size: clamp(1.4rem, 4vw, 3.4rem);
		margin: 0.25rem 0;
		overflow-wrap: anywhere;
	}
	.hud .eyebrow,
	.identity small,
	.telemetry small {
		color: var(--signal);
	}
	.hud .eyebrow i {
		background: currentColor;
	}
	.identity p {
		color: inherit;
	}
	.deck {
		align-items: flex-end;
	}
	.telemetry,
	.command {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.telemetry .digits {
		font-size: clamp(2.25rem, min(8vw, 12dvh), 7.25rem);
	}
	.command {
		color-scheme: dark;
		background: var(--ink);
		border: 1px solid #647079;
		color: var(--foreground);
		max-width: 28rem;
	}
	.hud p {
		font-size: 0.88rem;
		line-height: 1.3;
	}
	.command p {
		color: inherit;
	}
	.hud .actions {
		margin: 0;
		padding: 0.2rem 0 0;
		gap: 0.35rem;
		align-items: center;
	}
	.hud .command [role='alert'] {
		font-weight: 650;
		color: #ffc1ac;
	}
	.immersive :global(:focus-visible) {
		outline: 3px solid #1979d3;
		outline-offset: 2px;
	}
	@media (max-width: 600px) and (orientation: portrait) {
		.hud {
			gap: 1rem;
		}
		.deck {
			flex-direction: column;
			align-items: stretch;
		}
		.telemetry {
			align-self: flex-start;
		}
		.command {
			max-width: none;
		}
	}
	@media (max-height: 480px) and (orientation: landscape) {
		.hud {
			--gutter: 0.5rem;
			gap: 0.65rem;
		}
		.pane {
			padding: 0.6rem 0.8rem;
		}
		.identity {
			max-width: min(48vw, 28rem);
		}
		.command {
			max-width: min(70vw, 32rem);
		}
		.hud h1 {
			font-size: 1.5rem;
		}
	}
</style>
