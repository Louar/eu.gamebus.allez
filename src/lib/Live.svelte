<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import * as m from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { DropdownMenu, Popover } from 'bits-ui';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Session, type Workout } from './workout';
	import { activitySnapshot, type ActivityListener } from './lifecycle';
	import {
		Tracker,
		exercises,
		type ExerciseId,
		type PoseFrame,
		type TrackingUpdate
	} from './motion';
	import { camera } from './camera';
	import { workoutBusy } from './offline';
	import { name, feedback, clock, reps, staticExercise } from './words';
	import Skeleton from './Skeleton.svelte';
	import Demo from './Demo.svelte';
	import LocalizedSelect from './LocalizedSelect.svelte';
	import WorkoutSettings from './WorkoutSettings.svelte';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Scan from '@lucide/svelte/icons/scan-line';
	import Square from '@lucide/svelte/icons/square';
	import Repeat2 from '@lucide/svelte/icons/repeat-2';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Hourglass from '@lucide/svelte/icons/hourglass';
	import Timer from '@lucide/svelte/icons/timer';
	import Coffee from '@lucide/svelte/icons/coffee';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Gauge from '@lucide/svelte/icons/gauge';
	let {
		workout,
		model,
		cameraId = $bindable(''),
		onmodelchange,
		sound = $bindable(),
		onexit,
		onactivity
	}: {
		workout: Workout;
		model: 'mediapipe' | 'movenet';
		cameraId?: string;
		onmodelchange: (model: 'mediapipe' | 'movenet') => void;
		sound: boolean;
		onexit: () => void;
		onactivity?: ActivityListener;
	} = $props();
	const session = new Session(
		untrack(() => workout),
		() => activity('step')
	);
	function activity(event: Parameters<ActivityListener>[0]) {
		onactivity?.(event, activitySnapshot(session));
	}
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
		quality = $state<number | null>(null),
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
		circuit = $state<number | null>(session.circuitRemaining),
		next = $state<ExerciseId | null>(null),
		readout = $state('');
	let lastCapture = -Infinity,
		lastBeatEpoch = -1;
	let elapsed = $state('00:00'),
		interval = $state(''),
		intervalCount = $state('');
	const practiceOptions = $derived(exercises.map((value) => ({ value, label: name(value) })));
	let pauseMenu = $state(false);
	let embedded = $state(false);
	let currentRound = $state(1),
		currentStep = $state(1);
	const roundGoal = untrack(() => {
		const repeat = workout.repeat;
		return repeat && 'duration' in repeat ? null : (repeat?.rounds ?? 1);
	});
	const trackingLost = $derived(
		!paused && (stage === 'practice' || stage === 'exercise') && signal?.status === 'lost'
	);
	onMount(() => {
		embedded = window.parent !== window;
		// Keep the results screen intact too; leaving Live is the update-safe point.
		workoutBusy.set(true);
		return () => workoutBusy.set(false);
	});
	function focusTitle(node: HTMLElement) {
		node.focus({ preventScroll: true });
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
		quality = null;
		hold = 0;
	}
	function showSummary() {
		if (stage === 'summary') return;
		const started = stage !== 'practice';
		stage = 'summary';
		source?.close();
		if (started) activity('finish');
	}
	function snapshot() {
		if (session.state === 'finished') {
			if (stage !== 'summary') beep(840);
			showSummary();
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
		currentRound = session.round;
		currentStep = session.stepIndex + 1;
		elapsed = clock(Math.floor(session.elapsed));
		interval = 'duration' in s ? clock(session.remaining ?? 0) : '';
		next = session.nextExercise;
		if ('rest' in s) {
			readout = clock(session.remaining ?? 0);
			return;
		}
		activeId = s.exercise;
		signal = session.update;
		quality = r?.quality ?? null;
		const seconds = Math.floor((r?.held ?? 0) + 1e-8),
			count = r?.reps ?? 0;
		if ('reps' in s) readout = m.rep_target({ now: count, target: s.reps });
		else if ('hold' in s)
			readout = m.hold_target({ now: Math.floor((r?.continuous ?? 0) + 1e-8), target: s.hold });
		else {
			intervalCount = staticExercise(s.exercise) ? m.held_s({ n: seconds }) : reps(count);
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
			quality = tracker.roundQuality;
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
				tracker.breakContinuity();
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
			tracker.breakContinuity();
			clearMotion();
		} else if (!paused && stage !== 'summary') toggle();
	}
	function pauseForDetails(open: boolean) {
		if (open && !paused) toggle();
	}
	function start() {
		if (stage !== 'practice') return;
		paused = false;
		clearMotion();
		deadline = now() + 3;
		countdown = 3;
		stage = 'countdown';
		activity('start');
		beep(440);
	}
	function finish() {
		session.finish(now());
		showSummary();
	}
	async function connect(selectedModel = model, selectedCamera = cameraId) {
		source?.close();
		loaded = false;
		error = '';
		clearMotion();
		tracker.breakContinuity();
		if (stage === 'exercise') session.interrupt(now());
		if (replay) {
			loaded = true;
			return;
		}
		const active = camera(
			video,
			selectedModel,
			resolve('/'),
			() => !document.hidden && !paused && (stage === 'practice' || stage === 'exercise'),
			epoch,
			receive,
			(k) => {
				loaded = false;
				error = k;
				if (stage === 'exercise') session.interrupt(now());
				image = null;
			},
			selectedCamera
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
		const selectedModel = model,
			selectedCamera = cameraId;
		untrack(() => void connect(selectedModel, selectedCamera));
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

{#snippet qualityIndicator(score: number | null)}
	{@const excellent = score !== null && score > 80}
	<div class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="quality-score">
		<span class="text-xs">{m.form_quality()}</span>
		<Badge variant={excellent ? 'default' : 'secondary'}>
			{#if excellent}<Trophy data-icon="inline-start" aria-hidden="true" />{/if}
			{score === null ? m.not_scored() : `${score}/100`}
		</Badge>
		{#if excellent}<span class="text-xs">{m.excellent_form()}</span>{/if}
	</div>
{/snippet}

{#snippet preview()}
	<video {@attach attachCamera} muted autoplay playsinline aria-label={m.preview()}></video>
	{#if image && !paused && stage !== 'rest'}<div class="overlay">
			<Skeleton frame={image} />
		</div>{/if}
	{#if !image && (replay || !loaded)}<Scan class="scan" aria-hidden="true" />{/if}
{/snippet}

{#snippet selector()}
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

<section data-testid="stage" data-stage={stage} data-immersive="true" class="immersive">
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
						{@render qualityIndicator(r.quality)}
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
		{#if embedded}
			<Button onclick={() => window.parent.postMessage({ type: 'EXIT' }, '*')}>
				{m.close_task()}
			</Button>
		{:else}
			<Button onclick={onexit}>{m.back_setup()}</Button>
		{/if}
	{:else}
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
					{#if stage !== 'practice'}<DropdownMenu.Root
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
										variant="default"
										size="icon-lg"
										aria-label={m.pause()}
										aria-pressed={paused}
										title={paused ? m.paused() : m.pause()}
									>
										{#if paused}<Play />{:else}<Pause />{/if}
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="session-menu" align="end" sideOffset={12}>
								<DropdownMenu.Group aria-label={m.paused()}>
									<DropdownMenu.Item onSelect={toggle}><Play />{m.resume()}</DropdownMenu.Item>
									<DropdownMenu.Item onSelect={finish}>
										<Square />{m.finish()}
									</DropdownMenu.Item>
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu.Root>{/if}
					{#if stage === 'practice'}
						<Button
							size="lg"
							disabled={!loaded}
							aria-label={m.start_workout()}
							title={m.start_workout()}
							onclick={start}
						>
							<Play data-icon="inline-start" />{m.start_workout()}
						</Button>
					{:else}
						{#if circuit !== null}<span
								class="session-time font-mono"
								data-testid="circuit-clock"
								aria-label={m.circuit_left({ time: clock(circuit) })}
							>
								<Hourglass aria-hidden="true" />{clock(circuit)}
							</span>{/if}
						<span
							class="session-time font-mono"
							aria-label={m.setup_rounds()}
							data-testid="round-control"
						>
							<Repeat2 aria-hidden="true" />{currentRound}{#if roundGoal !== null}/{roundGoal}{/if}
						</span>
						<Popover.Root onOpenChange={pauseForDetails}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										class="font-mono"
										aria-label={m.setup_steps()}
										title={m.setup_steps()}
										data-testid="step-control"
									>
										<ListOrdered data-icon="inline-start" />{currentStep}/{workout.steps.length}
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content
								class="session-menu circuit-menu"
								align="end"
								sideOffset={8}
								aria-label={m.setup_circuit()}
							>
								<p class="detail-title">{m.setup_circuit()}</p>
								<ol>
									{#each workout.steps as step, i (i)}
										<li aria-current={i + 1 === currentStep ? 'step' : undefined}>
											<span class="step-number">{String(i + 1).padStart(2, '0')}</span>
											<div class="circuit-exercise">
												<strong>
													{'exercise' in step ? name(step.exercise) : m.rest_title()}
												</strong>{#if 'exercise' in step}<span>
														{'reps' in step
															? m.setup_reps()
															: 'hold' in step
																? m.setup_hold()
																: m.setup_interval()}
													</span>{/if}
											</div>
											<Badge variant="secondary">
												{#if 'rest' in step}<Coffee data-icon="inline-start" />{/if}{'reps' in step
													? `${step.reps} ×`
													: m.setup_s({
															n:
																'hold' in step
																	? step.hold
																	: 'rest' in step
																		? step.rest
																		: step.duration
														})}
											</Badge>
										</li>
									{/each}
								</ol>
							</Popover.Content>
						</Popover.Root>
						{#if circuit === null}<span
								class="session-time font-mono"
								aria-label={`${m.active_time()}: ${elapsed}`}
								data-testid="workout-clock"
							>
								<Timer aria-hidden="true" />{elapsed}
							</span>{/if}
					{/if}
					<WorkoutSettings
						compact
						{model}
						bind:cameraId
						bind:sound
						{onmodelchange}
						onopenchange={pauseForDetails}
					/>
				</div>
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Title>{error === 'camera' ? m.camera_error() : m.model_error()}</Alert.Title>
						<Alert.Description>
							<Button variant="outline" onclick={() => void connect()}>{m.retry()}</Button>
						</Alert.Description>
					</Alert.Root>
				{:else if !loaded}<p role="status">{m.loading()}</p>{/if}
			</div>
			{#if trackingLost}<div
					class="pane tracking-warning"
					data-testid="tracking-warning"
					role="status"
				>
					<Scan />{m.lost()}
				</div>{/if}
			<span class="sr-only" data-testid="feedback" role="status">{feedback(activeId, signal)}</span>
			<div class="exercise-deck">
				<header class="pane identity" data-testid="current-exercise">
					<div class="exercise-name">
						<small>{stage === 'practice' ? m.practice_title() : m.current_exercise()}</small>
						<h1 class:practice-picker={stage === 'practice'} tabindex="-1" {@attach focusTitle}>
							{#if stage === 'practice'}{@render selector()}{:else}{stage === 'countdown'
									? m.ready()
									: stage === 'rest'
										? m.rest_title()
										: name(activeId)}{/if}
						</h1>
					</div>
					{#if stage === 'practice' || stage === 'exercise'}<Demo exercise={activeId} />
					{:else if stage === 'rest' && next}<p data-testid="next">
							{m.next_ex({ exercise: name(next) })}
						</p>{/if}
				</header>
				<div class="pane telemetry" data-testid="exercise-progress">
					<div class="flex flex-col gap-1">
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
					</div>
					{#if stage === 'exercise' || stage === 'practice'}
						{@const excellent = quality !== null && quality > 80}
						<div
							class="dark flex shrink-0 flex-col items-center gap-1 self-stretch"
							data-testid="quality-score"
							title={m.form_quality()}
						>
							<div class="[container-type:size] relative w-1.5 flex-1" aria-hidden="true">
								<Progress
									value={quality ?? 0}
									class="absolute top-1/2 left-1/2 w-[100cqh] -translate-x-1/2 -translate-y-1/2 -rotate-90 [&>[data-slot=progress-indicator]]:rounded-full"
								/>
							</div>
							<Badge variant={excellent ? 'default' : 'secondary'}>
								<span class="sr-only">{m.form_quality()}: </span>
								{#if excellent}<Trophy data-icon="inline-start" aria-hidden="true" /><span
										class="sr-only"
									>
										{m.excellent_form()},
									</span>
								{:else}<Gauge data-icon="inline-start" aria-hidden="true" />{/if}
								{#if quality === null}<span aria-hidden="true">–</span><span class="sr-only">
										{m.not_scored()}
									</span>{:else}{quality}{/if}
							</Badge>
						</div>
					{/if}
				</div>
			</div>
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
		gap: 0.75rem;
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
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.telemetry .digits {
		font-size: clamp(3.5rem, 6.5vw, 7rem);
		white-space: nowrap;
	}
	.telemetry strong {
		font-size: clamp(1.1rem, 1.8vw, 1.75rem);
	}
	.command {
		--command-radius: 1rem;
		--command-padding: 0.25rem;
		--primary: var(--color-studio-orange);
		--primary-foreground: var(--ink);
		color-scheme: dark;
		background: var(--ink);
		color: var(--foreground);
		width: fit-content;
		max-width: 100%;
		border-radius: var(--command-radius);
		padding: var(--command-padding);
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
		border-radius: calc(var(--command-radius) - var(--command-padding));
		min-height: 2.75rem;
		flex-shrink: 0;
	}
	.session-time {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding-inline: 0.5rem;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.session-time :global(svg) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}
	.tracking-warning {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		background: var(--ink);
		color: #ffb4a7;
		font-weight: 600;
	}
	.tracking-warning :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
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
	.practice-picker :global([data-slot='select-trigger']) {
		height: auto;
		padding: 0.15em 0.2em;
		font: inherit;
		letter-spacing: inherit;
		color: inherit;
		border-color: #ffffff40;
	}
	.practice-picker :global([data-slot='select-value']) {
		min-width: 0;
	}
	.practice-picker :global(svg) {
		width: 0.4em;
		height: 0.4em;
	}
	.hud .detail-title {
		margin: 0 0 0.5rem;
		padding: 0.5rem;
		font-weight: 700;
	}
	.hud :global(.circuit-menu) {
		width: min(25rem, calc(100vw - 2rem));
		max-height: min(65dvh, 32rem);
		overflow-y: auto;
	}
	.hud :global(.circuit-menu ol) {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.hud :global(.circuit-menu li) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.hud :global(.circuit-menu li[aria-current='step']) {
		background: var(--accent);
		border-radius: 0.5rem;
	}
	.step-number {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--muted-foreground);
	}
	.circuit-exercise {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 0.2rem;
	}
	.circuit-exercise span {
		font-size: 0.75rem;
		color: var(--muted-foreground);
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
		.hud {
			gap: 0.5rem;
		}
		.exercise-deck {
			width: 100%;
			grid-template-columns: minmax(0, 1fr) minmax(min-content, 1fr);
			gap: 0.5rem;
		}
		.identity {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(3.5rem, 0.7fr);
			align-items: center;
			gap: 0.5rem;
		}
		.exercise-name {
			min-width: 0;
		}
		.pane:where(:not(.command)) {
			padding: 0.9rem;
		}
		.exercise-deck .pane {
			padding: 0.65rem;
		}
		.exercise-deck :is(h1, small, strong, p) {
			display: block;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.hud h1 {
			font-size: clamp(1.7rem, 6vw, 2.6rem);
			margin: 0.3rem 0 0;
		}
		.hud small {
			font-size: 0.7rem;
			letter-spacing: 0.05em;
		}
		.telemetry .digits {
			font-size: clamp(2rem, 7.8vw, 3.5rem);
		}
		.toolbar {
			gap: 0;
		}
		.toolbar :global(button[data-popover-trigger]) {
			gap: 0.25rem;
			padding-inline: 0.5rem;
		}
		.session-time {
			padding-inline: 0.3rem;
			font-size: 0.75rem;
		}
	}
	@media (max-height: 480px) and (orientation: landscape) {
		.hud {
			--gutter: 0.5rem;
			gap: 0.5rem;
		}
		.pane:where(:not(.command)) {
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
