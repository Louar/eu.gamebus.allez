import type { Keypoint } from './motion';

export const dist = (a: Keypoint, b: Keypoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function angle(a: Keypoint, b: Keypoint, c: Keypoint) {
	const cos = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (dist(a, b) * dist(c, b));
	return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}
