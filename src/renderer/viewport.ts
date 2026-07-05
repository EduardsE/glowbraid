import type { Point } from "@/engine/types";

export interface ViewportInput {
  gridSize: number;
  frameSize: number;
  frameGap: number;
  boardPadding: number;
  zoom: number;
  pan: Point;
  canvasWidth: number;
  canvasHeight: number;
}

export interface WallLayout {
  gap: number;
  scale: number;
  tx: number;
  ty: number;
  frameSize: number;
  gridSize: number;
  boardX: number;
  boardY: number;
  boardSize: number;
}

/** Board (frame grid + padding) fills 82% of the canvas at zoom 1, centered plus pan offset. */
export function computeWallLayout(input: ViewportInput): WallLayout {
  const {
    gridSize,
    frameSize,
    frameGap,
    boardPadding,
    zoom,
    pan,
    canvasWidth,
    canvasHeight,
  } = input;
  const wall = gridSize * frameSize + (gridSize - 1) * frameGap;
  const boardExtent = wall + 2 * boardPadding;
  const base = Math.min(
    (canvasWidth * 0.82) / boardExtent,
    (canvasHeight * 0.82) / boardExtent,
  );
  const scale = base * zoom;
  const boardX = canvasWidth / 2 + pan.x - (scale * boardExtent) / 2;
  const boardY = canvasHeight / 2 + pan.y - (scale * boardExtent) / 2;
  return {
    gap: frameGap,
    scale,
    frameSize,
    gridSize,
    tx: boardX + scale * boardPadding,
    ty: boardY + scale * boardPadding,
    boardX,
    boardY,
    boardSize: scale * boardExtent,
  };
}

export interface FrameRect {
  x: number;
  y: number;
  size: number;
}

export function frameRect(layout: WallLayout, index: number): FrameRect {
  const gx = index % layout.gridSize;
  const gy = Math.floor(index / layout.gridSize);
  return {
    x: layout.tx + gx * (layout.frameSize + layout.gap) * layout.scale,
    y: layout.ty + gy * (layout.frameSize + layout.gap) * layout.scale,
    size: layout.frameSize * layout.scale,
  };
}

/** Diagonal position gradient of a frame across the wall, 0–1 (drives gradient/sparkle). */
export function frameGradientPos(index: number, gridSize: number): number {
  const gd = Math.max(1, gridSize - 1);
  const gx = index % gridSize;
  const gy = Math.floor(index / gridSize);
  return (gx + gy) / (2 * gd);
}

export function pickFrame(
  layout: WallLayout,
  frameCount: number,
  mx: number,
  my: number,
): number | null {
  for (let index = 0; index < frameCount; index++) {
    const rect = frameRect(layout, index);
    if (
      mx >= rect.x &&
      mx <= rect.x + rect.size &&
      my >= rect.y &&
      my <= rect.y + rect.size
    ) {
      return index;
    }
  }
  return null;
}
