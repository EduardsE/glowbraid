import { describe, expect, it } from "vitest";
import { buildLeds, LEDS_PER_EDGE, LEDS_PER_FRAME } from "../leds";
import type { Side } from "../types";

describe("buildLeds", () => {
	const leds = buildLeds();

	it("returns exactly 24 LEDs with sequential indices", () => {
		expect(LEDS_PER_FRAME).toBe(24);
		expect(leds).toHaveLength(24);
		leds.forEach((led, i) => {
			expect(led.index).toBe(i);
		});
	});

	it("has 6 LEDs per side", () => {
		const sides: Side[] = ["top", "right", "bottom", "left"];
		for (const side of sides) {
			expect(leds.filter((l) => l.side === side)).toHaveLength(LEDS_PER_EDGE);
		}
	});

	it("groups each edge into two strips of 3", () => {
		for (const side of ["top", "right", "bottom", "left"] as const) {
			const edge = leds.filter((l) => l.side === side);
			expect(edge.filter((l) => l.strip === 0)).toHaveLength(3);
			expect(edge.filter((l) => l.strip === 1)).toHaveLength(3);
			expect(edge.map((l) => l.strip)).toEqual([0, 0, 0, 1, 1, 1]);
		}
	});

	it("has unique ids in EdgeCode+Number form", () => {
		const ids = leds.map((l) => l.id);
		expect(new Set(ids).size).toBe(24);
		expect(ids.slice(0, 6)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6"]);
		expect(ids[6]).toBe("R1");
		expect(ids[12]).toBe("B1");
		expect(ids[18]).toBe("L1");
	});

	it("places every LED on the frame border", () => {
		for (const led of leds) {
			const onBorder =
				led.position.x === 0 ||
				led.position.x === 1 ||
				led.position.y === 0 ||
				led.position.y === 1;
			expect(onBorder).toBe(true);
		}
	});

	it("has inward-pointing unit normals", () => {
		for (const led of leds) {
			const inner = {
				x: led.position.x + led.normal.x * 0.5,
				y: led.position.y + led.normal.y * 0.5,
			};
			expect(inner.x).toBeGreaterThan(0);
			expect(inner.x).toBeLessThan(1);
			expect(inner.y).toBeGreaterThan(0);
			expect(inner.y).toBeLessThan(1);
			expect(Math.hypot(led.normal.x, led.normal.y)).toBe(1);
		}
	});

	it("has strictly increasing perimeter coordinate u in [0, 1)", () => {
		for (let i = 1; i < leds.length; i++) {
			expect(leds[i].u).toBeGreaterThan(leds[i - 1].u);
		}
		expect(leds[0].u).toBeGreaterThanOrEqual(0);
		expect(leds[leds.length - 1].u).toBeLessThan(1);
	});
});
