import { describe, expect, it } from "vitest";
import { ledColor } from "../animation";
import { DEFAULT_FIBER_STYLE, generateFrame } from "../fibers";
import {
  blendSegment,
  delayedTime,
  fiberSegmentLights,
  TRAVEL,
} from "../light";
import { PALETTES } from "../palettes";
import type { LedLight } from "../types";

const red: LedLight = { color: [255, 0, 0], brightness: 1 };
const blue: LedLight = { color: [0, 0, 255], brightness: 1 };
const dark: LedLight = { color: [255, 255, 255], brightness: 0 };

describe("blendSegment", () => {
  it("blends toward purple at the midpoint of a red↔blue fiber", () => {
    const mid = blendSegment(red, blue, 0.5);
    expect(mid.visible).toBe(true);
    expect(mid.color[0]).toBeGreaterThan(0);
    expect(mid.color[2]).toBeGreaterThan(0);
    expect(mid.color[0]).toBeCloseTo(mid.color[2], 6);
    expect(mid.color[1]).toBeCloseTo(0, 6);
  });

  it("is dominated by the nearer LED", () => {
    const nearRed = blendSegment(red, blue, 0.1);
    expect(nearRed.color[0]).toBeGreaterThan(nearRed.color[2]);
    const nearBlue = blendSegment(red, blue, 0.9);
    expect(nearBlue.color[2]).toBeGreaterThan(nearBlue.color[0]);
  });

  it("intensity is higher near an endpoint than at the midpoint", () => {
    expect(blendSegment(red, blue, 0.05).intensity).toBeGreaterThan(
      blendSegment(red, blue, 0.5).intensity,
    );
  });

  it("fades monotonically toward a dark end", () => {
    let prev = Number.POSITIVE_INFINITY;
    for (const um of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const seg = blendSegment(red, dark, um);
      expect(seg.intensity).toBeLessThan(prev);
      prev = seg.intensity;
    }
  });

  it("reports invisible when both ends are off", () => {
    const seg = blendSegment(dark, dark, 0.5);
    expect(seg.visible).toBe(false);
    expect(seg.intensity).toBe(0);
  });

  it("clamps intensity to 1", () => {
    expect(blendSegment(red, blue, 0.02).intensity).toBeLessThanOrEqual(1);
  });
});

describe("delayedTime", () => {
  it("subtracts travel delay proportional to distance", () => {
    expect(delayedTime(10, 2)).toBeCloseTo(10 - 2 * TRAVEL, 10);
    expect(delayedTime(0, 1)).toBeCloseTo(-TRAVEL, 10);
  });
});

describe("fiberSegmentLights", () => {
  const frame = generateFrame(1234, DEFAULT_FIBER_STYLE);
  const palette = PALETTES.sunset;

  it("matches the per-segment blend of both delayed LED ends", () => {
    const fiber = frame.fibers[0];
    const ledA = frame.leds[fiber.startLedIndex];
    const ledB = frame.leds[fiber.endLedIndex];
    const time = 3.2;
    const gpos = 0.25;
    const speed = 1.4;
    const segs = fiberSegmentLights(
      fiber,
      ledA,
      ledB,
      gpos,
      time,
      "flow",
      speed,
      palette,
    );
    const n = fiber.path.length;
    expect(segs).toHaveLength(n - 1);
    for (const i of [1, 9, n - 1]) {
      const um = (i - 0.5) / (n - 1);
      const expected = blendSegment(
        ledColor(
          ledA,
          gpos,
          delayedTime(time, um * fiber.length),
          "flow",
          speed,
          palette,
        ),
        ledColor(
          ledB,
          gpos,
          delayedTime(time, (1 - um) * fiber.length),
          "flow",
          speed,
          palette,
        ),
        um,
      );
      expect(segs[i - 1]).toEqual(expected);
    }
  });

  it("is deterministic", () => {
    const fiber = frame.fibers[3];
    const ledA = frame.leds[fiber.startLedIndex];
    const ledB = frame.leds[fiber.endLedIndex];
    const a = fiberSegmentLights(
      fiber,
      ledA,
      ledB,
      0.5,
      7.7,
      "pulse",
      1,
      palette,
    );
    const b = fiberSegmentLights(
      fiber,
      ledA,
      ledB,
      0.5,
      7.7,
      "pulse",
      1,
      palette,
    );
    expect(a).toEqual(b);
  });
});
