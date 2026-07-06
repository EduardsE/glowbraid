import * as THREE from "three";
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

/** Bezel extrusion depth off the board face, cm. */
export const BEZEL_DEPTH = 2;
/**
 * Fibre socket height off the board face, cm — fibres enter through the
 * bezel's inner wall at its mid-depth, where the LED strips sit.
 */
export const FIBER_SOCKET_Z = BEZEL_DEPTH / 2;
/**
 * Square bezel ring (outer frame minus the light-panel hole) extruded toward
 * the viewer. The outer contour is wound clockwise and the hole
 * counter-clockwise: THREE.ExtrudeGeometry only normalizes hole winding when
 * the outer contour is *not* clockwise, so a same-wound hole leaves the inner
 * (cavity-facing) wall with inverted normals and it gets back-face culled —
 * the frame then looks hollow, with no visible inner wall.
 */
export function bezelGeometry(layout: WorldLayout): THREE.ExtrudeGeometry {
  const s = layout.frameSize;
  const b = layout.border;
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(s, 0),
    new THREE.Vector2(s, -s),
    new THREE.Vector2(0, -s),
  ]);
  shape.holes.push(
    new THREE.Path([
      new THREE.Vector2(b, -b),
      new THREE.Vector2(b, -(s - b)),
      new THREE.Vector2(s - b, -(s - b)),
      new THREE.Vector2(s - b, -b),
    ]),
  );
  return new THREE.ExtrudeGeometry(shape, {
    depth: BEZEL_DEPTH,
    bevelEnabled: false,
  });
}

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
 * World-space xyz triplets for a fibre's path points. z is FIBER_SOCKET_Z
 * plus a smooth arclength-parameterized bump `h·sin(πs)^1.5`, pinned back to
 * FIBER_SOCKET_Z at both socket stubs so the ends meet the bezel wall at
 * LED-strip height.
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
    out[i * 3 + 2] = FIBER_SOCKET_Z + h * Math.sin(Math.PI * s) ** 1.5;
  }
  return out;
}
