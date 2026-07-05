import { hash } from "@/engine/random";
import type { Fiber } from "@/engine/types";
import { FRAME_BEZEL_RATIO } from "@/renderer/wallRenderer";

/**
 * World-space wall layout in centimetres. The board is centered at the world
 * origin in the x–y plane: +x right, +y up (frame rows step downward, so the
 * engine's screen-space y is flipped), +z toward the viewer.
 */
export interface WorldLayout {
  gridSize: number;
  /** Outer frame edge, cm. */
  frameSize: number;
  /** Inter-frame gap, cm (converted from the snapshot's millimetres). */
  gapCm: number;
  /** Padding between the frame grid and the board edge, cm. */
  boardPadding: number;
  /** Full board edge length, cm. */
  boardSize: number;
  /** Bezel width, cm — same FRAME_BEZEL_RATIO inset as the 2D renderer. */
  border: number;
  /** Inner light-panel edge (fibres live here), cm. */
  panelSize: number;
}

export function computeWorldLayout(
  gridSize: number,
  frameSize: number,
  frameGapMm: number,
  boardPadding: number,
): WorldLayout {
  const gapCm = frameGapMm / 10;
  const boardSize =
    gridSize * frameSize + (gridSize - 1) * gapCm + 2 * boardPadding;
  const border = frameSize * FRAME_BEZEL_RATIO;
  return {
    gridSize,
    frameSize,
    gapCm,
    boardPadding,
    boardSize,
    border,
    panelSize: frameSize - 2 * border,
  };
}

/** Outer top-left corner of frame `index` in world cm. */
export function frameOrigin(
  layout: WorldLayout,
  index: number,
): { x: number; y: number } {
  const gx = index % layout.gridSize;
  const gy = Math.floor(index / layout.gridSize);
  return {
    x:
      -layout.boardSize / 2 +
      layout.boardPadding +
      gx * (layout.frameSize + layout.gapCm),
    y:
      layout.boardSize / 2 -
      layout.boardPadding -
      gy * (layout.frameSize + layout.gapCm),
  };
}

/** Base clearance between the board face and every fibre centreline, cm. */
export const FIBER_LIFT = 0.15;
/** Deterministic per-fibre bulge height range, cm. */
export const BULGE_MIN = 0.5;
export const BULGE_MAX = 2.5;

/**
 * Deterministic bulge height. Uses the stateless hash — never the engine's
 * seeded RNG streams — so the persistence contract is untouched and the same
 * saved wall always bows the same way.
 */
export function bulgeHeight(frameIndex: number, fiber: Fiber): number {
  return (
    BULGE_MIN +
    (BULGE_MAX - BULGE_MIN) *
      hash(frameIndex * 977 + fiber.startLedIndex * 31 + fiber.endLedIndex)
  );
}

/**
 * World-space xyz triplets for a fibre's path points. z is FIBER_LIFT plus a
 * smooth arclength-parameterized bump `h·sin(πs)^1.5`, pinned back to
 * FIBER_LIFT at both socket stubs.
 */
export function fiberWorldPoints(
  fiber: Fiber,
  frameIndex: number,
  layout: WorldLayout,
): Float32Array {
  const pts = fiber.path;
  const origin = frameOrigin(layout, frameIndex);
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) {
    cum[i] =
      cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const total = cum[pts.length - 1] || 1;
  const h = bulgeHeight(frameIndex, fiber);
  const out = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const s = cum[i] / total;
    out[i * 3] = origin.x + layout.border + pts[i].x * layout.panelSize;
    out[i * 3 + 1] = origin.y - layout.border - pts[i].y * layout.panelSize;
    out[i * 3 + 2] = FIBER_LIFT + h * Math.sin(Math.PI * s) ** 1.5;
  }
  return out;
}
