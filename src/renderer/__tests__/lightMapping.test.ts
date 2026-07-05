import { describe, expect, it } from "vitest";
import { MIN_SEGMENT_INTENSITY } from "@/engine/light";
import {
  boostSaturation,
  floorIntensity,
  INTENSITY_FLOOR,
  lightBoardFactor,
  relativeLuminance,
} from "../lightMapping";

describe("relativeLuminance", () => {
  it("returns 0 for black", () => {
    expect(relativeLuminance("#000000")).toBe(0);
  });

  it("returns 1 for white", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("rates the default dark board as very dark", () => {
    // #101114 = rgb(16,17,20) → (0.2126·16 + 0.7152·17 + 0.0722·20)/255
    expect(relativeLuminance("#101114")).toBeCloseTo(0.0667, 3);
  });

  it("expands 3-digit hex (hand-edited saves)", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
  });

  it("fails safe to 0 (dark → current behaviour) on unparsable input", () => {
    expect(relativeLuminance("not-a-color")).toBe(0);
    expect(relativeLuminance("")).toBe(0);
  });
});

describe("lightBoardFactor", () => {
  it("is 0 on the default dark board and pure black", () => {
    expect(lightBoardFactor("#101114")).toBe(0);
    expect(lightBoardFactor("#000000")).toBe(0);
  });

  it("clamps to 1 on white and near-white boards", () => {
    expect(lightBoardFactor("#ffffff")).toBe(1);
    expect(lightBoardFactor("#f6f6f8")).toBe(1);
  });

  it("sits mid-ramp on a mid grey", () => {
    // #6b6b6b → L ≈ 0.4196 → (0.4196 − 0.22) / 0.4 ≈ 0.499
    expect(lightBoardFactor("#6b6b6b")).toBeCloseTo(0.5, 2);
  });
});

describe("floorIntensity", () => {
  it("maps 0 to the floor and 1 to 1", () => {
    expect(floorIntensity(0)).toBe(INTENSITY_FLOOR);
    expect(floorIntensity(1)).toBeCloseTo(1, 10);
  });

  it("clamps out-of-range input", () => {
    expect(floorIntensity(-0.5)).toBe(INTENSITY_FLOOR);
    expect(floorIntensity(2)).toBeCloseTo(1, 10);
  });

  it("is monotonic", () => {
    expect(floorIntensity(0.6)).toBeGreaterThan(floorIntensity(0.3));
  });

  it("stays continuous across the engine's segment-cull threshold", () => {
    // Culled segments draw at floorIntensity(0); a segment just above the
    // cull threshold must not visibly jump.
    const jump = floorIntensity(MIN_SEGMENT_INTENSITY) - floorIntensity(0);
    expect(jump).toBeGreaterThan(0);
    expect(jump).toBeLessThan(0.04);
  });
});

describe("boostSaturation", () => {
  it("is the identity at amount 0", () => {
    expect(boostSaturation([200, 100, 50], 0)).toEqual([200, 100, 50]);
  });

  it("leaves pure grey unchanged (all channels at the mean)", () => {
    expect(boostSaturation([128, 128, 128], 0.8)).toEqual([128, 128, 128]);
  });

  it("pushes channels apart and clamps to 0–255", () => {
    const [r, g, b] = boostSaturation([200, 100, 50], 0.8);
    expect(r).toBe(255); // 200 + (200 − 116.67)·0.8 ≈ 266.7 → clamped
    expect(g).toBeCloseTo(86.67, 1);
    expect(b).toBe(0); // 50 + (50 − 116.67)·0.8 ≈ −3.3 → clamped
  });

  it("keeps an already-saturated primary unchanged", () => {
    expect(boostSaturation([255, 0, 0], 0.8)).toEqual([255, 0, 0]);
  });
});
