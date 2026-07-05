import { describe, expect, it } from "vitest";
import { computeWallLayout, frameRect } from "../viewport";
import { FRAME_BEZEL_RATIO, frameGeometry, shadeForSim } from "../wallRenderer";

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
