<script lang="ts">
	import { onMount } from 'svelte';
	import { dev, version } from '$app/env';
	import { get } from 'svelte/store';
	import { workoutBusy, updateLocked, registerPwa } from './offline';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as m from '#lib/paraglide/messages.js';
	let waiting = $state(false);
	let registration: ServiceWorkerRegistration | undefined;
	let applying = $state(false);
	let blocked = $state(false);
	let reloadNeeded = $state(false);
	function apply() {
		if (get(workoutBusy)) return;
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
				waiting = !!reg.waiting;
				reg.addEventListener('updatefound', () => {
					reg.installing?.addEventListener('statechange', () => {
						waiting = !!reg.waiting;
					});
				});
				void reg.update().catch(() => {});
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
			unlock();
			navigator.serviceWorker.removeEventListener('message', safe);
			navigator.serviceWorker.removeEventListener('controllerchange', controlled);
		};
	});
</script>

{#if (waiting || reloadNeeded) && !$workoutBusy}
	<div class="fixed inset-x-0 bottom-0 z-50 p-3">
		<Alert.Root
			role="status"
			data-testid="pwa-update"
			class="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-3 has-data-[slot=alert-action]:pr-4"
		>
			<Alert.Description>
				{blocked ? m.offline_update_busy() : m.offline_update()}
			</Alert.Description>
			<Alert.Action class="static">
				<Button variant="outline" disabled={applying} onclick={apply}>{m.offline_apply()}</Button>
			</Alert.Action>
		</Alert.Root>
	</div>
{/if}
