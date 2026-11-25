<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		align = 'inline-start',
		...props
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		align?: 'inline-start' | 'inline-end';
	} = $props();
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="input-group-addon"
	data-align={align}
	class={cn(
		'flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50',
		align === 'inline-end' ? 'order-last pr-2' : 'order-first pl-2',
		className
	)}
	onclick={(e) => {
		if ((e.target as HTMLElement).closest('button')) return;
		e.currentTarget.parentElement?.querySelector('input')?.focus();
	}}
	{...props}
>
	{@render children?.()}
</div>
