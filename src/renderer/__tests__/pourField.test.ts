import { describe, expect, it } from "vitest";
import { fbm, valueNoise, warpPoint, worley } from "../pourField";

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
