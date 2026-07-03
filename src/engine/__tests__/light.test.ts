import { describe, expect, it } from "vitest";
import { blendSegment, delayedTime, TRAVEL } from "../light";
import type { LedLight } from "../types";

const red: LedLight = { color: [255, 0, 0], brightness: 1 };
const blue: LedLight = { color: [0, 0, 255], brightness: 1 };
const dark: LedLight = { color: [255, 255, 255], brightness: 0 };

describe("blendSegment", () => {
	it("blends toward purple at the midpoint of a red↔blue fiber", () => {
		const mid = blendSegment(red, blue, 0.5);
		expect(mid.visible).toBe(true);
		expect(mid.color[0]).toBeGreaterThan(0);
		expect(mid.color[2]).toBeGreaterThan(0);
		expect(mid.color[0]).toBeCloseTo(mid.color[2], 6);
		expect(mid.color[1]).toBeCloseTo(0, 6);
	});

	it("is dominated by the nearer LED", () => {
		const nearRed = blendSegment(red, blue, 0.1);
		expect(nearRed.color[0]).toBeGreaterThan(nearRed.color[2]);
		const nearBlue = blendSegment(red, blue, 0.9);
		expect(nearBlue.color[2]).toBeGreaterThan(nearBlue.color[0]);
	});

	it("intensity is higher near an endpoint than at the midpoint", () => {
		expect(blendSegment(red, blue, 0.05).intensity).toBeGreaterThan(
			blendSegment(red, blue, 0.5).intensity,
		);
	});

	it("fades monotonically toward a dark end", () => {
		let prev = Number.POSITIVE_INFINITY;
		for (const um of [0.1, 0.3, 0.5, 0.7, 0.9]) {
			const seg = blendSegment(red, dark, um);
			expect(seg.intensity).toBeLessThan(prev);
			prev = seg.intensity;
		}
	});

	it("reports invisible when both ends are off", () => {
		const seg = blendSegment(dark, dark, 0.5);
		expect(seg.visible).toBe(false);
		expect(seg.intensity).toBe(0);
	});

	it("clamps intensity to 1", () => {
		expect(blendSegment(red, blue, 0.02).intensity).toBeLessThanOrEqual(1);
	});
});

describe("delayedTime", () => {
	it("subtracts travel delay proportional to distance", () => {
		expect(delayedTime(10, 2)).toBeCloseTo(10 - 2 * TRAVEL, 10);
		expect(delayedTime(0, 1)).toBeCloseTo(-TRAVEL, 10);
	});
});
