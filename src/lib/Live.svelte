<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import * as m from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Toggle } from '#lib/components/ui/toggle/index.js';
	import { DropdownMenu } from 'bits-ui';
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
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Square from '@lucide/svelte/icons/square';
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
	let pauseMenu = $state(false);
	const trackingLost = $derived(
		!paused && (stage === 'practice' || stage === 'exercise') && signal?.status === 'lost'
	);
	const trackingLabel = $derived(
		paused
			? m.paused()
			: stage === 'rest'
				? m.rest_title()
				: stage === 'countdown'
					? m.ready()
					: feedback(activeId, signal)
	);
	onMount(() => {
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
		if (stage === 'practice') {
			paused = !paused;
			if (!paused) {
				tracker.reset(practice);
				clearMotion();
			}
			return;
		}
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
		paused = false;
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
			<Skeleton frame={image} />
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
	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Title>{error === 'camera' ? m.camera_error() : m.model_error()}</Alert.Title>
			<Alert.Description>
				<Button variant="outline" onclick={connect}>{m.retry()}</Button>
			</Alert.Description>
		</Alert.Root>
	{:else if !loaded}
		<Alert.Root role="status"><Alert.Title>{m.loading()}</Alert.Title></Alert.Root>
	{/if}
	<div class="actions mt-auto flex flex-wrap gap-[0.55rem] pt-4 max-[730px]:mt-0">
		<Toggle variant="outline" bind:pressed={sound}>
			{#if sound}<Volume2 data-icon="inline-start" />{:else}<VolumeX
					data-icon="inline-start"
				/>{/if}{m.setup_sound()}
		</Toggle>
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
	class="pt-8 pb-12"
	class:immersive
>
	{#if stage === 'summary'}
		<div class="eyebrow flex items-center gap-2"><i></i>{m.private_session()}</div>
		<h1 tabindex="-1" {@attach focusTitle}>{m.summary()}</h1>
		<p>{m.summary_note()}</p>
		<div class="my-6 grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
			<Card.Root>
				<Card.Header><Card.Title>{m.completed_rounds()}</Card.Title></Card.Header>
				<Card.Content>
					<strong class="text-4xl tabular-nums">{session.completedRounds}</strong>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header><Card.Title>{m.active_time()}</Card.Title></Card.Header>
				<Card.Content>
					<strong class="text-4xl tabular-nums">{clock(session.elapsed)}</strong>
				</Card.Content>
			</Card.Root>
		</div>
		<p>{m.round_progress({ round: session.round, step: session.stepIndex + 1 })}</p>
		<div class="my-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
			{#each session.results as r (`${r.round}-${r.stepIndex}`)}
				{@const target = workout.steps[r.stepIndex]}
				<Card.Root role="article" data-testid="result">
					<Card.Header>
						<Card.Description>
							{m.position({ round: r.round, step: r.stepIndex + 1, total: workout.steps.length })}
						</Card.Description>
						<Card.Title role="heading" aria-level={2}>{name(r.exercise)}</Card.Title>
					</Card.Header>
					<Card.Content class="flex flex-col gap-2">
						<strong class="text-[1.75rem] tabular-nums">
							{'reps' in target
								? m.rep_target({ now: r.reps, target: target.reps })
								: 'hold' in target
									? m.hold_target({ now: Math.floor(r.longest), target: target.hold })
									: staticExercise(r.exercise)
										? m.held_s({ n: Math.floor(r.held) })
										: reps(r.reps)}
						</strong>
						<p>
							{r.partial ? m.partial() : m.complete()}{#if 'duration' in target}
								· {m.duration_result({
									actual: Math.floor(r.elapsed),
									target: target.duration
								})}{/if}
						</p>
						{#if staticExercise(r.exercise)}<p>
								{m.held_s({ n: r.held.toFixed(1) })} · {m.longest({ n: r.longest.toFixed(1) })}
							</p>{/if}
					</Card.Content>
					<Card.Footer><p>{m.time_lost({ n: r.lost.toFixed(1) })}</p></Card.Footer>
				</Card.Root>
			{/each}
		</div>
		<Button onclick={onexit}>{m.back_setup()}</Button>
	{:else if immersive}
		<div class="backdrop screen">
			{@render preview()}
		</div>
		{#if trackingLost}<div
				class="tracking-shade"
				data-testid="tracking-overlay"
				aria-hidden="true"
			></div>{/if}
		<div class="hud">
			<div class="pane command dark" data-testid="session-controls">
				<div class="toolbar">
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={m.setup_sound()}
						title={m.setup_sound()}
						aria-pressed={sound}
						onclick={() => (sound = !sound)}
					>
						{#if sound}<Volume2 />{:else}<VolumeX />{/if}
					</Button>
					<DropdownMenu.Root
						bind:open={
							() => pauseMenu,
							(open) => {
								if (open && !paused) {
									toggle();
									pauseMenu = false;
								} else pauseMenu = open;
							}
						}
					>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-lg"
									aria-label={m.pause()}
									aria-pressed={paused}
									title={paused ? m.paused() : m.pause()}
								>
									<Pause />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="session-menu" align="end" sideOffset={12}>
							<DropdownMenu.Group aria-label={m.paused()}>
								<DropdownMenu.Item onSelect={toggle}><Play />{m.resume()}</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={stage === 'practice' ? onexit : finish}>
									<Square />{stage === 'practice' ? m.back_setup() : m.finish()}
								</DropdownMenu.Item>
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									data-tracking={trackingLost ? 'lost' : (signal?.status ?? 'waiting')}
									aria-label={trackingLabel}
									title={trackingLabel}
								>
									<Scan data-icon="inline-start" /><span data-testid="feedback" role="status">
										{trackingLabel}
									</span>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="session-menu tracking-help" align="end" sideOffset={12}>
							<p>{cue(activeId)}</p>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					{#if stage === 'practice'}
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={m.restart_practice()}
							title={m.restart_practice()}
							onclick={resetPractice}
						>
							<RotateCcw />
						</Button>
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={m.back_setup()}
							title={m.back_setup()}
							onclick={onexit}
						>
							<ArrowLeft />
						</Button>
					{/if}
				</div>
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Title>{error === 'camera' ? m.camera_error() : m.model_error()}</Alert.Title>
						<Alert.Description>
							<Button variant="outline" onclick={connect}>{m.retry()}</Button>
						</Alert.Description>
					</Alert.Root>
				{:else if !loaded}<p role="status">{m.loading()}</p>{/if}
				{#if stage === 'practice'}
					<div class="practice-actions">
						<div class="practice-picker">{@render selector()}</div>
						<Button size="lg" disabled={!loaded} onclick={start}>
							<Play data-icon="inline-start" />{m.start_workout()}
						</Button>
					</div>
				{:else}
					<div class="session-meta">
						<span data-testid="position">
							{stage === 'countdown'
								? m.position({ round: 1, step: 1, total: workout.steps.length })
								: position}
						</span>
						<span>{m.active_time()} {elapsed}</span>
						{#if circuit !== null}<span data-testid="circuit-clock">
								{m.circuit_left({ time: clock(circuit) })}
							</span>{/if}
					</div>
				{/if}
			</div>
			<div class="exercise-deck">
				<header class="pane identity" data-testid="current-exercise">
					<small>{stage === 'practice' ? m.practice_title() : m.current_exercise()}</small>
					<h1 tabindex="-1" {@attach focusTitle}>
						{stage === 'countdown' ? m.ready() : stage === 'rest' ? m.rest_title() : name(activeId)}
					</h1>
					{#if stage === 'practice' || stage === 'exercise'}<Demo exercise={activeId} docked />
					{:else if stage === 'rest' && next}<p data-testid="next">
							{m.next_ex({ exercise: name(next) })}
						</p>{/if}
				</header>
				<div class="pane telemetry" data-testid="exercise-progress">
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
									? Math.floor(hold)
									: value}{:else if stage === 'countdown'}{Math.ceil(
									countdown
								)}{:else if stage === 'rest'}<span data-testid="rest-clock">
									{readout}
								</span>{:else}{interval || readout}{/if}
						</div>{/key}
					{#if stage === 'exercise' && interval}<strong>{intervalCount}</strong>{/if}
					{#if paused}<span class="paused-label" role="status">{m.paused()}</span>{/if}
				</div>
			</div>
		</div>
	{:else}
		<div class="eyebrow flex items-center gap-2">
			<i></i>{stage === 'practice' ? m.practice_title() : m.live()}
		</div>
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
		<div
			class="mt-[1.6rem] grid grid-cols-1 gap-5 min-[731px]:grid-cols-[minmax(0,1.6fr)_minmax(17rem,1fr)]"
		>
			<div
				class="screen relative isolate min-h-88 overflow-hidden rounded-2xl max-[730px]:aspect-4/3 max-[730px]:min-h-0"
			>
				{@render preview()}
				{#if stage === 'practice' || stage === 'exercise'}<Demo exercise={activeId} />{/if}
			</div>
			<aside
				class="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-[clamp(1.25rem,3vw,2rem)]"
			>
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
	.eyebrow,
	small {
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.eyebrow {
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
	.screen {
		background: #182026;
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
	.hud {
		--gutter: clamp(0.7rem, 2.2vw, 2rem);
		--ink: #172026;
		--signal: #ffc789;
		position: relative;
		display: flex;
		min-height: 100%;
		flex-direction: column;
		align-items: flex-end;
		gap: 1rem;
		padding: max(var(--gutter), env(safe-area-inset-top))
			max(var(--gutter), env(safe-area-inset-right)) max(var(--gutter), env(safe-area-inset-bottom))
			max(var(--gutter), env(safe-area-inset-left));
	}
	.pane {
		min-width: 0;
		border-radius: 1rem;
		padding: clamp(1rem, 1.7vw, 1.75rem);
	}
	.identity,
	.telemetry {
		background: var(--ink);
		color: white;
	}
	.hud h1 {
		font-size: clamp(2rem, 3.8vw, 4rem);
		margin: 0.5rem 0 1rem;
		overflow-wrap: anywhere;
	}
	.hud small {
		font-size: clamp(0.8rem, 1.1vw, 1rem);
		color: var(--signal);
	}
	.identity p {
		color: inherit;
	}
	.exercise-deck {
		display: grid;
		width: clamp(20rem, 30vw, 32rem);
		gap: 0.75rem;
		margin-top: auto;
	}
	.telemetry {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.6rem;
	}
	.telemetry .digits {
		font-size: clamp(3.5rem, 6.5vw, 7rem);
		white-space: nowrap;
	}
	.telemetry strong,
	.paused-label {
		font-size: clamp(1.1rem, 1.8vw, 1.75rem);
	}
	.paused-label {
		color: var(--signal);
	}
	.command {
		color-scheme: dark;
		background: var(--ink);
		color: var(--foreground);
		width: fit-content;
		max-width: min(100%, 34rem);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.25rem;
	}
	.toolbar :global(button) {
		min-height: 2.75rem;
		flex-shrink: 0;
	}
	.toolbar :global([data-tracking]) {
		flex-shrink: 1;
		white-space: normal;
		height: auto;
	}
	.toolbar :global([data-tracking='lost']) {
		color: #ffb4a7;
	}
	.hud :global(.session-menu) {
		min-width: 13rem;
		max-width: min(25rem, calc(100vw - 2rem));
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: var(--popover);
		color: var(--popover-foreground);
		box-shadow: 0 12px 40px #0004;
	}
	.hud :global(.session-menu [role='menuitem']) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 3rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		font-size: 1.125rem;
		cursor: pointer;
	}
	.hud :global(.session-menu [data-highlighted]) {
		background: var(--accent);
		color: var(--accent-foreground);
	}
	.hud :global(.session-menu svg) {
		width: 1.25rem;
		height: 1.25rem;
	}
	.practice-actions {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		padding: 0.25rem;
	}
	.practice-picker {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 0.35rem;
	}
	.session-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.3rem 1rem;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		color: #d0d7db;
		font-variant-numeric: tabular-nums;
	}
	.tracking-shade {
		position: fixed;
		inset: 0;
		background: rgb(155 24 18 / 78%);
		pointer-events: none;
	}
	.hud p {
		font-size: clamp(1rem, 1.5vw, 1.4rem);
		line-height: 1.3;
	}
	.command p {
		color: inherit;
	}
	.immersive :global(:focus-visible) {
		outline: 3px solid #1979d3;
		outline-offset: 2px;
	}
	@media (max-width: 900px) {
		.exercise-deck {
			width: 100%;
			grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
			gap: 0.5rem;
		}
		.pane {
			padding: 0.9rem;
		}
		.hud h1 {
			font-size: clamp(1.7rem, 6vw, 2.6rem);
			margin-bottom: 0.75rem;
		}
		.hud small {
			font-size: 0.7rem;
			letter-spacing: 0.05em;
		}
		.telemetry .digits {
			font-size: clamp(2rem, 7.8vw, 3.5rem);
		}
		.command {
			padding: 0.4rem;
		}
		.toolbar {
			gap: 0;
		}
		.practice-actions {
			gap: 0.5rem;
			flex-wrap: wrap;
		}
		.practice-picker {
			flex-basis: 9rem;
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
		.exercise-deck {
			gap: 0.5rem;
		}
		.hud h1 {
			font-size: 1.5rem;
			margin: 0.25rem 0;
		}
		.telemetry .digits {
			font-size: 2.75rem;
		}
	}
</style>
