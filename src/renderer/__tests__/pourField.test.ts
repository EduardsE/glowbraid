import { describe, expect, it } from "vitest";
import {
  fbm,
  POUR_PALETTE_IDS,
  POUR_PALETTES,
  type PourPalette,
  renderPourRGBA,
  samplePourStops,
  valueNoise,
  warpPoint,
  worley,
} from "../pourField";

describe("valueNoise", () => {
  it("is deterministic for identical inputs", () => {
    expect(valueNoise(42, 1.37, 8.62)).toBe(valueNoise(42, 1.37, 8.62));
  });

  it("stays within [0, 1) over a sample grid", () => {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const n = valueNoise(7, x * 0.73, y * 0.51);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it("varies with the seed", () => {
    expect(valueNoise(1, 2.5, 3.5)).not.toBe(valueNoise(2, 2.5, 3.5));
  });

  it("is continuous: a tiny step changes the value only slightly", () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.317 + 0.05;
      const y = i * 0.211 + 0.05;
      const a = valueNoise(9, x, y);
      const b = valueNoise(9, x + 1e-3, y);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });
});

describe("fbm", () => {
  it("is deterministic and within [0, 1)", () => {
    const v = fbm(11, 3.2, 4.7, 4);
    expect(v).toBe(fbm(11, 3.2, 4.7, 4));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe("warpPoint", () => {
  it("is deterministic and displaces the input point", () => {
    const w = warpPoint(5, 1.5, 2.5);
    expect(w).toEqual(warpPoint(5, 1.5, 2.5));
    // Warp must actually move the point (marbling depends on it).
    expect(Math.hypot(w.x - 1.5, w.y - 2.5)).toBeGreaterThan(0.01);
  });
});

describe("worley", () => {
  it("returns 0 <= f1 <= f2 over a sample grid", () => {
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const { f1, f2 } = worley(3, x * 0.61, y * 0.43);
        expect(f1).toBeGreaterThanOrEqual(0);
        expect(f2).toBeGreaterThanOrEqual(f1);
      }
    }
  });
});

describe("POUR_PALETTES", () => {
  it("keys, ids, and POUR_PALETTE_IDS agree", () => {
    expect(Object.keys(POUR_PALETTES).sort()).toEqual(
      [...POUR_PALETTE_IDS].sort(),
    );
    for (const id of POUR_PALETTE_IDS) {
      expect(POUR_PALETTES[id].id).toBe(id);
      expect(POUR_PALETTES[id].stops.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("samplePourStops", () => {
  const pal: PourPalette = {
    id: "tidal",
    name: "Test",
    stops: [
      [0, 0, 0],
      [100, 100, 100],
      [200, 200, 200],
    ],
  };

  it("clamps to the first stop at t <= 0 and the last at t >= 1", () => {
    expect(samplePourStops(pal, -0.5)).toEqual([0, 0, 0]);
    expect(samplePourStops(pal, 1.5)).toEqual([200, 200, 200]);
  });

  it("interpolates midway between adjacent stops", () => {
    expect(samplePourStops(pal, 0.25)).toEqual([50, 50, 50]);
  });
});

describe("renderPourRGBA", () => {
  const SIZE = 32;

  it("same seed and palette produce a byte-identical buffer", () => {
    const a = renderPourRGBA(1234, POUR_PALETTES.tidal, SIZE, SIZE);
    const b = renderPourRGBA(1234, POUR_PALETTES.tidal, SIZE, SIZE);
    expect(a.pixels).toEqual(b.pixels);
    expect(a.averageLuminance).toBe(b.averageLuminance);
  });

  it("different seeds produce different buffers", () => {
    const a = renderPourRGBA(1, POUR_PALETTES.tidal, SIZE, SIZE);
    const b = renderPourRGBA(2, POUR_PALETTES.tidal, SIZE, SIZE);
    expect(a.pixels).not.toEqual(b.pixels);
  });

  it("buffer has RGBA length and is fully opaque", () => {
    const { pixels } = renderPourRGBA(7, POUR_PALETTES.magma, SIZE, SIZE);
    expect(pixels.length).toBe(SIZE * SIZE * 4);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });

  it("averageLuminance is in [0, 1] and tracks the palette", () => {
    const dark: PourPalette = {
      id: "tidal",
      name: "AllDark",
      stops: [
        [0, 0, 0],
        [10, 10, 10],
        [20, 20, 20],
        [30, 30, 30],
      ],
    };
    const light: PourPalette = {
      id: "tidal",
      name: "AllLight",
      stops: [
        [225, 225, 225],
        [235, 235, 235],
        [245, 245, 245],
        [255, 255, 255],
      ],
    };
    const d = renderPourRGBA(5, dark, SIZE, SIZE).averageLuminance;
    const l = renderPourRGBA(5, light, SIZE, SIZE).averageLuminance;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
    expect(d).toBeLessThan(0.3);
    expect(l).toBeGreaterThan(0.7);
  });
});
