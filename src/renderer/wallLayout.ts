/**
 * World-space wall layout in centimetres. The board is centered at the world
 * origin in the x–y plane: +x right, +y up (frame rows step downward, so the
 * engine's screen-space y is flipped), +z toward the viewer.
 *
 * Pure math, three-free on purpose: the React shell reads it for dimensions
 * without pulling three.js out of the lazy 3D chunk.
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
  // Clamp to half the frame size: a stale frameWidth left over from before
  // frameSize was decreased must not push panelSize (frameSize - 2*border)
  // negative, which would produce an inverted panel and an oversized 3D hole.
  const border = Math.min(frameWidthMm / 10, frameSize / 2);
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

/**
 * World-space centre and edge length of frame `index`'s full square (bezel +
 * light panel), for positioning an invisible pick-plane. Mirrors the y-down
 * convention: `frameOrigin` gives the outer top-left, so the centre is half a
 * frame right and half a frame *down* (−y).
 */
export function frameSquarePlane(
  layout: WorldLayout,
  index: number,
): { cx: number; cy: number; size: number } {
  const o = frameOrigin(layout, index);
  const half = layout.frameSize / 2;
  return { cx: o.x + half, cy: o.y - half, size: layout.frameSize };
}

/** Bezel extrusion depth off the board face, cm. */
export const BEZEL_DEPTH = 2;
