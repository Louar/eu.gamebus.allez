import type { ActivitySnapshot } from './lifecycle.js';

type Property = { template: string; obj: unknown };
type Run = { start: string; id?: string; failed?: boolean };
type Write = {
	run: Run;
	operation: 'create' | 'update';
	properties: Property[];
	end: string;
};

function seconds(value: number) {
	return { value: Math.round(value), unit: 'SECONDS' };
}

function properties(snapshot: ActivitySnapshot, isCompleted: boolean): Property[] {
	const results = snapshot.results.filter((result) => !result.partial);
	const qualities = results.flatMap(({ quality }) => (quality === null ? [] : [quality]));
	return [
		{ template: 'duration', obj: seconds(snapshot.elapsed) },
		{ template: 'workoutRounds', obj: { value: snapshot.completedRounds } },
		{ template: 'isCompleted', obj: { value: isCompleted } },
		{
			template: 'workoutQuality',
			obj: {
				value: qualities.length
					? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length)
					: 0
			}
		},
		...results.map((result) => {
			const step = snapshot.workout.steps[result.stepIndex];
			return {
				template: 'workoutStep',
				obj: {
					round: result.round,
					step: result.stepIndex + 1,
					exercise: result.exercise,
					...(result.quality !== null ? { quality: result.quality } : {}),
					duration: seconds(result.elapsed),
					...('reps' in step || result.reps > 0 ? { repetitions: result.reps } : {})
				}
			};
		})
	];
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function connectGameBus(
	onVariables: (settings: Record<string, unknown>) => void,
	onError?: (message: string) => void
) {
	const parent = window.parent;
	const embedded = parent !== window;
	let origin: string | undefined;
	let current: Run | undefined;
	let queue: Write[] = [];
	let pending: { write: Write; requestId: string; timer: number } | undefined;
	let closed = false;

	function fail(run: Run, message: string) {
		// Never retry an uncertain create or turn an unacknowledged update into a new activity.
		run.failed = true;
		queue = queue.filter((item) => item.run !== run);
		onError?.(message);
	}

	function flush() {
		if (closed || !origin || pending) return;
		const write = queue.shift();
		if (!write) return;
		const requestId = crypto.randomUUID();
		const timer = window.setTimeout(() => {
			pending = undefined;
			fail(write.run, 'GameBus did not acknowledge the activity.');
			flush();
		}, 30_000);
		pending = { write, requestId, timer };
		parent.postMessage(
			{
				type: 'SILENT_ACTIVITY',
				requestId,
				data: {
					template: 'executeHomeWorkout',
					...(write.operation === 'update' ? { id: write.run.id } : {}),
					start: write.run.start,
					end: write.end,
					properties: write.properties
				}
			},
			origin
		);
	}

	function receive(event: MessageEvent<unknown>) {
		if (event.source !== parent || (origin && event.origin !== origin)) return;
		const message = event.data;
		if (!/^https?:\/\//.test(event.origin) || !record(message) || !record(message.data)) return;
		const data = message.data;
		if (message.type === 'INPUT_COLLECTIONS' || message.type === 'TASK') {
			origin ??= event.origin;
			if (message.type === 'INPUT_COLLECTIONS') {
				const settings = record(data.allez) ? data.allez.settings : undefined;
				onVariables(record(settings) ? settings : {});
			}
			flush();
			return;
		}
		if (message.type !== 'ACTIVITY_RESULT' || !pending || message.requestId !== pending.requestId)
			return;
		const { write, timer } = pending;
		if (data.operation !== write.operation) return;
		window.clearTimeout(timer);
		pending = undefined;
		if (
			data.success === true &&
			typeof data.id === 'string' &&
			data.id &&
			(write.operation === 'create' || data.id === write.run.id)
		) {
			write.run.id = data.id;
		} else {
			fail(
				write.run,
				typeof data.message === 'string' ? data.message : 'GameBus did not confirm the activity ID.'
			);
		}
		flush();
	}

	if (embedded) {
		window.addEventListener('message', receive);
		// Only the non-sensitive ready signal uses broadcast origin discovery.
		parent.postMessage({ type: 'IFRAME_READY' }, '*');
	}

	function enqueue(operation: Write['operation'], snapshot: ActivitySnapshot, isCompleted = false) {
		if (!embedded || closed) return;
		const end = new Date().toISOString();
		if (operation === 'create') current = { start: end };
		if (!current || current.failed) return;
		queue.push({
			run: current,
			operation,
			end,
			properties: properties(snapshot, isCompleted)
		});
		flush();
	}

	return {
		start: (snapshot: ActivitySnapshot) => enqueue('create', snapshot),
		update: (snapshot: ActivitySnapshot, isCompleted = false) =>
			enqueue('update', snapshot, isCompleted),
		destroy() {
			closed = true;
			window.removeEventListener('message', receive);
			if (pending) window.clearTimeout(pending.timer);
			pending = undefined;
			queue = [];
		}
	};
}
