import { describe, expect, it } from "vitest";
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
import {
  BULGE_MAX,
  BULGE_MIN,
  bulgeHeight,
  computeWorldLayout,
  FIBER_LIFT,
  fiberWorldPoints,
  frameOrigin,
} from "../fiberGeometry";

const frame = generateFrame(4242, DEFAULT_FIBER_STYLE);
// 2×2 grid, 25cm frames, 20mm gap, 4cm padding → board edge 2*25 + 2 + 2*4 = 60cm
const layout = computeWorldLayout(2, 25, 20, 4);

describe("computeWorldLayout", () => {
  it("sizes the board from frames, gaps and padding", () => {
    expect(layout.boardSize).toBe(60);
    expect(layout.gapCm).toBe(2);
    expect(layout.border).toBeCloseTo(25 * 0.03, 6);
    expect(layout.panelSize).toBeCloseTo(25 - 2 * 25 * 0.03, 6);
  });

  it("handles a 1×1 grid with zero gap contribution", () => {
    const single = computeWorldLayout(1, 30, 20, 0);
    expect(single.boardSize).toBe(30);
  });
});

describe("frameOrigin", () => {
  it("places frame 0 at the top-left, inside the padding", () => {
    expect(frameOrigin(layout, 0)).toEqual({ x: -26, y: 26 });
  });

  it("steps right along a row and down between rows", () => {
    expect(frameOrigin(layout, 1)).toEqual({ x: 1, y: 26 });
    expect(frameOrigin(layout, 2)).toEqual({ x: -26, y: -1 });
  });
});

describe("bulgeHeight", () => {
  it("stays within [BULGE_MIN, BULGE_MAX]", () => {
    for (let i = 0; i < frame.fibers.length; i++) {
      const h = bulgeHeight(0, frame.fibers[i]);
      expect(h).toBeGreaterThanOrEqual(BULGE_MIN);
      expect(h).toBeLessThanOrEqual(BULGE_MAX);
    }
  });

  it("varies with the frame index", () => {
    expect(bulgeHeight(0, frame.fibers[0])).not.toBe(
      bulgeHeight(1, frame.fibers[0]),
    );
  });
});

describe("fiberWorldPoints", () => {
  const fiber = frame.fibers[0];

  it("emits xyz triplets for every path point", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    expect(p.length).toBe(fiber.path.length * 3);
  });

  it("pins z to the lift height at both socket ends", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    expect(p[2]).toBeCloseTo(FIBER_LIFT, 5);
    expect(p[p.length - 1]).toBeCloseTo(FIBER_LIFT, 5);
  });

  it("bulges smoothly between the lift floor and the max height", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    let maxZ = 0;
    for (let i = 2; i < p.length; i += 3) {
      expect(p[i]).toBeGreaterThanOrEqual(FIBER_LIFT - 1e-6);
      maxZ = Math.max(maxZ, p[i]);
    }
    expect(maxZ).toBeGreaterThan(FIBER_LIFT + BULGE_MIN * 0.9);
    expect(maxZ).toBeLessThanOrEqual(FIBER_LIFT + BULGE_MAX + 1e-6);
  });

  it("is deterministic", () => {
    const a = fiberWorldPoints(fiber, 0, layout);
    const b = fiberWorldPoints(fiber, 0, layout);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("maps the first path point into the frame's panel (y flipped)", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    const o = frameOrigin(layout, 0);
    expect(p[0]).toBeCloseTo(
      o.x + layout.border + fiber.path[0].x * layout.panelSize,
      5,
    );
    expect(p[1]).toBeCloseTo(
      o.y - layout.border - fiber.path[0].y * layout.panelSize,
      5,
    );
  });
});
