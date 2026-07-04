import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIBER_STYLE,
  FIBERS_PER_FRAME,
  generateFrame,
} from "../fibers";
import { FIBER_SAMPLES } from "../geometry";
import { LEDS_PER_FRAME } from "../leds";
import type { FiberStyle, Point } from "../types";

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

/** Signed perpendicular distance of each path point from the endpoint chord. */
function signedDeviations(path: Point[]): number[] {
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return path.map((p) => ((p.x - a.x) * dy - (p.y - a.y) * dx) / len);
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

describe("generateFrame with FiberStyle", () => {
  const TAUT: FiberStyle = { curviness: 0, randomness: 0.5 };

  const STYLE_EXTREMES: FiberStyle[] = [
    { curviness: 0, randomness: 0 },
    { curviness: 0, randomness: 1 },
    { curviness: 1, randomness: 0 },
    { curviness: 1, randomness: 1 },
    { curviness: 0.5, randomness: 0.5 },
  ];

  it("every path point stays inside the frame at all style extremes (seeds 1-100)", () => {
    for (const style of STYLE_EXTREMES) {
      for (let seed = 1; seed <= 100; seed++) {
        const frame = generateFrame(seed, style);
        for (const fiber of frame.fibers) {
          for (const p of fiber.path) {
            expect(p.x).toBeGreaterThanOrEqual(-1e-9);
            expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(-1e-9);
            expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it("defaults match DEFAULT_FIBER_STYLE exactly", () => {
    expect(DEFAULT_FIBER_STYLE).toEqual({ curviness: 0.5, randomness: 0.5 });
    expect(generateFrame(7431)).toEqual(
      generateFrame(7431, DEFAULT_FIBER_STYLE),
    );
  });

  it("is deterministic per (seed, style)", () => {
    const style: FiberStyle = { curviness: 0.3, randomness: 0.8 };
    expect(generateFrame(7431, style)).toEqual(generateFrame(7431, style));
  });

  it("changing curviness changes fiber paths", () => {
    const a = generateFrame(7431, { curviness: 0, randomness: 0.5 });
    const b = generateFrame(7431, { curviness: 1, randomness: 0.5 });
    expect(a.fibers.map((f) => f.path)).not.toEqual(
      b.fibers.map((f) => f.path),
    );
  });

  it("clamps out-of-range style values to the extremes", () => {
    expect(generateFrame(5, { curviness: -1, randomness: 2 })).toEqual(
      generateFrame(5, { curviness: 0, randomness: 1 }),
    );
  });

  it("falls back to defaults for non-finite style values", () => {
    expect(
      generateFrame(5, { curviness: Number.NaN, randomness: Number.NaN }),
    ).toEqual(generateFrame(5));
  });

  it("no straight fibers at curviness 0 (seeds 1-200)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const frame = generateFrame(seed, TAUT);
      for (const fiber of frame.fibers) {
        expect(maxChordDeviation(fiber.path)).toBeGreaterThan(0.01);
      }
    }
  });

  it("no S-curves at curviness 0: paths stay on one side of their chord (seeds 1-200)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const frame = generateFrame(seed, TAUT);
      for (const fiber of frame.fibers) {
        const devs = signedDeviations(fiber.path);
        const extreme = devs.reduce(
          (m, d) => (Math.abs(d) > Math.abs(m) ? d : m),
          0,
        );
        const side = Math.sign(extreme) || 1;
        for (const d of devs) {
          expect(d * side).toBeGreaterThan(-0.005);
        }
      }
    }
  });
});
