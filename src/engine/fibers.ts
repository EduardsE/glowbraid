import {
	countCrossings,
	FIBER_SAMPLES,
	polylineLength,
	sampleCubicBezier,
} from "./geometry";
import { buildLeds } from "./leds";
import { createRng } from "./random";
import type { Fiber, Frame } from "./types";

/** Endpoints closer than this are rejected (no tiny or single-edge fibers). */
export const MIN_ENDPOINT_DISTANCE = 0.42;
/** Retry budget per fiber; on exhaustion the last candidate is accepted. */
export const MAX_PICK_TRIES = 14;

const CONTROL_MIN = 0.34;
const CONTROL_RANGE = 0.42;

function pairKey(a: number, b: number): string {
	return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Deterministically generate one frame's fiber layout from a seed.
 * Ported from the design reference, plus a no-duplicate-pairs constraint
 * (spec §6). Fibers always connect exactly two LEDs.
 */
export function generateFrame(seed: number, density: number): Frame {
	const rnd = createRng(seed);
	const leds = buildLeds();
	const fibers: Fiber[] = [];
	const usedPairs = new Set<string>();

	for (let f = 0; f < density; f++) {
		const startIndex = Math.floor(rnd() * leds.length);
		const start = leds[startIndex];
		let endIndex = startIndex;
		let end = start;
		let tries = 0;
		do {
			endIndex = Math.floor(rnd() * leds.length);
			end = leds[endIndex];
			tries++;
		} while (
			(end.side === start.side ||
				Math.hypot(
					start.position.x - end.position.x,
					start.position.y - end.position.y,
				) < MIN_ENDPOINT_DISTANCE ||
				usedPairs.has(pairKey(startIndex, endIndex))) &&
			tries < MAX_PICK_TRIES
		);
		usedPairs.add(pairKey(startIndex, endIndex));

		const dA = CONTROL_MIN + rnd() * CONTROL_RANGE;
		const dB = CONTROL_MIN + rnd() * CONTROL_RANGE;
		const p1 = {
			x: start.position.x + start.normal.x * dA,
			y: start.position.y + start.normal.y * dA,
		};
		const p2 = {
			x: end.position.x + end.normal.x * dB,
			y: end.position.y + end.normal.y * dB,
		};
		const path = sampleCubicBezier(
			start.position,
			p1,
			p2,
			end.position,
			FIBER_SAMPLES,
		);

		fibers.push({
			id: `${seed}-${f}`,
			startLedIndex: startIndex,
			endLedIndex: endIndex,
			path,
			length: polylineLength(path),
			thickness: 0.85 + rnd() * 0.5,
			hueBase: (start.u + end.u) / 2,
		});
	}

	return {
		seed,
		leds,
		fibers,
		crossings: countCrossings(fibers.map((fiber) => fiber.path)),
	};
}
