import { describe, expect, it } from "vitest";
import {
  boardOutline,
  type DimLine,
  dimensionLine,
  frameMarkerAnchor,
  frameOutline,
  measuredFrame,
  measuredOutlines,
  panelOutline,
} from "../dimensions";
import { BEZEL_DEPTH, computeWorldLayout, frameOrigin } from "../wallLayout";

const layout = computeWorldLayout(3, 25, 20, 4, 8, 15, 2);

function measured(d: DimLine): number {
  return Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1], d.b[2] - d.a[2]);
}

function mustLine(id: Parameters<typeof dimensionLine>[1]): DimLine {
  const d = dimensionLine(layout, id);
  if (!d) throw new Error(`no dimension for ${id}`);
  return d;
}

describe("dimensionLine", () => {
  it("spans the full board for the overall dimension, below the board", () => {
    const d = mustLine("overall");
    expect(d.b2[0] - d.a2[0]).toBeCloseTo(layout.boardSize);
    expect(d.a2[1]).toBeLessThan(-layout.boardSize / 2);
  });

  it("measures each setting at its real size", () => {
    expect(measured(mustLine("frameSize"))).toBeCloseTo(layout.frameSize);
    expect(measured(mustLine("frameGap"))).toBeCloseTo(layout.gapCm);
    expect(measured(mustLine("frameWidth"))).toBeCloseTo(layout.border);
    expect(measured(mustLine("cornerRadius"))).toBeCloseTo(layout.outerRadius);
    expect(measured(mustLine("frameOffset"))).toBeCloseTo(layout.frameOffset);
    const pad = mustLine("boardPadding");
    expect(pad.b2[0] - pad.a2[0]).toBeCloseTo(layout.boardPadding);
  });

  it("draws frame dimensions above the board's top edge", () => {
    for (const id of ["frameSize", "frameGap", "frameWidth"] as const) {
      const d = mustLine(id);
      expect(d.a2[1]).toBeGreaterThan(layout.boardSize / 2);
      expect(d.b2[1]).toBe(d.a2[1]);
    }
  });

  it("has no spacing to measure on a single-frame wall", () => {
    const single = computeWorldLayout(1, 25, 20, 4, 8, 15, 2);
    expect(dimensionLine(single, "frameGap")).toBeNull();
    expect(dimensionLine(single, "frameOffset")).not.toBeNull();
  });

  it("collapses the radius leader to the corner at radius 0", () => {
    const sharp = computeWorldLayout(2, 25, 20, 4, 8, 0, 2);
    const d = dimensionLine(sharp, "cornerRadius");
    expect(d?.kind).toBe("radius");
    expect(d?.a).toEqual(d?.b);
  });
});

describe("frameMarkerAnchor", () => {
  it("sits on the frame's front top-left corner", () => {
    const o = frameOrigin(layout, 4);
    expect(frameMarkerAnchor(layout, 4)).toEqual([
      o.x,
      o.y,
      layout.frameOffset + BEZEL_DEPTH,
    ]);
  });
});

describe("object outlines", () => {
  it("traces the board edge to edge", () => {
    const pts = boardOutline(layout);
    const h = layout.boardSize / 2;
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual([-h, h, 0]);
    expect(pts[2]).toEqual([h, -h, 0]);
  });

  it("keeps a frame outline inside the frame's square on its front face", () => {
    const o = frameOrigin(layout, 4);
    const pts = frameOutline(layout, 4);
    expect(pts.length).toBeGreaterThan(4);
    for (const [x, y, z] of pts) {
      expect(x).toBeGreaterThanOrEqual(o.x - 1e-9);
      expect(x).toBeLessThanOrEqual(o.x + layout.frameSize + 1e-9);
      expect(y).toBeLessThanOrEqual(o.y + 1e-9);
      expect(y).toBeGreaterThanOrEqual(o.y - layout.frameSize - 1e-9);
      expect(z).toBe(layout.frameOffset + BEZEL_DEPTH);
    }
  });

  it("falls back to four sharp corners at radius 0", () => {
    const sharp = computeWorldLayout(2, 25, 20, 4, 8, 0, 2);
    expect(frameOutline(sharp, 0)).toHaveLength(4);
  });

  it("draws both ends of every dimension: neighbour frame, bezel inner edge, frame back", () => {
    expect(measuredOutlines(layout, "frameSize")).toHaveLength(1);
    expect(measuredOutlines(layout, "frameGap")).toEqual([
      frameOutline(layout, 0),
      frameOutline(layout, 1),
    ]);
    expect(measuredOutlines(layout, "frameWidth")[1]).toEqual(
      panelOutline(layout, 0),
    );
    const back = measuredOutlines(layout, "frameOffset")[1];
    expect(back.every((p) => p[2] === layout.frameOffset)).toBe(true);
    const single = computeWorldLayout(1, 25, 20, 4, 8, 15, 2);
    expect(measuredOutlines(single, "frameGap")).toHaveLength(1);
  });

  it("insets the panel outline by the bezel width", () => {
    const o = frameOrigin(layout, 0);
    const xs = panelOutline(layout, 0).map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(o.x + layout.border);
    expect(Math.max(...xs)).toBeCloseTo(o.x + layout.frameSize - layout.border);
  });

  it("measures the standoff on the top-right frame, everything else on the top-left", () => {
    expect(measuredFrame(layout, "frameOffset")).toBe(layout.gridSize - 1);
    expect(measuredFrame(layout, "frameSize")).toBe(0);
  });
});
