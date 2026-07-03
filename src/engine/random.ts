export type Rng = () => number;

/** Deterministic seeded PRNG — same seed, same sequence. Ported from the design reference. */
export function createRng(seed: number): Rng {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Stateless hash of a number into [0, 1). Used by the sparkle animation. */
export function hash(n: number): number {
	const s = Math.sin(n * 12.9898) * 43758.5453;
	return s - Math.floor(s);
}
