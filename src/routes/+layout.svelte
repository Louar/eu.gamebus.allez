<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { resolve } from '$app/paths';
	import Pwa from '#lib/Pwa.svelte';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { connectGameBus } from '#lib/gamebus.js';
	import { setEmbed } from '#lib/embed.js';
	import type { ActivityListener } from '#lib/lifecycle.js';

	let { children }: LayoutProps = $props();
	const settings = writable<Record<string, unknown>>({});
	let bridge: ReturnType<typeof connectGameBus> | undefined;
	let reportingError = $state('');
	const report: ActivityListener = (event, snapshot) => {
		if (event === 'start') {
			reportingError = '';
			bridge?.start(snapshot);
		} else bridge?.update(snapshot, snapshot.isCompleted);
	};
	setEmbed({
		settings,
		onactivity: typeof window !== 'undefined' && window.parent !== window ? report : undefined
	});
	onMount(() => {
		bridge = connectGameBus(settings.set, (error) => (reportingError = error));
		return () => bridge?.destroy();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href={`${resolve('/')}manifest.webmanifest`} />
	<link rel="apple-touch-icon" href={`${resolve('/')}icons/icon-192.png`} />
</svelte:head>

{@render children()}
{#if reportingError}<p role="alert">{reportingError}</p>{/if}
<Pwa />
