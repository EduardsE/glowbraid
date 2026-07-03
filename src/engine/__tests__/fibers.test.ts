import { describe, expect, it } from "vitest";
import { generateFrame } from "../fibers";
import { FIBER_SAMPLES } from "../geometry";

describe("generateFrame", () => {
	it("is deterministic: same seed and density produce identical frames", () => {
		expect(generateFrame(7431, 16)).toEqual(generateFrame(7431, 16));
	});

	it("different seeds produce different layouts", () => {
		const a = generateFrame(1, 16);
		const b = generateFrame(2, 16);
		expect(a.fibers.map((f) => f.path)).not.toEqual(
			b.fibers.map((f) => f.path),
		);
	});

	it("produces exactly `density` fibers", () => {
		expect(generateFrame(7431, 8).fibers).toHaveLength(8);
		expect(generateFrame(7431, 24).fibers).toHaveLength(24);
	});

	it("every fiber references two valid LEDs and spans them exactly", () => {
		const frame = generateFrame(2024, 18);
		for (const fiber of frame.fibers) {
			const a = frame.leds[fiber.startLedIndex];
			const b = frame.leds[fiber.endLedIndex];
			expect(a).toBeDefined();
			expect(b).toBeDefined();
			expect(fiber.path).toHaveLength(FIBER_SAMPLES);
			expect(fiber.path[0]).toEqual(a.position);
			const last = fiber.path[fiber.path.length - 1];
			expect(last.x).toBeCloseTo(b.position.x, 10);
			expect(last.y).toBeCloseTo(b.position.y, 10);
			expect(fiber.length).toBeGreaterThan(0);
			expect(fiber.thickness).toBeGreaterThanOrEqual(0.85);
			expect(fiber.thickness).toBeLessThan(1.35);
		}
	});

	it("routing constraints hold across seeds 1–30 at density 16", () => {
		for (let seed = 1; seed <= 30; seed++) {
			const frame = generateFrame(seed, 16);
			const pairs = new Set<string>();
			for (const fiber of frame.fibers) {
				const a = frame.leds[fiber.startLedIndex];
				const b = frame.leds[fiber.endLedIndex];
				expect(a.side).not.toBe(b.side);
				expect(
					Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y),
				).toBeGreaterThanOrEqual(0.42);
				const key =
					fiber.startLedIndex < fiber.endLedIndex
						? `${fiber.startLedIndex}-${fiber.endLedIndex}`
						: `${fiber.endLedIndex}-${fiber.startLedIndex}`;
				expect(pairs.has(key)).toBe(false);
				pairs.add(key);
			}
		}
	});

	it("counts crossings deterministically", () => {
		const frame = generateFrame(7431, 16);
		expect(frame.crossings).toBe(generateFrame(7431, 16).crossings);
		expect(frame.crossings).toBeGreaterThanOrEqual(0);
	});
});
