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
  frameGapMm: number;
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
      label: `${cm.frameGapMm} mm`,
      edge: boardY,
    });
  }

  return segments;
}

const DIM_STROKE = "rgba(140, 180, 220, 0.5)";
const DIM_TEXT = "rgba(140, 180, 220, 0.9)";
const DIM_FONT = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
const TICK = 4;
/** Extension lines stop this far short of the measured edge. */
const EXT_GAP = 2;

export function drawDimensions(
  ctx: CanvasRenderingContext2D,
  segments: DimSegment[],
): void {
  ctx.save();
  ctx.strokeStyle = DIM_STROKE;
  ctx.fillStyle = DIM_TEXT;
  ctx.lineWidth = 1;
  ctx.font = DIM_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const seg of segments) {
    const mx = (seg.a.x + seg.b.x) / 2;
    const my = (seg.a.y + seg.b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
    if (seg.orientation === "horizontal") {
      // End ticks + extension lines toward the board edge.
      for (const x of [seg.a.x, seg.b.x]) {
        ctx.moveTo(x, seg.a.y - TICK);
        ctx.lineTo(x, seg.a.y + TICK);
        ctx.moveTo(x, seg.a.y + TICK);
        ctx.lineTo(x, seg.edge - EXT_GAP);
      }
      ctx.stroke();
      ctx.fillText(seg.label, mx, seg.a.y - 7);
    } else {
      for (const y of [seg.a.y, seg.b.y]) {
        ctx.moveTo(seg.a.x - TICK, y);
        ctx.lineTo(seg.a.x + TICK, y);
        ctx.moveTo(seg.a.x + TICK, y);
        ctx.lineTo(seg.edge - EXT_GAP, y);
      }
      ctx.stroke();
      ctx.save();
      ctx.translate(seg.a.x - 7, my);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(seg.label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
