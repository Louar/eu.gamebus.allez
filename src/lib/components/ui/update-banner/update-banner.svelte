<script lang="ts">
	import { fly } from 'svelte/transition';
	import { Button } from '#lib/components/ui/button/index.js';
	import { RefreshCw, Sparkles, X } from '@lucide/svelte';

	let { title, description, reloadLabel, dismissLabel, onreload, ondismiss }: {
		title: string;
		description: string;
		reloadLabel: string;
		dismissLabel: string;
		onreload: () => void;
		ondismiss: () => void;
	} = $props();
</script>

<div
	role="alert"
	aria-live="polite"
	data-testid="pwa-update"
	transition:fly|global={{ y: -12, duration: 200 }}
	class="fixed top-4 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
>
	<span class="mt-0.5 flex shrink-0 text-primary">
		<Sparkles class="size-4" />
	</span>
	<div class="min-w-0 flex-1">
		<p class="font-medium leading-none">{title}</p>
		<p class="mt-1 text-xs text-muted-foreground">{description}</p>
		<div class="mt-3 flex items-center gap-2">
			<Button size="sm" onclick={onreload}>
				<RefreshCw class="size-3.5" />
				{reloadLabel}
			</Button>
			<Button size="sm" variant="ghost" onclick={ondismiss}>{dismissLabel}</Button>
		</div>
	</div>
	<button
		type="button"
		onclick={ondismiss}
		aria-label={dismissLabel}
		class="shrink-0 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<X class="size-4" />
	</button>
</div>
