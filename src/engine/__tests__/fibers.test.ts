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
        // Perpendicular exits cap the bow of near-facing opposite pairs
        // (min cross-offset 0.085 → deviation ≈ 0.007); floor lowered from
        // 0.01 accordingly. Exactly-facing pairs are matcher-excluded.
        expect(maxChordDeviation(fiber.path)).toBeGreaterThan(0.005);
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

  it("never matches exactly-facing LEDs (seeds 1-200)", () => {
    // Opposite parallel edges + same cross-axis coordinate would force a
    // dead-straight fiber under perpendicular exits (socket-depth spec).
    for (let seed = 1; seed <= 200; seed++) {
      const frame = generateFrame(seed);
      for (const fiber of frame.fibers) {
        const a = frame.leds[fiber.startLedIndex];
        const b = frame.leds[fiber.endLedIndex];
        const opposite =
          a.normal.x + b.normal.x === 0 && a.normal.y + b.normal.y === 0;
        if (!opposite) continue;
        const cross =
          a.normal.x !== 0
            ? Math.abs(a.position.y - b.position.y)
            : Math.abs(a.position.x - b.position.x);
        expect(cross).toBeGreaterThan(1e-6);
      }
    }
  });
});

describe("generateFrame with FiberStyle", () => {
  const STYLE_EXTREMES: FiberStyle[] = [
    { curviness: 0, randomness: 0, socketDepth: 0.4 },
    { curviness: 0, randomness: 1, socketDepth: 0.4 },
    { curviness: 1, randomness: 0, socketDepth: 0.4 },
    { curviness: 1, randomness: 1, socketDepth: 0.4 },
    { curviness: 0.5, randomness: 0.5, socketDepth: 0.4 },
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
    expect(DEFAULT_FIBER_STYLE).toEqual({
      curviness: 0.5,
      randomness: 0.5,
      socketDepth: 0.4,
    });
    expect(generateFrame(7431)).toEqual(
      generateFrame(7431, DEFAULT_FIBER_STYLE),
    );
  });

  it("is deterministic per (seed, style)", () => {
    const style: FiberStyle = {
      curviness: 0.3,
      randomness: 0.8,
      socketDepth: 0.4,
    };
    expect(generateFrame(7431, style)).toEqual(generateFrame(7431, style));
  });

  it("changing curviness changes fiber paths", () => {
    const a = generateFrame(7431, {
      curviness: 0,
      randomness: 0.5,
      socketDepth: 0.4,
    });
    const b = generateFrame(7431, {
      curviness: 1,
      randomness: 0.5,
      socketDepth: 0.4,
    });
    expect(a.fibers.map((f) => f.path)).not.toEqual(
      b.fibers.map((f) => f.path),
    );
  });

  it("clamps out-of-range style values to the extremes", () => {
    expect(
      generateFrame(5, { curviness: -1, randomness: 2, socketDepth: 0.4 }),
    ).toEqual(
      generateFrame(5, { curviness: 0, randomness: 1, socketDepth: 0.4 }),
    );
  });

  it("falls back to defaults for non-finite style values", () => {
    expect(
      generateFrame(5, {
        curviness: Number.NaN,
        randomness: Number.NaN,
        socketDepth: Number.NaN,
      }),
    ).toEqual(generateFrame(5));
  });

  it("no straight fibers at curviness 0 (seeds 1-200)", () => {
    // The bow of a near-facing opposite pair scales with the control-arm
    // length (bow ∝ cross-offset × arm). At socketDepth 0 the arms compress
    // to ARM_TUCK (0.3×), so the worst-case bow drops to ≈ 0.0023 — near
    // straight is physically correct for a shallow socket. Exactly-facing
    // pairs stay matcher-excluded, so a dead-straight fiber (deviation ~0)
    // still fails these floors.
    for (const [socketDepth, floor] of [
      [0, 0.0015],
      [0.4, 0.005],
    ]) {
      const style: FiberStyle = { curviness: 0, randomness: 0.5, socketDepth };
      for (let seed = 1; seed <= 200; seed++) {
        const frame = generateFrame(seed, style);
        for (const fiber of frame.fibers) {
          expect(maxChordDeviation(fiber.path)).toBeGreaterThan(floor);
        }
      }
    }
  });

  it("changing randomness changes the pairing for some seeds", () => {
    const pairsAt = (r: number) =>
      Array.from({ length: 20 }, (_, i) =>
        generateFrame(i + 1, {
          curviness: 0.5,
          randomness: r,
          socketDepth: 0.4,
        }).fibers.map((f) => [f.startLedIndex, f.endLedIndex]),
      );
    expect(pairsAt(0)).not.toEqual(pairsAt(1));
  });

  it("matching invariants hold at randomness extremes (seeds 1-50)", () => {
    for (const randomness of [0, 1]) {
      for (let seed = 1; seed <= 50; seed++) {
        const frame = generateFrame(seed, {
          curviness: 0.5,
          randomness,
          socketDepth: 0.4,
        });
        const used = frame.fibers
          .flatMap((f) => [f.startLedIndex, f.endLedIndex])
          .sort((x, y) => x - y);
        expect(used).toEqual(
          Array.from({ length: LEDS_PER_FRAME }, (_, i) => i),
        );
        for (const fiber of frame.fibers) {
          expect(frame.leds[fiber.startLedIndex].side).not.toBe(
            frame.leds[fiber.endLedIndex].side,
          );
        }
      }
    }
  });
});

