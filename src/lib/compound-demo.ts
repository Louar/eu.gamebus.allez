import type { CompoundId } from './compound-motion';

/** Side-view poses on the same 200px canvas as the original demonstrations. */
export function compoundShape(
	id: CompoundId,
	phase: string,
	side: 'left' | 'right',
	shapes: Record<string, number[][]>
) {
	let pose = shapes.standing;
	let dx = side === 'right' ? -5 : 0,
		dy = side === 'right' ? -2 : 0;
	const active = phase === side,
		opposite = phase === (side === 'left' ? 'right' : 'left');
	if (id.endsWith('lunge') && phase === 'split') {
		pose =
			side === 'left'
				? [
						[110, 70],
						[110, 92],
						[110, 111],
						[108, 113],
						[136, 126],
						[134, 159]
					]
				: [
						[108, 70],
						[108, 92],
						[108, 111],
						[105, 113],
						[109, 144],
						[90, 159]
					];
		if (id === 'reverse-lunge') dx -= 44;
	} else if (id === 'pogo-jump' || id === 'squat-jump') {
		if (phase === 'lowered') pose = shapes.squat;
		if (phase === 'hop') dy -= 8;
		if (phase === 'jump') dy -= 23;
	} else if (id === 'glute-bridge') {
		pose =
			phase === 'lying'
				? shapes.lying
				: [
						[49, 148],
						[66, 149],
						[85, 150],
						[89, 131],
						[117, 117],
						[141, 151]
					];
	} else if (id === 'heel-tap') {
		pose = [
			[56, 140],
			[76, 144],
			[91, 146],
			[96, 151],
			[120, 125],
			[122, 152]
		];
		if (active) pose = [[65, 139], [86, 142], [113, 150], ...pose.slice(3)];
	} else if (id === 'dead-bug' || id === 'bicycle-crunch') {
		pose = [
			[49, 146],
			[48, 124],
			[48, 101],
			[93, 151],
			[94, 116],
			[126, 116]
		];
		if (id === 'dead-bug' && active) pose = [pose[0], [29, 143], [8, 143], ...pose.slice(3)];
		if (id === 'bicycle-crunch')
			pose = [
				[49, 139],
				opposite ? [72, 116] : [37, 125],
				[46, 128],
				pose[3],
				[81, 118],
				[110, 110]
			];
		if (opposite) pose = [...pose.slice(0, 4), [124, 146], [155, 142]];
	}
	return pose.map(([x, y]) => [x + dx, y + dy]);
}
