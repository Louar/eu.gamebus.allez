<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import LocalizedSelect from './LocalizedSelect.svelte';
	import Offline from './Offline.svelte';
	import { updateLocked } from './offline';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		ArrowUpRight,
		Check,
		Clipboard,
		Coffee,
		Pencil,
		Plus,
		ShieldCheck,
		SlidersHorizontal,
		Trash2,
		Volume2
	} from '@lucide/svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { encodeWorkout, parseWorkout, type Workout } from './workout';
	import { exercises, type ExerciseId } from './motion';
	import { name } from './words';

	let {
		workout,
		planner,
		onpractice
	}: {
		workout: Workout;
		planner?: { model: 'mediapipe' | 'movenet'; sound: boolean };
		onpractice?: (w: Workout, model: 'mediapipe' | 'movenet', sound: boolean) => void;
	} = $props();
	type Kind = 'reps' | 'duration' | 'hold' | 'rest';
	type Row = { key: number; exercise: ExerciseId; kind: Kind; value: number | undefined };
	const seed = untrack(() => workout);
	let serial = 0;
	let rows = $state<Row[]>(
		seed.steps.map((s) => {
			const kind = 'rest' in s ? 'rest' : 'reps' in s ? 'reps' : 'hold' in s ? 'hold' : 'duration';
			return {
				key: ++serial,
				exercise: 'exercise' in s ? s.exercise : 'squat',
				kind,
				value: 'rest' in s ? s.rest : 'reps' in s ? s.reps : 'hold' in s ? s.hold : s.duration
			};
		})
	);
	let mode = $state<'rounds' | 'duration'>(
		seed.repeat && 'duration' in seed.repeat ? 'duration' : 'rounds'
	);
	let rounds = $state<number | undefined>(
		seed.repeat && 'rounds' in seed.repeat ? seed.repeat.rounds : 1
	);
	let budget = $state<number | undefined>(
		seed.repeat && 'duration' in seed.repeat ? seed.repeat.duration : 180
	);
	let rest = $state<number | undefined>(seed.rest ?? 0);
	let model = $state<'mediapipe' | 'movenet'>(untrack(() => planner?.model ?? 'mediapipe')),
		sound = $state(untrack(() => planner?.sound ?? false)),
		edit = $state(false);
	let invalid = $state(false),
		tooLong = $state(false),
		copied = $state(false),
		manual = $state('');
	let form: HTMLFormElement;
	const isStatic = (id: ExerciseId) => id === 'plank' || id === 'squat-hold';
	const kindName = (kind: Kind) =>
		kind === 'rest'
			? m.setup_rest()
			: kind === 'duration'
				? m.setup_interval()
				: kind === 'hold'
					? m.setup_hold()
					: m.setup_reps();
	function validated() {
		if (edit) {
			const field = form.querySelector<HTMLInputElement>('input:invalid');
			if (field) {
				field.setCustomValidity(m.setup_bad_number({ n: field.min }));
				field.reportValidity();
				return;
			}
		}
		try {
			return parseWorkout({
				v: 1,
				steps: rows.map((r) =>
					r.kind === 'rest' ? { rest: r.value } : { exercise: r.exercise, [r.kind]: r.value }
				),
				...(seed.rest !== undefined || rest ? { rest } : {}),
				...(seed.repeat || mode === 'duration' || rounds !== 1
					? { repeat: mode === 'duration' ? { duration: budget } : { rounds } }
					: {})
			});
		} catch {
			invalid = true;
			edit = true;
			return;
		}
	}
	function encodedWorkout(w: Workout) {
		try {
			return encodeWorkout(w);
		} catch {
			tooLong = true;
		}
	}
	function plannerPath(encoded: string) {
		return `workouts/${encoded}/?model=${model}&sound=${sound ? '1' : '0'}` as const;
	}
	function practice() {
		if ($updateLocked) return;
		const w = validated();
		if (!w) return;
		if (!planner) return onpractice?.(w, model, sound);
		const encoded = encodedWorkout(w);
		if (encoded) void goto(resolve(plannerPath(encoded)));
	}
	async function copy() {
		const w = validated();
		if (!w) return;
		const encoded = encodedWorkout(w);
		if (!encoded) return;
		const url = new SvelteURL(
			planner ? resolve(plannerPath(encoded)) : location.href,
			location.href
		);
		if (!planner) url.searchParams.set('workout', encoded);
		url.hash = '';
		try {
			await navigator.clipboard.writeText(url.href);
			copied = true;
			manual = '';
		} catch {
			manual = url.href;
			copied = false;
			await tick();
			form.querySelector<HTMLInputElement>('[data-share]')?.select();
		}
	}
	async function add(kind: 'reps' | 'rest') {
		const row = { key: ++serial, exercise: 'squat' as const, kind, value: 10 };
		rows.push(row);
		clear();
		await tick();
		focusRow(row.key);
	}
	function focusRow(key: number) {
		form.querySelector<HTMLElement>(`[data-row="${key}"] :is(select,input)`)?.focus();
	}
	async function remove(i: number) {
		rows.splice(i, 1);
		clear();
		await tick();
		if (rows.length) focusRow(rows[Math.min(i, rows.length - 1)].key);
		else form.querySelector<HTMLButtonElement>('[data-add]')?.focus();
	}
	function clear() {
		invalid = false;
		tooLong = false;
		copied = false;
		manual = '';
	}
	function changeExercise(row: Row, id: ExerciseId) {
		row.exercise = id;
		if (row.kind !== 'duration' && (row.kind === 'hold') !== isStatic(id)) {
			row.kind = isStatic(id) ? 'hold' : 'reps';
			row.value = isStatic(id) ? 30 : 10;
		}
	}