describe("generateFrame socket depth (perpendicular exits)", () => {
  const depthStyle = (socketDepth: number): FiberStyle => ({
    curviness: 0.5,
    randomness: 0.5,
    socketDepth,
  });

  /** Engine's stub-length mapping: L = lerp(0, 0.12, socketDepth). */
  const stubLength = (socketDepth: number) => 0.12 * socketDepth;

  it("every fiber exits both LEDs exactly perpendicular through its stub (seeds 1-100, depths 0/0.4/1)", () => {
    for (const socketDepth of [0, 0.4, 1]) {
      const L = stubLength(socketDepth);
      for (let seed = 1; seed <= 100; seed++) {
        const frame = generateFrame(seed, depthStyle(socketDepth));
        for (const fiber of frame.fibers) {
          const a = frame.leds[fiber.startLedIndex];
          const b = frame.leds[fiber.endLedIndex];
          const first = fiber.path[1];
          expect(first.x).toBeCloseTo(a.position.x + a.normal.x * L, 12);
          expect(first.y).toBeCloseTo(a.position.y + a.normal.y * L, 12);
          const last = fiber.path[fiber.path.length - 2];
          expect(last.x).toBeCloseTo(b.position.x + b.normal.x * L, 12);
          expect(last.y).toBeCloseTo(b.position.y + b.normal.y * L, 12);
        }
      }
    }
  });

  it("the curve leaves the stub tip along the normal (no kink), seeds 1-50", () => {
    // First cubic sample after the stub tip: its deviation from the normal
    // ray through the LED is O(t²) ≈ 0.002 — assert well under 0.01.
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed, depthStyle(1));
      for (const fiber of frame.fibers) {
        const a = frame.leds[fiber.startLedIndex];
        const p = fiber.path[2];
        const offNormal = Math.abs(
          (p.x - a.position.x) * a.normal.y - (p.y - a.position.y) * a.normal.x,
        );
        expect(offNormal).toBeLessThan(0.01);
        const b = frame.leds[fiber.endLedIndex];
        const q = fiber.path[fiber.path.length - 3];
        expect(
          Math.abs(
            (q.x - b.position.x) * b.normal.y -
              (q.y - b.position.y) * b.normal.x,
          ),
        ).toBeLessThan(0.01);
      }
    }
  });

  it("shallower sockets bend sooner: mean perpendicular run grows with depth (seeds 1-50)", () => {
    // Distance from the LED at which the path first strays more than 0.02
    // off the normal ray — the visible "socket run". Stub length alone
    // barely moves this (the control arm dominates); the arm compression at
    // low socketDepth is what makes the slider minimum visibly shallow.
    const meanRun = (socketDepth: number) => {
      let total = 0;
      let count = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const frame = generateFrame(seed, depthStyle(socketDepth));
        for (const fiber of frame.fibers) {
          const a = frame.leds[fiber.startLedIndex];
          for (const p of fiber.path) {
            const off = Math.abs(
              (p.x - a.position.x) * a.normal.y -
                (p.y - a.position.y) * a.normal.x,
            );
            if (off > 0.02) {
              total += Math.hypot(p.x - a.position.x, p.y - a.position.y);
              count++;
              break;
            }
          }
        }
      }
      return total / count;
    };
    const shallow = meanRun(0);
    const mid = meanRun(0.4);
    const deep = meanRun(1);
    expect(shallow).toBeLessThan(mid * 0.6);
    expect(mid).toBeLessThan(deep);
  });

  it("socketDepth reshapes paths without changing pairings (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const shallow = generateFrame(seed, depthStyle(0));
      const deep = generateFrame(seed, depthStyle(1));
      expect(
        shallow.fibers.map((f) => [f.startLedIndex, f.endLedIndex]),
      ).toEqual(deep.fibers.map((f) => [f.startLedIndex, f.endLedIndex]));
      expect(shallow.fibers.map((f) => f.path)).not.toEqual(
        deep.fibers.map((f) => f.path),
      );
    }
  });

  it("stays inside the frame at socket depth extremes (seeds 1-100)", () => {
    for (const socketDepth of [0, 1]) {
      for (let seed = 1; seed <= 100; seed++) {
        const frame = generateFrame(seed, depthStyle(socketDepth));
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

  it("sanitizes socketDepth like the other axes", () => {
    expect(
      generateFrame(5, { curviness: 0.5, randomness: 0.5, socketDepth: 2 }),
    ).toEqual(generateFrame(5, depthStyle(1)));
    expect(
      generateFrame(5, {
        curviness: 0.5,
        randomness: 0.5,
        socketDepth: Number.NaN,
      }),
    ).toEqual(generateFrame(5, depthStyle(0.4)));
  });
});
