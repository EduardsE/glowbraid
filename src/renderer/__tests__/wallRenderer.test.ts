import { describe, expect, it } from "vitest";
import { computeWallLayout, frameRect } from "../viewport";
import {
  FRAME_BEZEL_RATIO,
  frameCornerRadii,
  frameGeometry,
  shadeForSim,
} from "../wallRenderer";

describe("frameGeometry", () => {
  it("bezel occupies exactly the passed-in rect (no outward bleed)", () => {
    const g = frameGeometry(10, 20, 100);
    expect(g.outerX).toBe(10);
    expect(g.outerY).toBe(20);
    expect(g.outerSize).toBe(100);
  });

  it("insets the light panel inward by the bezel border thickness", () => {
    const g = frameGeometry(10, 20, 100);
    const border = 100 * FRAME_BEZEL_RATIO;
    expect(g.border).toBeCloseTo(border);
    expect(g.panelX).toBeCloseTo(10 + border);
    expect(g.panelY).toBeCloseTo(20 + border);
    expect(g.panelSize).toBeCloseTo(100 - 2 * border);
  });

  it("adjacent frames with zero grid gap touch without their bezels overlapping", () => {
    const layout = computeWallLayout({
      gridSize: 2,
      frameSize: 200,
      frameGap: 0,
      boardPadding: 0,
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasWidth: 1000,
      canvasHeight: 800,
    });
    const a = frameRect(layout, 0);
    const b = frameRect(layout, 1);
    const ga = frameGeometry(a.x, a.y, a.size);
    const gb = frameGeometry(b.x, b.y, b.size);
    // Outer bezel edges meet exactly — no gap, no overlap.
    expect(ga.outerX + ga.outerSize).toBeCloseTo(gb.outerX);
  });
});

describe("frameGeometry with explicit border", () => {
  it("insets the panel by the passed border instead of the default ratio", () => {
    const g = frameGeometry(10, 20, 100, 12);
    expect(g.border).toBe(12);
    expect(g.panelX).toBe(22);
    expect(g.panelSize).toBe(76);
  });
});

describe("frameCornerRadii", () => {
  // 25cm frame drawn at 250px → 10px per cm → 1px per mm.
  it("converts mm to px at the frame's on-screen scale", () => {
    const r = frameCornerRadii(15, 8, 25, 250);
    expect(r.borderPx).toBeCloseTo(8);
    expect(r.outerPx).toBeCloseTo(15);
    expect(r.innerPx).toBeCloseTo(7); // 15 - 8
  });

  it("clamps the inner radius to zero when the border exceeds the outer radius", () => {
    const r = frameCornerRadii(5, 20, 25, 250);
    expect(r.innerPx).toBe(0);
  });

  it("clamps the outer radius to half the frame edge", () => {
    const r = frameCornerRadii(9999, 8, 25, 250);
    expect(r.outerPx).toBe(125);
  });

  it("clamps the border to half the frame edge so the panel never goes negative", () => {
    const r = frameCornerRadii(15, 999, 25, 250);
    expect(r.borderPx).toBe(125);
    expect(250 - 2 * r.borderPx).toBeGreaterThanOrEqual(0);
    expect(r.innerPx).toBeGreaterThanOrEqual(0);
  });
});

describe("shadeForSim", () => {
  it("scales each RGB channel to ~80%, approximating the app's edit→sim darkening", () => {
    expect(shadeForSim("#181a20")).toBe("#13151a");
  });

  it("scales white down without any channel overflowing", () => {
    expect(shadeForSim("#ffffff")).toBe("#cccccc");
  });

  it("leaves black unchanged", () => {
    expect(shadeForSim("#000000")).toBe("#000000");
  });
});
