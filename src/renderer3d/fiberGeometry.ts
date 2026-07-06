import * as THREE from "three";
import { hash } from "@/engine/random";
import type { Fiber } from "@/engine/types";

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
  /** Bezel width, cm — derived from the frame width setting. */
  border: number;
  /** Inner light-panel edge (fibres live here), cm. */
  panelSize: number;
  /** Outer (bezel) corner radius, cm. */
  outerRadius: number;
  /** Inner (light-panel) corner radius, cm — concentric with the outer. */
  innerRadius: number;
  /** Frame standoff from the board face, cm. */
  frameOffset: number;
}

export function computeWorldLayout(
  gridSize: number,
  frameSize: number,
  frameGapMm: number,
  boardPadding: number,
  frameWidthMm: number,
  cornerRadiusMm: number,
  frameOffsetCm: number,
): WorldLayout {
  const gapCm = frameGapMm / 10;
  const boardSize =
    gridSize * frameSize + (gridSize - 1) * gapCm + 2 * boardPadding;
  const border = frameWidthMm / 10;
  const panelSize = frameSize - 2 * border;
  const outerRadius = Math.min(cornerRadiusMm / 10, frameSize / 2);
  const innerRadius = Math.max(
    0,
    Math.min(outerRadius - border, panelSize / 2),
  );
  return {
    gridSize,
    frameSize,
    gapCm,
    boardPadding,
    boardSize,
    border,
    panelSize,
    outerRadius,
    innerRadius,
    frameOffset: frameOffsetCm,
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
 * Closed rounded-rectangle polygon in the frame's y-down convention: top-left
 * corner at (x0, y0), extending to (x0+w, y0-h). Built clockwise (TL→TR→BR→BL,
 * negative signed area — the winding ExtrudeGeometry needs for the outer
 * contour); reversed for the counter-clockwise hole. r is clamped to half the
 * shorter side; r=0 yields the four sharp corners.
 */
export function roundedRectPoints(
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  clockwise: boolean,
  cornerSegments = 6,
): THREE.Vector2[] {
  const l = x0;
  const rt = x0 + w;
  const t = y0;
  const b = y0 - h;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  let pts: THREE.Vector2[];
  if (rr === 0) {
    pts = [
      new THREE.Vector2(l, t),
      new THREE.Vector2(rt, t),
      new THREE.Vector2(rt, b),
      new THREE.Vector2(l, b),
    ];
  } else {
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      const out: THREE.Vector2[] = [];
      for (let i = 0; i <= cornerSegments; i++) {
        const a = a0 + ((a1 - a0) * i) / cornerSegments;
        out.push(
          new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)),
        );
      }
      return out;
    };
    const H = Math.PI / 2;
    pts = [
      ...arc(rt - rr, t - rr, H, 0), // TR corner: 90°→0°
      ...arc(rt - rr, b + rr, 0, -H), // BR corner: 0°→-90°
      ...arc(l + rr, b + rr, -H, -Math.PI), // BL corner: -90°→-180°
      ...arc(l + rr, t - rr, Math.PI, H), // TL corner: 180°→90°
    ];
  }
  return clockwise ? pts : pts.slice().reverse();
}

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
  const panel = layout.panelSize;
  const shape = new THREE.Shape(
    roundedRectPoints(0, 0, s, s, layout.outerRadius, true),
  );
  shape.holes.push(
    new THREE.Path(
      roundedRectPoints(b, -b, panel, panel, layout.innerRadius, false),
    ),
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
    out[i * 3 + 2] =
      layout.frameOffset + FIBER_SOCKET_Z + h * Math.sin(Math.PI * s) ** 1.5;
  }
  return out;
}
