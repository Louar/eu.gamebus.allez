import { writable } from 'svelte/store';
import { resolve as appPath } from '$app/paths';

export type Model = 'mediapipe' | 'movenet';
export type OfflineStatus = {
	ready: boolean;
	available: Model[];
	version: string;
	complete: true;
	error?: string;
};
export type OfflineProgress = { complete: false; done?: number; total?: number };
export const workoutBusy = writable(false);
export const updateLocked = writable(false);

export function registerPwa() {
	return navigator.serviceWorker.register(`${appPath('/')}service-worker.js`, {
		scope: appPath('/'),
		type: 'module',
		updateViaCache: 'none'
	});
}

export async function workerRequest(
	type: 'STATUS' | 'PREPARE',
	model: Model,
	onprogress?: (status: OfflineProgress) => void
): Promise<OfflineStatus> {
	if (type === 'PREPARE' && !navigator.serviceWorker?.controller) {
		// Retry an initial shell installation that was interrupted or ran out of space.
		const registration = await registerPwa();
		await new Promise<void>((resolve, reject) => {
			const installing = registration.installing ?? registration.waiting ?? registration.active;
			const cleanup = () => {
				clearTimeout(timer);
				navigator.serviceWorker.removeEventListener('controllerchange', controlled);
				installing?.removeEventListener('statechange', changed);
			};
			const controlled = () => {
				if (!navigator.serviceWorker.controller) return;
				cleanup();
				resolve();
			};
			const changed = () => {
				if (navigator.serviceWorker.controller) return controlled();
				if (!installing || installing.state === 'redundant') {
					cleanup();
					reject(new Error('installation'));
				}
			};
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error('uncontrolled'));
			}, 180_000);
			navigator.serviceWorker.addEventListener('controllerchange', controlled);
			installing?.addEventListener('statechange', changed);
			changed();
		});
	}
	return new Promise((resolve, reject) => {
		const worker = navigator.serviceWorker?.controller;
		if (!worker) return reject(new Error('uncontrolled'));
		const channel = new MessageChannel();
		let timer: ReturnType<typeof setTimeout>;
		const renew = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				channel.port1.close();
				reject(new Error('timeout'));
			}, 180_000);
		};
		renew();
		channel.port1.onmessage = ({ data }: MessageEvent<OfflineStatus | OfflineProgress>) => {
			renew();
			if (data.complete) {
				clearTimeout(timer);
				channel.port1.close();
				resolve(data);
			} else onprogress?.(data);
		};
		worker.postMessage({ type, model }, [channel.port2]);
	});
}
