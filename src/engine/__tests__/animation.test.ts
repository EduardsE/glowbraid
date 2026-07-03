import { describe, expect, it } from "vitest";
import { ANIMATIONS, ledColor } from "../animation";
import { buildLeds } from "../leds";
import { PALETTES } from "../palettes";

const leds = buildLeds();
const sunset = PALETTES.sunset;

describe("ANIMATIONS", () => {
	it("lists the six patterns in design order", () => {
		expect(ANIMATIONS.map((a) => a.id)).toEqual([
			"flow",
			"rainbow",
			"pulse",
			"breathe",
			"sparkle",
			"gradient",
		]);
		expect(ANIMATIONS.map((a) => a.name)).toEqual([
			"Flowing",
			"Rainbow",
			"Pulse",
			"Breathing",
			"Sparkle",
			"Gradient",
		]);
	});
});

describe("ledColor", () => {
	it("is deterministic", () => {
		for (const anim of ANIMATIONS) {
			expect(ledColor(leds[3], 0.5, 4.2, anim.id, 1, sunset)).toEqual(
				ledColor(leds[3], 0.5, 4.2, anim.id, 1, sunset),
			);
		}
	});

	it("flow and rainbow run at full brightness", () => {
		expect(ledColor(leds[0], 0, 1, "flow", 1, sunset).brightness).toBe(1);
		expect(ledColor(leds[0], 0, 1, "rainbow", 1, sunset).brightness).toBe(1);
	});

	it("pulse brightness stays within [0.22, 1]", () => {
		for (let t = 0; t < 12; t += 0.25) {
			const b = ledColor(leds[5], 0.3, t, "pulse", 1.5, sunset).brightness;
			expect(b).toBeGreaterThanOrEqual(0.22);
			expect(b).toBeLessThanOrEqual(1);
		}
	});

	it("breathe brightness stays within [0.2, 1]", () => {
		for (let t = 0; t < 12; t += 0.25) {
			const b = ledColor(leds[5], 0.3, t, "breathe", 1, sunset).brightness;
			expect(b).toBeGreaterThanOrEqual(0.2);
			expect(b).toBeLessThanOrEqual(1);
		}
	});

	it("flow color changes over time", () => {
		expect(ledColor(leds[0], 0, 0, "flow", 1, sunset).color).not.toEqual(
			ledColor(leds[0], 0, 2, "flow", 1, sunset).color,
		);
	});

	it("accepts negative time (delayed sampling) without throwing", () => {
		for (const anim of ANIMATIONS) {
			const out = ledColor(leds[7], 0.5, -1.3, anim.id, 1, sunset);
			expect(out.color).toHaveLength(3);
			expect(Number.isFinite(out.brightness)).toBe(true);
		}
	});
});
