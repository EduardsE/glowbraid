import { describe, expect, it } from "vitest";
import { FIBERS_PER_FRAME, generateFrame } from "../fibers";
import { FIBER_SAMPLES } from "../geometry";
import { LEDS_PER_FRAME } from "../leds";
import type { Point } from "../types";

/** Max perpendicular distance from the path's points to its endpoint chord. */
function maxChordDeviation(path: Point[]): number {
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let max = 0;
  for (const p of path) {
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    if (d > max) max = d;
  }
  return max;
}

describe("generateFrame", () => {
  it("is deterministic: same seed produces identical frames", () => {
    expect(generateFrame(7431)).toEqual(generateFrame(7431));
  });

  it("different seeds produce different layouts", () => {
    const a = generateFrame(1);
    const b = generateFrame(2);
    expect(a.fibers.map((f) => f.path)).not.toEqual(
      b.fibers.map((f) => f.path),
    );
  });

  it("produces exactly FIBERS_PER_FRAME fibers", () => {
    expect(FIBERS_PER_FRAME).toBe(12);
    expect(generateFrame(7431).fibers).toHaveLength(FIBERS_PER_FRAME);
  });

  it("perfect matching: every LED appears exactly once (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed);
      const used = frame.fibers
        .flatMap((f) => [f.startLedIndex, f.endLedIndex])
        .sort((x, y) => x - y);
      expect(used).toEqual(Array.from({ length: LEDS_PER_FRAME }, (_, i) => i));
    }
  });

  it("endpoints lie on different edges (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed);
      for (const fiber of frame.fibers) {
        expect(frame.leds[fiber.startLedIndex].side).not.toBe(
          frame.leds[fiber.endLedIndex].side,
        );
      }
    }
  });

  it("no straight fibers: every path bows off its chord (seeds 1-200 + known counterexamples)", () => {
    // 38535, 40561, 38381 each produced a near-straight fiber (max chord
    // deviation ~1e-4) before the PERP_FLOOR guarantee — pin them explicitly.
    const seeds = [
      ...Array.from({ length: 200 }, (_, i) => i + 1),
      38535,
      40561,
      38381,
    ];
    for (const seed of seeds) {
      const frame = generateFrame(seed);
      for (const fiber of frame.fibers) {
        expect(maxChordDeviation(fiber.path)).toBeGreaterThan(0.01);
      }
    }
  });

  it("every fiber references two valid LEDs and spans them exactly", () => {
    const frame = generateFrame(2024);
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

  it("counts crossings deterministically", () => {
    const frame = generateFrame(7431);
    expect(frame.crossings).toBe(generateFrame(7431).crossings);
    expect(frame.crossings).toBeGreaterThanOrEqual(0);
  });
});
