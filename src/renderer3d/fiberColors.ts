import type { SegmentLight } from "@/engine/light";
import { fiberSegmentLights } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, RGB } from "@/engine/types";
import { frameGradientPos } from "@/renderer/viewport";

/** Tube tessellation — must match the TubeGeometry built in wall3d.ts. */
export const RADIAL_SEGMENTS = 6;
export const TUBULAR_SEGMENTS = 37;
export const RINGS_PER_FIBER = TUBULAR_SEGMENTS + 1;
export const VERTS_PER_RING = RADIAL_SEGMENTS + 1;
export const VERTS_PER_FIBER = RINGS_PER_FIBER * VERTS_PER_RING;

/** Passive milky-strand floor so dark fibre reads as a physical strand. */
const PASSIVE_FLOOR = 0.02;
/** How much of the fibre's hueBase body tint shows when unlit. */
const PASSIVE_BODY = 0.06;

/**
 * One tube ring's color, 0–1 channels: passive strand tint plus injected
 * light scaled by user brightness. Culled segments keep the passive tint.
 */
export function ringColor(
  seg: SegmentLight,
  body: RGB,
  brightness: number,
): RGB {
  const lit = seg.visible ? seg.intensity * brightness : 0;
  return [
    PASSIVE_FLOOR + (body[0] / 255) * PASSIVE_BODY + (seg.color[0] / 255) * lit,
    PASSIVE_FLOOR + (body[1] / 255) * PASSIVE_BODY + (seg.color[1] / 255) * lit,
    PASSIVE_FLOOR + (body[2] / 255) * PASSIVE_BODY + (seg.color[2] / 255) * lit,
  ];
}

/**
 * Fill `target` with per-vertex tube colors for the whole wall, in the merged
 * geometry's order: frames in array order, each frame's fibres in order, each
 * fibre ring-major (TubeGeometry layout: RINGS_PER_FIBER rings of
 * VERTS_PER_RING vertices). Ring j takes the segment covering its arclength
 * fraction j/TUBULAR_SEGMENTS.
 */
export function writeWallFiberColors(
  target: Float32Array,
  frames: Frame[],
  gridSize: number,
  time: number,
  anim: AnimationId,
  speed: number,
  brightness: number,
  palette: Palette,
): void {
  let v = 0;
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    const gpos = frameGradientPos(f, gridSize);
    for (const fiber of frame.fibers) {
      const segs = fiberSegmentLights(
        fiber,
        frame.leds[fiber.startLedIndex],
        frame.leds[fiber.endLedIndex],
        gpos,
        time,
        anim,
        speed,
        palette,
      );
      const body = samplePalette(palette, fiber.hueBase);
      for (let j = 0; j < RINGS_PER_FIBER; j++) {
        const seg =
          segs[
            Math.min(
              segs.length - 1,
              Math.floor((j / TUBULAR_SEGMENTS) * segs.length),
            )
          ];
        const [r, g, b] = ringColor(seg, body, brightness);
        for (let k = 0; k < VERTS_PER_RING; k++) {
          target[v++] = r;
          target[v++] = g;
          target[v++] = b;
        }
      }
    }
  }
}
