import * as m from '#lib/paraglide/messages.js';
import type { ExerciseId } from './motion';

export const exerciseCategories = [
	{ heading: m.picker_upper_body, exercises: ['push-up', 'plank', 'burpee'] },
	{
		heading: m.picker_lower_body,
		exercises: [
			'glute-bridge',
			'squat',
			'squat-hold',
			'reverse-lunge',
			'forward-lunge',
			'pogo-jump',
			'squat-jump'
		]
	},
	{
		heading: m.picker_core,
		exercises: ['dead-bug', 'heel-tap', 'glute-bridge', 'plank', 'sit-up', 'bicycle-crunch']
	},
	{ heading: m.picker_full_body, exercises: ['front-jack', 'jumping-jack', 'burpee'] },
	{
		heading: m.picker_cardio,
		exercises: ['front-jack', 'jumping-jack', 'pogo-jump', 'squat-jump', 'burpee']
	},
	{
		heading: m.picker_stability,
		exercises: ['glute-bridge', 'dead-bug', 'squat-hold', 'plank', 'reverse-lunge', 'forward-lunge']
	}
] satisfies { heading: () => string; exercises: ExerciseId[] }[];
