<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { resolve } from '$app/paths';
	import Pwa from '#lib/Pwa.svelte';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href={`${resolve('/')}manifest.webmanifest`} />
	<link rel="apple-touch-icon" href={`${resolve('/')}icons/icon-192.png`} />
</svelte:head>

{@render children()}
<Pwa />
