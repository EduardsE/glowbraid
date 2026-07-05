import { describe, expect, it } from "vitest";
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
import type { SegmentLight } from "@/engine/light";
import { fiberSegmentLights } from "@/engine/light";
import { PALETTES, samplePalette } from "@/engine/palettes";
import type { RGB } from "@/engine/types";
import { frameGradientPos } from "@/renderer/viewport";
import {
  ringColor,
  TUBULAR_SEGMENTS,
  VERTS_PER_FIBER,
  VERTS_PER_RING,
  writeWallFiberColors,
} from "../fiberColors";

const frame = generateFrame(9001, DEFAULT_FIBER_STYLE);
const palette = PALETTES.neon;

describe("ringColor", () => {
  it("adds injected light on top of the passive strand tint", () => {
    const seg: SegmentLight = {
      color: [255, 0, 0],
      intensity: 0.5,
      visible: true,
    };
    const body: RGB = [0, 0, 255];
    const c = ringColor(seg, body, 1);
    expect(c[0]).toBeCloseTo(0.02 + 0 + 0.5, 6);
    expect(c[1]).toBeCloseTo(0.02, 6);
    expect(c[2]).toBeCloseTo(0.02 + 0.06, 6);
  });

  it("keeps culled segments at the passive tint, not black", () => {
    const seg: SegmentLight = {
      color: [0, 0, 0],
      intensity: 0,
      visible: false,
    };
    const c = ringColor(seg, [255, 255, 255], 1);
    expect(c[0]).toBeCloseTo(0.08, 6);
    expect(c[0]).toBeGreaterThan(0);
  });

  it("scales the light term with user brightness", () => {
    const seg: SegmentLight = {
      color: [255, 255, 255],
      intensity: 1,
      visible: true,
    };
    const bright = ringColor(seg, [0, 0, 0], 1);
    const dim = ringColor(seg, [0, 0, 0], 0.5);
    expect(bright[0]).toBeCloseTo(0.02 + 1, 6);
    expect(dim[0]).toBeCloseTo(0.02 + 0.5, 6);
  });
});

describe("writeWallFiberColors", () => {
  const frames = [frame];
  const size = frames.length * frame.fibers.length * VERTS_PER_FIBER * 3;

  it("writes one identical color per tube ring, matching the shared pipeline", () => {
    const target = new Float32Array(size);
    writeWallFiberColors(target, frames, 1, 2.5, "flow", 1, 0.9, palette);
    const fiber = frame.fibers[0];
    const segs = fiberSegmentLights(
      fiber,
      frame.leds[fiber.startLedIndex],
      frame.leds[fiber.endLedIndex],
      frameGradientPos(0, 1),
      2.5,
      "flow",
      1,
      palette,
    );
    const body = samplePalette(palette, fiber.hueBase);
    const j = 5; // an arbitrary ring of fibre 0
    const segIndex = Math.min(
      segs.length - 1,
      Math.floor((j / TUBULAR_SEGMENTS) * segs.length),
    );
    const expected = ringColor(segs[segIndex], body, 0.9);
    const base = j * VERTS_PER_RING * 3;
    for (let k = 0; k < VERTS_PER_RING; k++) {
      expect(target[base + k * 3]).toBeCloseTo(expected[0], 6);
      expect(target[base + k * 3 + 1]).toBeCloseTo(expected[1], 6);
      expect(target[base + k * 3 + 2]).toBeCloseTo(expected[2], 6);
    }
  });

  it("fills the whole buffer with finite positive values", () => {
    const target = new Float32Array(size);
    writeWallFiberColors(target, frames, 1, 0, "rainbow", 1, 1, palette);
    for (const v of target) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("leaves only the passive tint at zero user brightness", () => {
    const target = new Float32Array(size);
    writeWallFiberColors(target, frames, 1, 2.5, "flow", 1, 0, palette);
    for (const v of target) {
      expect(v).toBeGreaterThanOrEqual(0.02 - 1e-6);
      expect(v).toBeLessThanOrEqual(0.08 + 1e-6);
    }
  });
});
