import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
import {
  BEZEL_DEPTH,
  BULGE_MAX,
  BULGE_MIN,
  bezelGeometry,
  bulgeHeight,
  computeWorldLayout,
  FIBER_SOCKET_Z,
  fiberWorldPoints,
  frameOrigin,
} from "../fiberGeometry";

const frame = generateFrame(4242, DEFAULT_FIBER_STYLE);
// 2×2 grid, 25cm frames, 20mm gap, 4cm padding, 8mm width, 15mm radius, 2cm offset
const layout = computeWorldLayout(2, 25, 20, 4, 8, 15, 2);

describe("computeWorldLayout", () => {
  it("sizes the board from frames, gaps and padding", () => {
    expect(layout.boardSize).toBe(60);
    expect(layout.gapCm).toBe(2);
  });

  it("derives the border from frame width and the radii from corner radius", () => {
    expect(layout.border).toBeCloseTo(0.8, 6); // 8mm
    expect(layout.panelSize).toBeCloseTo(25 - 2 * 0.8, 6);
    expect(layout.outerRadius).toBeCloseTo(1.5, 6); // 15mm
    expect(layout.innerRadius).toBeCloseTo(0.7, 6); // 1.5 - 0.8
    expect(layout.frameOffset).toBe(2);
  });

  it("clamps the outer radius to half the frame edge", () => {
    const big = computeWorldLayout(1, 20, 0, 0, 8, 9999, 0);
    expect(big.outerRadius).toBeCloseTo(10, 6);
  });

  it("clamps the inner radius to zero when the border exceeds it", () => {
    const thick = computeWorldLayout(1, 20, 0, 0, 30, 5, 0);
    expect(thick.innerRadius).toBe(0);
  });

  it("handles a 1×1 grid with zero gap contribution", () => {
    const single = computeWorldLayout(1, 30, 20, 0, 8, 15, 2);
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

  it("pins z to the offset socket height at both ends", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    const socket = layout.frameOffset + FIBER_SOCKET_Z;
    expect(FIBER_SOCKET_Z).toBeCloseTo(BEZEL_DEPTH / 2, 6);
    expect(p[2]).toBeCloseTo(socket, 5);
    expect(p[p.length - 1]).toBeCloseTo(socket, 5);
  });

  it("bulges smoothly between the socket floor and the max height", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    const socket = layout.frameOffset + FIBER_SOCKET_Z;
    let maxZ = 0;
    for (let i = 2; i < p.length; i += 3) {
      expect(p[i]).toBeGreaterThanOrEqual(socket - 1e-6);
      maxZ = Math.max(maxZ, p[i]);
    }
    expect(maxZ).toBeGreaterThan(socket + BULGE_MIN * 0.9);
    expect(maxZ).toBeLessThanOrEqual(socket + BULGE_MAX + 1e-6);
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

describe("bezelGeometry", () => {
  const b = layout.border;
  const s = layout.frameSize;

  // The set of x-normal signs on the vertical side-wall triangles lying in
  // the plane x≈px (which way those faces point along x).
  function wallNormalXSigns(px: number): Set<number> {
    const geo = bezelGeometry(layout).toNonIndexed();
    const pos = geo.getAttribute("position");
    const a = new THREE.Vector3();
    const c = new THREE.Vector3();
    const d = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const ad = new THREE.Vector3();
    const n = new THREE.Vector3();
    const signs = new Set<number>();
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t);
      c.fromBufferAttribute(pos, t + 1);
      d.fromBufferAttribute(pos, t + 2);
      if (![a, c, d].every((v) => Math.abs(v.x - px) < 1e-3)) continue;
      n.crossVectors(ac.subVectors(c, a), ad.subVectors(d, a)).normalize();
      if (n.x > 0.5) signs.add(1);
      else if (n.x < -0.5) signs.add(-1);
    }
    return signs;
  }

  it("faces the inner (cavity-facing) wall toward the hole, not the material", () => {
    // Left inner wall sits at x = b; its visible face must point +x (into the
    // cavity). A same-wound hole would flip these to -x and cull the wall.
    expect(wallNormalXSigns(b)).toEqual(new Set([1]));
  });

  it("faces the outer wall outward", () => {
    // Left outer wall sits at x = 0; its visible face points -x (away from
    // the frame centre).
    expect(wallNormalXSigns(0)).toEqual(new Set([-1]));
  });

  it("extrudes toward the viewer to the bezel depth", () => {
    const geo = bezelGeometry(layout);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    expect(box?.min.z).toBeCloseTo(0, 6);
    expect(box?.max.z).toBeCloseTo(BEZEL_DEPTH, 6);
    // Outer edge spans the full frame; inner hole is inset by the border.
    expect(box?.max.x).toBeCloseTo(s, 6);
  });
});
