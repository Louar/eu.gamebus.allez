<script lang="ts">
	import { onMount } from 'svelte';
	import { dev, version } from '$app/env';
	import { get } from 'svelte/store';
	import { workoutBusy, updateLocked, registerPwa } from './offline';
	import { UpdateBanner } from '#lib/components/ui/update-banner/index.js';
	import * as m from '#lib/paraglide/messages.js';
	let waiting = $state(false);
	let registration: ServiceWorkerRegistration | undefined;
	let applying = $state(false);
	let blocked = $state(false);
	let reloadNeeded = $state(false);
	let online = $state(false);
	let dismissed = $state(false);
	function apply() {
		if (!navigator.onLine || get(workoutBusy) || applying) return;
		if (reloadNeeded) {
			location.reload();
			return;
		}
		if (!registration?.waiting || get(workoutBusy)) return;
		applying = true;
		blocked = false;
		const channel = new MessageChannel();
		const expected = registration.waiting;
		const changed = () => {
			if (navigator.serviceWorker.controller !== expected) return;
			navigator.serviceWorker.removeEventListener('controllerchange', changed);
			applying = false;
			if (get(workoutBusy)) reloadNeeded = true;
			else location.reload();
		};
		navigator.serviceWorker.addEventListener('controllerchange', changed);
		channel.port1.onmessage = ({ data }: MessageEvent<{ applied: boolean }>) => {
			channel.port1.close();
			if (data.applied) {
				changed();
			} else {
				applying = false;
				blocked = true;
				navigator.serviceWorker.removeEventListener('controllerchange', changed);
			}
		};
		registration.waiting.postMessage({ type: 'APPLY_UPDATE' }, [channel.port2]);
	}
	onMount(() => {
		if (dev || !('serviceWorker' in navigator)) return;
		let disposed = false;
		let installing: ServiceWorker | null = null;
		let pending: ServiceWorker | null = null;
		const inspect = () => {
			const next = registration?.waiting ?? null;
			if (next && next !== pending) dismissed = false;
			pending = next;
			waiting = !!next && !!navigator.serviceWorker.controller;
		};
		const found = () => {
			installing?.removeEventListener('statechange', inspect);
			installing = registration?.installing ?? null;
			installing?.addEventListener('statechange', inspect);
			inspect();
		};
		const check = () => {
			online = navigator.onLine;
			if (online && !document.hidden) void registration?.update().catch(() => {});
		};
		online = navigator.onLine;
		window.addEventListener('online', check);
		window.addEventListener('offline', check);
		document.addEventListener('visibilitychange', check);
		const poll = setInterval(check, 60_000);
		let unlockTimer: ReturnType<typeof setTimeout>;
		const unlock = () => {
			clearTimeout(unlockTimer);
			updateLocked.set(false);
		};
		const controlled = () => {
			const locked = get(updateLocked);
			unlock();
			if (locked && !applying) {
				if (get(workoutBusy)) reloadNeeded = true;
				else location.reload();
			}
		};
		const safe = (event: MessageEvent<{ type?: string }>) => {
			if (event.data?.type === 'SAFE_TO_UPDATE') {
				const allowed = !get(workoutBusy);
				if (allowed) {
					updateLocked.set(true);
					clearTimeout(unlockTimer);
					unlockTimer = setTimeout(unlock, 10_000);
				}
				event.ports[0]?.postMessage(allowed);
			}
			if (event.data?.type === 'UPDATE_RELEASE') unlock();
			if (event.data?.type === 'CLIENT_BUILD') event.ports[0]?.postMessage(version);
		};
		navigator.serviceWorker.addEventListener('message', safe);
		navigator.serviceWorker.addEventListener('controllerchange', controlled);
		void registerPwa()
			.then((reg) => {
				if (disposed) return;
				registration = reg;
				reg.addEventListener('updatefound', found);
				found();
				check();
			})
			.catch(() => {});
		if (import.meta.env.VITE_REPLAY === 'true') {
			Object.assign(window, {
				__alezLoadDetector: async (
					...args: Parameters<typeof import('./providers').loadDetector>
				) => (await import('./providers')).loadDetector(...args)
			});
		}
		return () => {
			disposed = true;
			clearInterval(poll);
			window.removeEventListener('online', check);
			window.removeEventListener('offline', check);
			document.removeEventListener('visibilitychange', check);
			registration?.removeEventListener('updatefound', found);
			installing?.removeEventListener('statechange', inspect);
			unlock();
			navigator.serviceWorker.removeEventListener('message', safe);
			navigator.serviceWorker.removeEventListener('controllerchange', controlled);
		};
	});
</script>

{#if online && (waiting || reloadNeeded) && !$workoutBusy && !applying && !dismissed}
	<UpdateBanner
		title={m.offline_update_title()}
		description={blocked ? m.offline_update_busy() : m.offline_update()}
		reloadLabel={m.offline_apply()}
		dismissLabel={m.offline_update_later()}
		ondismiss={() => (dismissed = true)}
		onreload={apply}
	/>
{/if}
