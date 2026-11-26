import { createContext } from 'svelte';
import type { Readable } from 'svelte/store';
import type { ActivityListener } from './lifecycle';
import { decodeWorkout, example, parseWorkout } from './workout';

type Variables = Record<string, unknown>;
export const [getEmbed, setEmbed] = createContext<{
	settings: Readable<Variables>;
	onactivity: ActivityListener | undefined;
}>();

export function launchSettings(
	params: Pick<URLSearchParams, 'get'>,
	encoded: string | null,
	host: Variables
) {
	const model = host.model ?? params.get('model');
	const sound = host.sound ?? params.get('sound') !== '0';
	const planner = {
		model: model === 'movenet' ? ('movenet' as const) : ('mediapipe' as const),
		sound: sound !== false
	};
	try {
		const source = host.workout ?? encoded;
		let workout;
		try {
			workout =
				typeof source === 'string' ? decodeWorkout(source) : parseWorkout(source ?? example);
		} catch (err) {
			// A self-contained collection recipe can still replace a malformed URL.
			if (!('steps' in host && 'rounds' in host)) throw err;
			workout = example;
		}
		if ('steps' in host) {
			const selected = parseWorkout({
				steps: host.steps,
				...('rounds' in host ? { rounds: host.rounds } : {}),
				rest: 'rest' in host ? host.rest : workout.rest
			});
			if (!('rounds' in host) && workout.repeat) selected.repeat = workout.repeat;
			workout = selected;
		} else if ('rounds' in host || 'rest' in host)
			workout = parseWorkout({
				...workout,
				...('rounds' in host ? { repeat: { rounds: host.rounds } } : {}),
				...('rest' in host ? { rest: host.rest } : {})
			});
		return { workout, planner, error: false };
	} catch {
		return { workout: example, planner, error: true };
	}
}
