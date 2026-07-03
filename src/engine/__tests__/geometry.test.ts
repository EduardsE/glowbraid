import { describe, expect, it } from "vitest";
import {
	countCrossings,
	FIBER_SAMPLES,
	pathsAreClose,
	polylineLength,
	sampleCubicBezier,
} from "../geometry";
import type { Point } from "../types";

// The proximity heuristic is calibrated for production-density (FIBER_SAMPLES) paths.
const line = (x0: number, y0: number, x1: number, y1: number): Point[] =>
	Array.from({ length: FIBER_SAMPLES }, (_, i) => {
		const t = i / (FIBER_SAMPLES - 1);
		return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
	});

describe("sampleCubicBezier", () => {
	it("returns FIBER_SAMPLES points by default, starting at p0 and ending at p3", () => {
		const pts = sampleCubicBezier(
			{ x: 0, y: 0 },
			{ x: 0.3, y: 0.5 },
			{ x: 0.7, y: 0.5 },
			{ x: 1, y: 1 },
		);
		expect(pts).toHaveLength(FIBER_SAMPLES);
		expect(pts[0]).toEqual({ x: 0, y: 0 });
		expect(pts[pts.length - 1].x).toBeCloseTo(1, 10);
		expect(pts[pts.length - 1].y).toBeCloseTo(1, 10);
	});

	it("degenerates to a straight line when control points are collinear", () => {
		const pts = sampleCubicBezier(
			{ x: 0, y: 0 },
			{ x: 1 / 3, y: 0 },
			{ x: 2 / 3, y: 0 },
			{ x: 1, y: 0 },
		);
		expect(polylineLength(pts)).toBeCloseTo(1, 6);
		for (const p of pts) expect(p.y).toBeCloseTo(0, 10);
	});
});

describe("polylineLength", () => {
	it("sums segment lengths", () => {
		expect(
			polylineLength([
				{ x: 0, y: 0 },
				{ x: 3, y: 0 },
				{ x: 3, y: 4 },
			]),
		).toBeCloseTo(7, 10);
	});
});

describe("pathsAreClose / countCrossings", () => {
	it("detects two crossing diagonals", () => {
		const a = line(0, 0, 1, 1);
		const b = line(0, 1, 1, 0);
		expect(pathsAreClose(a, b)).toBe(true);
		expect(countCrossings([a, b])).toBe(1);
	});

	it("does not flag far-apart parallel lines", () => {
		const a = line(0, 0, 1, 0);
		const b = line(0, 1, 1, 1);
		expect(pathsAreClose(a, b)).toBe(false);
		expect(countCrossings([a, b])).toBe(0);
	});
});
