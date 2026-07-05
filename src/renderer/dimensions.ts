import type { Point } from "@/engine/types";
import { frameRect, type WallLayout } from "./viewport";

/** One blueprint dimension line in canvas px, plus its printed label. */
export interface DimSegment {
  a: Point;
  b: Point;
  orientation: "horizontal" | "vertical";
  label: string;
  /** Board-edge coordinate (y for horizontal, x for vertical) that extension lines reach toward. */
  edge: number;
}

export interface DimensionCm {
  frameSizeCm: number;
  frameGapCm: number;
  boardPaddingCm: number;
}

/** Screen-px offsets from the board edge, fixed regardless of zoom so labels stay readable. */
export const DIM_NEAR_OFFSET = 18;
export const DIM_FAR_OFFSET = 40;

/**
 * Segments in fixed order: total width (far row above the board), total
 * height (left of the board), then the near row above the board reading
 * left-to-right across the first frame: board padding, frame size, frame
 * gap. Zero-valued padding/gap segments (and the gap on a 1×1 grid) are
 * skipped.
 */
export function computeDimensionSegments(
  layout: WallLayout,
  cm: DimensionCm,
): DimSegment[] {
  const { boardX, boardY, boardSize, gridSize } = layout;
  const totalCm =
    gridSize * cm.frameSizeCm +
    (gridSize - 1) * cm.frameGapCm +
    2 * cm.boardPaddingCm;
  const nearY = boardY - DIM_NEAR_OFFSET;
  const farY = boardY - DIM_FAR_OFFSET;
  const leftX = boardX - DIM_NEAR_OFFSET;
  const first = frameRect(layout, 0);

  const segments: DimSegment[] = [
    {
      a: { x: boardX, y: farY },
      b: { x: boardX + boardSize, y: farY },
      orientation: "horizontal",
      label: `${totalCm} cm`,
      edge: boardY,
    },
    {
      a: { x: leftX, y: boardY },
      b: { x: leftX, y: boardY + boardSize },
      orientation: "vertical",
      label: `${totalCm} cm`,
      edge: boardX,
    },
  ];

  if (cm.boardPaddingCm > 0) {
    segments.push({
      a: { x: boardX, y: nearY },
      b: { x: first.x, y: nearY },
      orientation: "horizontal",
      label: `${cm.boardPaddingCm} cm`,
      edge: boardY,
    });
  }

  segments.push({
    a: { x: first.x, y: nearY },
    b: { x: first.x + first.size, y: nearY },
    orientation: "horizontal",
    label: `${cm.frameSizeCm} cm`,
    edge: boardY,
  });

  if (gridSize > 1 && cm.frameGapCm > 0) {
    const second = frameRect(layout, 1);
    segments.push({
      a: { x: first.x + first.size, y: nearY },
      b: { x: second.x, y: nearY },
      orientation: "horizontal",
      label: `${cm.frameGapCm} cm`,
      edge: boardY,
    });
  }

  return segments;
}
