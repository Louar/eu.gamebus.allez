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
		// A complete host recipe does not depend on the URL even if its link is invalid.
		const source = host.workout ?? encoded;
		if ('steps' in host && 'rounds' in host) {
			const workout = parseWorkout({
				steps: host.steps,
				rounds: host.rounds,
				rest: host.rest ?? 0
			});
			return { workout, planner, error: false };
		}
		let workout =
			typeof source === 'string' ? decodeWorkout(source) : parseWorkout(source ?? example);
		if ('steps' in host) {
			workout = parseWorkout({
				steps: host.steps,
				rounds: workout.repeat && 'rounds' in workout.repeat ? workout.repeat.rounds : 1,
				rest: host.rest ?? workout.rest ?? 0
			});
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