</script>

<form
	{@attach (element: HTMLFormElement) => {
		form = element;
	}}
	class="dashboard"
	oninput={(e) => {
		if (e.target instanceof HTMLInputElement) e.target.setCustomValidity('');
		clear();
	}}
	onsubmit={(e) => e.preventDefault()}
>
	<section class="panel circuit" aria-labelledby="circuit-title">
		<header class="panel-head">
			<div>
				<p class="eyebrow"><i></i>{m.setup_program()}</p>
				<h2 id="circuit-title">{m.setup_circuit()}</h2>
			</div>
			<Button
				variant="outline"
				size="sm"
				aria-expanded={edit}
				onclick={() => {
					if (!edit || validated()) edit = !edit;
				}}
			>
				{#if edit}<Check data-icon="inline-start" />{m.setup_done()}{:else}<Pencil
						data-icon="inline-start"
					/>{m.setup_edit()}{/if}
			</Button>
		</header>
		{#if edit}
			<div class="configuration">
				<label>
					{m.setup_repeat()}<LocalizedSelect
						label={m.setup_repeat()}
						value={mode}
						onchange={(v: 'rounds' | 'duration') => (mode = v)}
						options={[
							{ value: 'rounds', label: m.setup_rounds() },
							{ value: 'duration', label: m.setup_time() }
						] as const}
					/>
				</label>
				{#if mode === 'rounds'}<label>
						{m.setup_rounds()}<input type="number" min="1" required bind:value={rounds} />
					</label>{:else}<label>
						{m.setup_budget()}<input type="number" min="1" required bind:value={budget} />
					</label>{/if}
				<label>{m.setup_auto()}<input type="number" min="0" required bind:value={rest} /></label>
			</div>
		{:else}
			<dl class="metrics">
				<div>
					<dt>{m.setup_steps()}</dt>
					<dd>{String(rows.length).padStart(2, '0')}</dd>
				</div>
				<div>
					<dt>{mode === 'duration' ? m.setup_time() : m.setup_rounds()}</dt>
					<dd>
						{mode === 'duration' ? m.setup_s({ n: budget ?? 0 }) : String(rounds).padStart(2, '0')}
					</dd>
				</div>
				<div>
					<dt>{m.setup_auto_short()}</dt>
					<dd>{m.setup_s({ n: rest ?? 0 })}</dd>
				</div>
			</dl>
		{/if}
		<ol aria-labelledby="circuit-title">
			{#each rows as row, i (row.key)}
				<li class:break-row={row.kind === 'rest'} class:editing={edit} data-row={row.key}>
					<span class="number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
					{#if edit}
						<div class="row-fields">
							{#if row.kind === 'rest'}<strong>{m.setup_rest()}</strong>{:else}
								<LocalizedSelect
									label={m.setup_exercise_label({ n: i + 1 })}
									value={row.exercise}
									onchange={(v: ExerciseId) => changeExercise(row, v)}
									options={exercises.map((value) => ({ value, label: name(value) }))}
								/>
								<LocalizedSelect
									label={m.setup_type_label({ n: i + 1 })}
									value={row.kind}
									onchange={(v: Kind) => (row.kind = v)}
									options={[
										isStatic(row.exercise)
											? { value: 'hold', label: m.setup_hold() }
											: { value: 'reps', label: m.setup_reps() },
										{ value: 'duration', label: m.setup_interval() }
									] as const}
								/>
							{/if}
							<input
								aria-label={m.setup_target_label({ n: i + 1 })}
								type="number"
								min="1"
								required
								bind:value={row.value}
							/>
						</div>
						<Button
							variant="ghost"
							size="icon"
							aria-label={m.setup_remove_label({ n: i + 1 })}
							onclick={() => remove(i)}
						>
							<Trash2 />
						</Button>
					{:else}
						<div class="row-name">
							<strong>
								{row.kind === 'rest' ? m.setup_rest() : name(row.exercise)}
							</strong>{#if row.kind !== 'rest'}<small>{kindName(row.kind)}</small>{/if}
						</div>
						<div class="quantity">
							{#if row.kind === 'rest'}<Coffee size={15} />{/if}{row.kind === 'reps'
								? row.value
								: m.setup_s({ n: row.value ?? 0 })}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
		{#if edit}<div class="add-actions">
				<Button variant="outline" data-add size="sm" onclick={() => add('reps')}>
					<Plus data-icon="inline-start" />{m.setup_add()}
				</Button><Button variant="outline" size="sm" onclick={() => add('rest')}>
					<Coffee data-icon="inline-start" />{m.setup_add_rest()}
				</Button>
			</div>{/if}
		{#if invalid}<p role="alert">{m.setup_invalid()}</p>{/if}
	</section>
	<aside class="panel settings" aria-labelledby="settings-title">
		<header class="panel-head">
			<div>
				<p class="eyebrow"><i></i>{m.setup_equipment()}</p>
				<h2 id="settings-title">{m.setup_settings()}</h2>
			</div>
			<SlidersHorizontal size={20} aria-hidden="true" />
		</header>
		<label>
			{m.setup_model()}<LocalizedSelect
				label={m.setup_model()}
				value={model}
				onchange={(v: 'mediapipe' | 'movenet') => (model = v)}
				options={[
					{ value: 'mediapipe', label: m.setup_mp() },
					{ value: 'movenet', label: m.setup_mn() }
				] as const}
			/>
		</label>
		<label class="sound">
			<Volume2 size={18} />{m.setup_sound()}<input
				class="switch"
				type="checkbox"
				bind:checked={sound}
			/>
		</label>
		<Offline {model} />
		<div class="privacy">
			<ShieldCheck size={20} />
			<div>
				<strong>{m.setup_privacy_title()}</strong>
				<p>{m.setup_privacy()}</p>
			</div>
		</div>
		<div class="actions">
			<Button size="lg" class="w-full justify-between" disabled={$updateLocked} onclick={practice}>
				{planner ? m.start_workout() : m.setup_practice()}<ArrowUpRight data-icon="inline-end" />
			</Button><Button variant="outline" class="w-full" onclick={copy}>
				<Clipboard data-icon="inline-start" />{m.setup_copy()}
			</Button>
		</div>
		<div role="status">
			{#if tooLong}{m.setup_too_long()}{/if}
			{#if copied}{m.setup_copied()}{:else if manual}{m.setup_manual()}{/if}
		</div>
		{#if manual}<input
				data-share
				aria-label={m.setup_link()}
				readonly
				value={manual}
				onfocus={(e) => e.currentTarget.select()}
			/>{/if}
	</aside>
</form>

<style>
	.dashboard {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(270px, 1fr);
		gap: 20px;
		align-items: start;
	}
	.panel {
		min-width: 0;
		padding: clamp(18px, 2.6vw, 32px);
		border: 1px solid #ddddd6;
		border-radius: 14px;
		background: #fffefa;
	}
	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 23px;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
		font:
			650 10px/1.45 ui-monospace,
			monospace;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #616565;
	}
	.eyebrow i {
		width: 15px;
		height: 2px;
		background: #de6a30;
	}
	h2 {
		margin: 0;
		letter-spacing: -0.055em;
		line-height: 1.15;
		font-size: clamp(1.45rem, 3vw, 2.1rem);
		font-weight: 720;
	}
	.metrics,
	.configuration {
		display: grid;
		grid-template-columns: 1fr 1fr 1.4fr;
		border-radius: 8px;
		background: #f1f1ea;
		margin: 0 0 13px;
		padding: 15px 0;
	}
	.metrics > div {
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: 3px;
		padding: 0 clamp(8px, 1.5vw, 20px);
		border-right: 1px solid #d8d9d1;
	}
	.metrics > div:last-child {
		border: none;
	}
	.metrics dd {
		margin: 0;
		font:
			650 clamp(1.1rem, 2vw, 1.45rem)/1.15 ui-monospace,
			monospace;
		letter-spacing: -0.055em;
	}
	.metrics dt,
	small {
		font-size: 0.75rem;
		color: #626762;
	}
	.configuration {
		gap: 10px;
		align-items: end;
		padding: 14px;
	}
	label {
		display: grid;
		gap: 7px;
		font-size: 0.82rem;
		font-weight: 600;
	}
	input:not([type='checkbox']) {
		background-color: #fffefa;
		border: 1px solid #cfcec6;
		border-radius: 7px;
		min-height: 40px;
		min-width: 0;
		width: 100%;
		line-height: 1.4;
		font-family: inherit;
		font-weight: 500;
		font-size: 0.85rem;
		color: #252b2c;
		padding: 8px 10px;
	}
	.dashboard :global(button:focus-visible),
	input:focus-visible {
		outline: 2px solid #a34211;
		outline-offset: 2px;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		min-height: 66px;
		border-bottom: 1px solid #e5e3dc;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 4px;
	}
	li:last-child {
		border-bottom: 0;
	}
	.number {
		flex: 0 0 34px;
		width: 34px;
		height: 34px;
		border: 1px solid #f0d3ba;
		display: grid;
		place-items: center;
		border-radius: 8px;
		background: #fff0df;
		color: #92400e;
		font:
			600 0.79rem/1 ui-monospace,
			monospace;
	}
	.row-name {
		display: grid;
		gap: 2px;
	}
	.row-name strong {
		font-weight: 660;
		letter-spacing: -0.022em;
		font-size: 1.02rem;
	}
	.quantity {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 7px;
		border-radius: 5px;
		padding: 4px 9px;
		background: #f3f2ed;
		color: #444b48;
		font:
			600 0.86rem/1.3 ui-monospace,
			monospace;
		white-space: nowrap;
	}
	.break-row .number {
		background: #f1f2ef;
		color: #5d655e;
		border-color: #dadcd5;
	}
	.break-row .row-name strong {
		color: #575e59;
		font-size: 0.93rem;
	}
	.row-fields {
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(64px, 0.55fr);
		align-items: center;
		gap: 6px;
	}
	.add-actions {
		margin-top: 15px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.settings .panel-head > :global(svg) {
		color: #686e69;
	}
	.sound {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 18px 0;
	}
	.switch {
		appearance: none;
		position: relative;
		display: inline-block;
		width: 37px;
		height: 22px;
		min-width: 37px;
		border-radius: 20px;
		cursor: pointer;
		border: 1px solid #888e86;
		background: #e0e1d9;
		margin-left: auto;
	}
	.switch:before {
		content: '';
		position: absolute;
		left: 3px;
		top: 3px;
		width: 14px;
		height: 14px;
		background: #646b64;
		border-radius: 50%;
	}
	.switch:checked {
		background: #ffae70;
		border-color: #b4622b;
	}
	.switch:checked:before {
		left: 18px;
		background: #472d1a;
	}
	.privacy {
		border-radius: 8px;
		background: #f0f2ea;
		padding: 15px;
		display: flex;
		align-items: start;
		gap: 10px;
		color: #465343;
	}
	.privacy :global(svg) {
		flex-shrink: 0;
	}
	.privacy strong {
		font-size: 0.84rem;
		font-weight: 680;
	}
	.privacy p {
		font-size: 0.8rem;
		line-height: 1.55;
		margin: 3px 0 0;
	}
	.actions {
		margin-top: 23px;
		display: grid;
		gap: 8px;
	}
	.settings [role='status']:not(:empty) {
		font-size: 0.8rem;
		line-height: 1.5;
		margin-top: 9px;
	}
	.circuit [role='alert'] {
		color: #8d381b;
		font-size: 0.84rem;
	}
	@media (max-width: 940px) {
		.row-fields {
			grid-template-columns: 1fr 80px;
		}
		.row-fields :global([data-slot='select-trigger']:first-child) {
			grid-column: 1/-1;
		}
	}
	@media (max-width: 740px) {
		.dashboard {
			grid-template-columns: 1fr;
		}
		.panel-head {
			margin-bottom: 16px;
		}
		.row-fields {
			grid-template-columns: 1.2fr 1fr 70px;
		}
		.row-fields :global([data-slot='select-trigger']:first-child) {
			grid-column: auto;
		}
	}
	@media (max-width: 520px) {
		.row-fields {
			grid-template-columns: 1fr 62px;
		}
		.row-fields :global([data-slot='select-trigger']:first-child) {
			grid-column: 1/-1;
		}
		.configuration {
			grid-template-columns: 1fr 1fr;
		}
		.configuration label:last-child {
			grid-column: 1/-1;
		}
		li {
			gap: 9px;
		}
		.panel-head {
			flex-wrap: wrap;
		}
		.number {
			width: 30px;
			flex-basis: 30px;
			height: 30px;
		}
		.editing {
			align-items: start;
		}
		.panel {
			padding: 18px;
		}
		.metrics dt {
			font-size: 0.7rem;
		}
	}
</style>
