import { ledColor } from "./animation";
import type { Palette } from "./palettes";
import type { AnimationId, Fiber, Led, LedLight, RGB } from "./types";

/** Seconds of color travel delay per unit of fibre length (design reference). */
export const TRAVEL = 1.15;
/** Exponential brightness fall-off from an LED into the fibre. */
export const DECAY = 1.95;
/** Segments dimmer than this (sum of both contributions) are not drawn. */
export const MIN_SEGMENT_INTENSITY = 0.05;

export interface SegmentLight {
  color: RGB;
  /** 0–1, before the user brightness multiplier */
  intensity: number;
  visible: boolean;
}

/** Time at which a fiber point "sees" an LED `distance` away along the fiber. */
export function delayedTime(time: number, distance: number): number {
  return time - distance * TRAVEL;
}

/**
 * Light at normalized position `um` (0 = start LED, 1 = end LED) of a passive
 * fiber fed from both ends. Each LED's contribution decays exponentially with
 * distance; colors blend weighted by contribution.
 */
export function blendSegment(
  start: LedLight,
  end: LedLight,
  um: number,
): SegmentLight {
  const iA = start.brightness * Math.exp(-um * DECAY);
  const iB = end.brightness * Math.exp(-(1 - um) * DECAY);
  const total = iA + iB;
  if (total <= MIN_SEGMENT_INTENSITY) {
    return { color: [0, 0, 0], intensity: 0, visible: false };
  }
  const color: RGB = [
    (start.color[0] * iA + end.color[0] * iB) / total,
    (start.color[1] * iA + end.color[1] * iB) / total,
    (start.color[2] * iA + end.color[2] * iB) / total,
  ];
  return { color, intensity: Math.min(1, total), visible: true };
}

/**
 * Light along a passive fibre at time `time`: one SegmentLight per polyline
 * segment (path.length - 1 entries), each sampled at the segment midpoint
 * `um = (i - 0.5) / (path.length - 1)` from both delayed LED ends.
 * Shared by the 2D and 3D renderers so segment colors never drift.
 */
export function fiberSegmentLights(
  fiber: Fiber,
  startLed: Led,
  endLed: Led,
  gpos: number,
  time: number,
  anim: AnimationId,
  speed: number,
  palette: Palette,
): SegmentLight[] {
  const n = fiber.path.length;
  const segs: SegmentLight[] = [];
  for (let i = 1; i < n; i++) {
    const um = (i - 0.5) / (n - 1);
    const lightA = ledColor(
      startLed,
      gpos,
      delayedTime(time, um * fiber.length),
      anim,
      speed,
      palette,
    );
    const lightB = ledColor(
      endLed,
      gpos,
      delayedTime(time, (1 - um) * fiber.length),
      anim,
      speed,
      palette,
    );
    segs.push(blendSegment(lightA, lightB, um));
  }
  return segs;
}
