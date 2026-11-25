<script lang="ts">
	import { onMount } from 'svelte';
	import { version } from '$app/env';
	import * as m from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { CircleAlert, CircleCheck, Download, RotateCcw } from '@lucide/svelte';
	import { workerRequest, type Model, type OfflineStatus } from './offline';
	let { model }: { model: Model } = $props();
	let mounted = $state(false);
	let busy = $state(false);
	let status = $state<OfflineStatus>({ ready: false, available: [], version: '', complete: true });
	let failure = $state('');
	let offline = $state(false);
	let progress = $state({ done: 0, total: 0 });
	let generation = 0;
	const modelName = (id: Model) => (id === 'mediapipe' ? m.setup_mp() : m.setup_mn());
	async function check(selected: Model, reset = false) {
		const token = ++generation;
		status = { ready: false, available: [], version: '', complete: true };
		if (reset) failure = '';
		if (!navigator.serviceWorker?.controller) return;
		try {
			const result = await workerRequest('STATUS', selected);
			if (token === generation) {
				status = result;
				if (result.ready) failure = '';
			}
		} catch {
			if (token === generation) failure = 'download';
		}
	}
	async function prepare() {
		busy = true;
		failure = '';
		const selected = model;
		const token = ++generation;
		status.ready = false;
		progress = { done: 0, total: 0 };
		try {
			const result = await workerRequest('PREPARE', selected, (data) => {
				if (token === generation && data.done !== undefined)
					progress = { done: data.done, total: data.total ?? 0 };
			});
			if (token === generation) {
				status = result;
				failure = result.error ?? '';
			}
			// Persistence is a best-effort request, never a readiness guarantee.
			if (result.ready) void navigator.storage?.persist?.().catch(() => false);
		} catch {
			if (token === generation) failure = 'download';
		} finally {
			busy = false;
		}
	}
	$effect(() => {
		if (mounted) void check(model, true);
	});
	onMount(() => {
		mounted = true;
		offline = !navigator.onLine;
		const recheck = () => {
			offline = !navigator.onLine;
			if (!busy) void check(model);
		};
		const visible = () => {
			if (!document.hidden) recheck();
		};
		window.addEventListener('online', recheck);
		window.addEventListener('offline', recheck);
		document.addEventListener('visibilitychange', visible);
		navigator.serviceWorker?.addEventListener('controllerchange', recheck);
		return () => {
			generation++;
			window.removeEventListener('online', recheck);
			window.removeEventListener('offline', recheck);
			document.removeEventListener('visibilitychange', visible);
			navigator.serviceWorker?.removeEventListener('controllerchange', recheck);
		};
	});
</script>

<div class="flex flex-col gap-2" data-testid="offline-status" aria-live="polite">
	{#if busy}
		<Alert.Root role="status">
			<Spinner aria-hidden="true" />
			<Alert.Title>
				{m.offline_progress({ done: progress.done, total: progress.total })}
			</Alert.Title>
			<Alert.Description class="col-start-2 min-w-0 pt-2">
				<Progress
					value={progress.total ? progress.done : null}
					max={progress.total || 1}
					aria-label={m.offline_prepare()}
				/>
			</Alert.Description>
		</Alert.Root>
	{:else if status.ready && status.version === version}
		<Alert.Root role="status">
			<CircleCheck aria-hidden="true" />
			<Alert.Title>{m.offline_ready({ model: modelName(model) })}</Alert.Title>
		</Alert.Root>
	{:else}
		<Alert.Root role="status" variant={failure ? 'destructive' : 'default'}>
			{#if failure}<CircleAlert aria-hidden="true" />{:else}<Download aria-hidden="true" />{/if}
			<Alert.Description class="col-start-2 min-w-0">
				<p>
					{failure === 'storage'
						? m.offline_storage()
						: failure
							? m.offline_failed()
							: m.offline_incomplete()}
				</p>
				{#if offline}<p>{m.offline_unavailable({ model: modelName(model) })}</p>{/if}
				{#if status.available.length}<p>
						{m.offline_available({ models: status.available.map(modelName).join(', ') })}
					</p>{:else if offline}<p>{m.offline_none()}</p>{/if}
			</Alert.Description>
		</Alert.Root>
		<Button variant="outline" onclick={prepare}>
			{#if failure}<RotateCcw data-icon="inline-start" />{:else}<Download
					data-icon="inline-start"
				/>{/if}
			{failure ? m.retry() : m.offline_prepare()}
		</Button>
	{/if}
</div>
