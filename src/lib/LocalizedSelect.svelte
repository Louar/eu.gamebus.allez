<script lang="ts" generics="T extends string">
	import * as Select from '#lib/components/ui/select/index.js';
	let {
		label,
		value,
		options,
		onchange
	}: {
		label: string;
		value: T;
		options: readonly { value: T; label: string }[];
		onchange: (value: T) => void;
	} = $props();
</script>

<Select.Root
	type="single"
	items={[...options]}
	{value}
	onValueChange={(value) => {
		const option = options.find((option) => option.value === value);
		if (option) onchange(option.value);
	}}
>
	<Select.Trigger class="w-full min-w-0" aria-label={label}>
		<Select.Value />
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
			{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>
