import { describe, expect, it } from "vitest";
import { PALETTE_IDS, PALETTES, samplePalette } from "../palettes";

describe("PALETTES", () => {
  it("has the five palettes in display order", () => {
    expect(PALETTE_IDS).toEqual([
      "sunset",
      "neon",
      "aurora",
      "ember",
      "spectrum",
    ]);
    for (const id of PALETTE_IDS) {
      expect(PALETTES[id].id).toBe(id);
      expect(PALETTES[id].stops).toHaveLength(5);
    }
  });
});

describe("samplePalette", () => {
  const sunset = PALETTES.sunset;

  it("returns the first stop at u = 0", () => {
    expect(samplePalette(sunset, 0)).toEqual([255, 92, 140]);
  });

  it("returns exact stops at stop positions (5 stops → u = k/4)", () => {
    expect(samplePalette(sunset, 0.25)).toEqual([255, 150, 96]);
    expect(samplePalette(sunset, 0.5)).toEqual([255, 214, 138]);
  });

  it("interpolates linearly between stops", () => {
    const mid = samplePalette(sunset, 0.125); // halfway between stop 0 and 1
    expect(mid[0]).toBeCloseTo(255, 6);
    expect(mid[1]).toBeCloseTo((92 + 150) / 2, 6);
    expect(mid[2]).toBeCloseTo((140 + 96) / 2, 6);
  });

  it("wraps u outside [0, 1)", () => {
    expect(samplePalette(sunset, 1.25)).toEqual(samplePalette(sunset, 0.25));
    expect(samplePalette(sunset, -0.75)).toEqual(samplePalette(sunset, 0.25));
  });
});
