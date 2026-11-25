<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LocalizedSelect from './LocalizedSelect.svelte';
	import Offline from './Offline.svelte';
	import { updateLocked } from './offline';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils.js';
	import {
		ArrowUpRight,
		Check,
		Coffee,
		GripVertical,
		Pencil,
		Plus,
		ShieldCheck,
		Trash2
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
	type Row = { id: number; exercise: ExerciseId; kind: Kind; value: number | undefined };
	const seed = untrack(() => workout);
	let serial = 0;
	let rows = $state<Row[]>(
		seed.steps.map((s) => {
			const kind = 'rest' in s ? 'rest' : 'reps' in s ? 'reps' : 'hold' in s ? 'hold' : 'duration';
			return {
				id: ++serial,
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
		edit = $state(false);
	const sound = untrack(() => planner?.sound ?? false);
	let invalid = $state(false),
		tooLong = $state(false);
	let form: HTMLFormElement;
	const id = $props.id();
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
	async function add(kind: 'reps' | 'rest') {
		const row = { id: ++serial, exercise: 'squat' as const, kind, value: 10 };
		rows.push(row);
		clear();
		await tick();
		focusRow(row.id);
	}
	function focusRow(key: number) {
		form.querySelector<HTMLElement>(`[data-row="${key}"] :is([role="combobox"],input)`)?.focus();
	}
	async function remove(i: number) {
		rows.splice(i, 1);
		clear();
		await tick();
		if (rows.length) focusRow(rows[Math.min(i, rows.length - 1)].id);
		else form.querySelector<HTMLButtonElement>('[data-add]')?.focus();
	}
	function clear() {
		invalid = false;
		tooLong = false;
	}
	function reorder(event: CustomEvent<DndEvent<Row>>) {
		rows = event.detail.items;
		clear();
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
	class="dashboard grid items-start gap-5 max-[740px]:pb-[calc(5rem+env(safe-area-inset-bottom))] min-[741px]:grid-cols-[minmax(0,1.7fr)_minmax(270px,1fr)]"
	oninput={(e) => {
		if (e.target instanceof HTMLInputElement) e.target.setCustomValidity('');
		clear();
	}}
	onsubmit={(e) => e.preventDefault()}
>
	<Card.Root class="min-w-0" role="region" aria-labelledby={`${id}-circuit-title`}>
		<Card.Header>
			<div>
				<Card.Title><h2 id={`${id}-circuit-title`}>{m.setup_program()}</h2></Card.Title>
			</div>
			<Card.Action>
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
			</Card.Action>
		</Card.Header>
		<Card.Content>
			{#if edit}
				<Field.Group
					class="mb-3 grid grid-cols-2 items-end gap-2.5 rounded-lg bg-muted p-3.5 min-[521px]:grid-cols-[1fr_1fr_1.4fr]"
				>
					<Field.Field>
						<Field.Label>{m.setup_repeat()}</Field.Label><LocalizedSelect
							label={m.setup_repeat()}
							value={mode}
							onchange={(v: 'rounds' | 'duration') => (mode = v)}
							options={[
								{ value: 'rounds', label: m.setup_rounds() },
								{ value: 'duration', label: m.setup_time() }
							] as const}
						/>
					</Field.Field>
					{#if mode === 'rounds'}<Field.Field>
							<Field.Label for={`${id}-rounds`}>{m.setup_rounds()}</Field.Label><InputGroup.Root>
								<InputGroup.Input
									id={`${id}-rounds`}
									type="number"
									min="1"
									required
									bind:value={rounds}
								/>
								<InputGroup.Addon align="inline-end">
									<InputGroup.Text>×</InputGroup.Text>
								</InputGroup.Addon>
							</InputGroup.Root>
						</Field.Field>{:else}<Field.Field>
							<Field.Label for={`${id}-budget`}>{m.setup_budget()}</Field.Label><InputGroup.Root>
								<InputGroup.Input
									id={`${id}-budget`}
									type="number"
									min="1"
									required
									bind:value={budget}
								/>
								<InputGroup.Addon align="inline-end">
									<InputGroup.Text>s</InputGroup.Text>
								</InputGroup.Addon>
							</InputGroup.Root>
						</Field.Field>{/if}
					<Field.Field class="max-[520px]:col-span-2">
						<Field.Label for={`${id}-rest`}>{m.setup_auto()}</Field.Label><InputGroup.Root>
							<InputGroup.Input
								id={`${id}-rest`}
								type="number"
								min="0"
								required
								bind:value={rest}
							/>
							<InputGroup.Addon align="inline-end">
								<InputGroup.Text>s</InputGroup.Text>
							</InputGroup.Addon>
						</InputGroup.Root>
					</Field.Field>
				</Field.Group>
			{:else}
				<dl
					class="mb-3 grid grid-cols-[1fr_1fr_1.4fr] divide-x divide-border rounded-lg bg-muted py-4"
				>
					<div class="flex flex-col-reverse items-start gap-1 px-[clamp(8px,1.5vw,20px)]">
						<dt class="text-xs text-muted-foreground">{m.setup_steps()}</dt>
						<dd
							class="m-0 font-mono text-[clamp(1.1rem,2vw,1.45rem)] leading-tight font-semibold tracking-tight"
						>
							{String(rows.length).padStart(2, '0')}
						</dd>
					</div>
					<div class="flex flex-col-reverse items-start gap-1 px-[clamp(8px,1.5vw,20px)]">
						<dt class="text-xs text-muted-foreground">
							{mode === 'duration' ? m.setup_time() : m.setup_rounds()}
						</dt>
						<dd
							class="m-0 font-mono text-[clamp(1.1rem,2vw,1.45rem)] leading-tight font-semibold tracking-tight"
						>
							{mode === 'duration'
								? m.setup_s({ n: budget ?? 0 })
								: `${String(rounds).padStart(2, '0')} ×`}
						</dd>
					</div>
					<div class="flex flex-col-reverse items-start gap-1 px-[clamp(8px,1.5vw,20px)]">
						<dt class="text-xs text-muted-foreground">{m.setup_auto_short()}</dt>
						<dd
							class="m-0 font-mono text-[clamp(1.1rem,2vw,1.45rem)] leading-tight font-semibold tracking-tight"
						>
							{m.setup_s({ n: rest ?? 0 })}
						</dd>
					</div>
				</dl>
			{/if}
			<ol
				class="m-0 list-none divide-y divide-border p-0"
				aria-label={m.setup_circuit()}
				use:dragHandleZone={{
					items: rows,
					dragDisabled: !edit,
					zoneTabIndex: edit ? 0 : -1,
					flipDurationMs: 150,
					dropFromOthersDisabled: true,
					dropTargetStyle: {}
				}}
				onconsider={reorder}
				onfinalize={reorder}
			>
				{#each rows as row, i (row.id)}
					<li
						animate:flip={{ duration: 150 }}
						class={cn(
							'flex min-h-[66px] items-center gap-2.5 px-1 py-2.5 min-[521px]:gap-3.5',
							edit && 'max-[520px]:items-start'
						)}
						data-row={row.id}
						aria-label={row.kind === 'rest' ? m.setup_rest() : name(row.exercise)}
					>
						{#if edit}<div
								role="button"
								tabindex="0"
								use:dragHandle
								class="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4"
								aria-label={m.setup_reorder_label({ n: i + 1 })}
							>
								<GripVertical />
							</div>{/if}
						<span
							class={cn(
								'grid size-[30px] shrink-0 place-items-center rounded-lg border font-mono text-xs font-semibold min-[521px]:size-[34px]',
								row.kind === 'rest'
									? 'border-border bg-muted text-muted-foreground'
									: 'border-primary/30 bg-primary/15 text-(--step-foreground)'
							)}
							aria-hidden="true"
						>
							{String(i + 1).padStart(2, '0')}
						</span>
						{#if edit}
							<Field.Group
								class="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_62px] items-center gap-1.5 min-[521px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_70px] min-[741px]:grid-cols-[minmax(0,1fr)_80px] min-[941px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(64px,0.55fr)]"
							>
								{#if row.kind === 'rest'}<strong>{m.setup_rest()}</strong>{:else}
									<Field.Field
										class="col-span-2 min-[521px]:col-span-1 min-[741px]:col-span-2 min-[941px]:col-span-1"
									>
										<LocalizedSelect
											label={m.setup_exercise_label({ n: i + 1 })}
											value={row.exercise}
											onchange={(v: ExerciseId) => changeExercise(row, v)}
											options={exercises.map((value) => ({ value, label: name(value) }))}
										/>
									</Field.Field>
									<Field.Field>
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
									</Field.Field>
								{/if}
								<Field.Field>
									<InputGroup.Root>
										<InputGroup.Input
											aria-label={m.setup_target_label({ n: i + 1 })}
											type="number"
											min="1"
											required
											bind:value={row.value}
										/>
										<InputGroup.Addon align="inline-end">
											<InputGroup.Text>{row.kind === 'reps' ? '×' : 's'}</InputGroup.Text>
										</InputGroup.Addon>
									</InputGroup.Root>
								</Field.Field>
							</Field.Group>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.setup_remove_label({ n: i + 1 })}
								onclick={() => remove(i)}
							>
								<Trash2 />
							</Button>
						{:else}
							<div class="grid min-w-0 gap-0.5">
								<strong
									class={cn(
										'text-base font-semibold tracking-tight',
										row.kind === 'rest' && 'text-sm text-muted-foreground'
									)}
								>
									{row.kind === 'rest' ? m.setup_rest() : name(row.exercise)}
								</strong>{#if row.kind !== 'rest'}<small class="text-xs text-muted-foreground">
										{kindName(row.kind)}
									</small>{/if}
							</div>
							<Badge variant="secondary" class="ml-auto shrink-0">
								{#if row.kind === 'rest'}<Coffee data-icon="inline-start" />{/if}{row.kind ===
								'reps'
									? `${row.value} ×`
									: m.setup_s({ n: row.value ?? 0 })}
							</Badge>
						{/if}
					</li>
				{/each}
			</ol>
		</Card.Content>
		{#if edit || invalid}<Card.Footer class="flex-col items-start gap-3">
				{#if edit}<div class="flex flex-wrap gap-2">
						<Button variant="outline" data-add size="sm" onclick={() => add('reps')}>
							<Plus data-icon="inline-start" />{m.setup_add()}
						</Button><Button variant="outline" size="sm" onclick={() => add('rest')}>
							<Coffee data-icon="inline-start" />{m.setup_add_rest()}
						</Button>
					</div>{/if}
				{#if invalid}<Alert.Root variant="destructive">
						<Alert.Description>{m.setup_invalid()}</Alert.Description>
					</Alert.Root>{/if}
			</Card.Footer>{/if}
		<Card.Footer
			class="flex-col items-stretch gap-2 max-[740px]:fixed max-[740px]:inset-x-0 max-[740px]:bottom-0 max-[740px]:z-10 max-[740px]:rounded-none max-[740px]:border-t max-[740px]:bg-background max-[740px]:px-4 max-[740px]:pt-3 max-[740px]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
			data-testid="planner-start"
		>
			<Button size="lg" class="w-full justify-between" disabled={$updateLocked} onclick={practice}>
				{planner ? m.start_workout() : m.setup_practice()}<ArrowUpRight data-icon="inline-end" />
			</Button>
			<div role="status" class="text-sm leading-relaxed empty:hidden">
				{#if tooLong}{m.setup_too_long()}{/if}
			</div>
		</Card.Footer>
	</Card.Root>
	<aside class="min-w-0" aria-labelledby={`${id}-settings-title`}>
		<Card.Root>
			<h2 id={`${id}-settings-title`} class="sr-only">{m.setup_settings()}</h2>
			<Card.Content class="flex flex-col gap-5">
				<Field.Group class="gap-4">
					<Field.Field>
						<Field.Label>{m.setup_model()}</Field.Label><LocalizedSelect
							label={m.setup_model()}
							value={model}
							onchange={(v: 'mediapipe' | 'movenet') => {
								model = v;
								const url = new URL(location.href);
								url.searchParams.set('model', v);
								// eslint-disable-next-line svelte/no-navigation-without-resolve -- Current URL already includes the app base path.
								void goto(url, { shallow: true, replace: true, state: page.state });
							}}
							options={[
								{ value: 'mediapipe', label: m.setup_mp() },
								{ value: 'movenet', label: m.setup_mn() }
							] as const}
						/>
					</Field.Field>
				</Field.Group>
				<Offline {model} />
				<Alert.Root
					role="note"
					class="[--card-foreground:var(--privacy-foreground)] [--card:var(--privacy-background)] [--muted-foreground:var(--privacy-foreground)]"
				>
					<ShieldCheck />
					<Alert.Title>{m.setup_privacy_title()}</Alert.Title>
					<Alert.Description>{m.setup_privacy()}</Alert.Description>
				</Alert.Root>
			</Card.Content>
		</Card.Root>
	</aside>
</form>

<style>
	.dashboard {
		--step-foreground: #92400e;
		--privacy-background: #f0f2ea;
		--privacy-foreground: #465343;
	}
</style>
