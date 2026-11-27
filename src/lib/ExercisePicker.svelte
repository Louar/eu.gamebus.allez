<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { buttonVariants } from '#lib/components/ui/button/button.svelte';
	import * as Command from '#lib/components/ui/command/index.js';
	import { Popover } from 'bits-ui';
	import * as m from '#lib/paraglide/messages.js';
	import { exerciseCategories } from './exercise-categories';
	import type { ExerciseId } from './motion';
	import { name } from './words';

	let {
		label,
		value,
		onchange
	}: { label: string; value: ExerciseId; onchange: (id: ExerciseId) => void } = $props();
	const valueId = $props.id();
	let open = $state(false);
	let query = $state('');
	const normalize = (s: string) =>
		s
			.trim()
			.toLowerCase()
			.replace(/[-\s]+/g, ' ');
	const groups = $derived.by(() => {
		const search = normalize(query);
		return exerciseCategories
			.map(({ heading, exercises }) => ({
				heading: heading(),
				exercises: exercises.filter(
					(id) => normalize(heading()).includes(search) || normalize(name(id)).includes(search)
				)
			}))
			.filter((group) => group.exercises.length);
	});
</script>

<Popover.Root
	bind:open
	onOpenChange={(next) => {
		if (next) query = '';
	}}
>
	<Popover.Trigger
		type="button"
		class={buttonVariants({
			variant: 'outline',
			class: 'exercise-picker w-full min-w-0 justify-between'
		})}
		aria-label={label}
		aria-describedby={valueId}
		data-exercise={value}
	>
		<span id={valueId} class="truncate">{name(value)}</span><ChevronDown data-icon="inline-end" />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			align="start"
			sideOffset={4}
			collisionPadding={8}
			aria-label={label}
			class="w-[max(16rem,var(--bits-popover-anchor-width))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border bg-popover shadow-md"
		>
			<Command.Root label={m.picker_search()} shouldFilter={false} loop>
				<Command.Input placeholder={m.picker_search()} bind:value={query} />
				<Command.List
					class="max-h-[min(22rem,50dvh,calc(var(--bits-popover-content-available-height)-3.5rem))]"
					aria-label={label}
				>
					{#each groups as group (group.heading)}
						<Command.Group heading={group.heading}>
							{#each group.exercises as id (id)}
								<Command.Item
									value={`${group.heading}:${id}`}
									data-exercise={id}
									data-checked={value === id}
									aria-current={value === id ? 'true' : undefined}
									onSelect={() => {
										onchange(id);
										open = false;
									}}
								>
									{name(id)}
								</Command.Item>
							{/each}
						</Command.Group>
					{:else}
						<Command.Empty forceMount><span role="status">{m.picker_empty()}</span></Command.Empty>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
