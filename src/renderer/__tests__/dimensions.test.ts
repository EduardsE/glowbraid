import { describe, expect, it } from "vitest";
import {
  computeDimensionSegments,
  DIM_FAR_OFFSET,
  DIM_NEAR_OFFSET,
} from "../dimensions";
import { computeWallLayout, frameRect } from "../viewport";

const CM = { frameSizeCm: 25, frameGapCm: 2, boardPaddingCm: 4 };

function layoutFor(gridSize: number, cm = CM) {
  return computeWallLayout({
    gridSize,
    frameSize: cm.frameSizeCm,
    frameGap: cm.frameGapCm,
    boardPadding: cm.boardPaddingCm,
    zoom: 1,
    pan: { x: 0, y: 0 },
    canvasWidth: 1000,
    canvasHeight: 800,
  });
}

describe("computeDimensionSegments", () => {
  it("emits total width across the board on the far row", () => {
    const layout = layoutFor(3);
    const [totalW] = computeDimensionSegments(layout, CM);
    // 3*25 + 2*2 + 2*4 = 87
    expect(totalW.label).toBe("87 cm");
    expect(totalW.orientation).toBe("horizontal");
    expect(totalW.a.x).toBeCloseTo(layout.boardX);
    expect(totalW.b.x).toBeCloseTo(layout.boardX + layout.boardSize);
    expect(totalW.a.y).toBeCloseTo(layout.boardY - DIM_FAR_OFFSET);
    expect(totalW.b.y).toBeCloseTo(layout.boardY - DIM_FAR_OFFSET);
    expect(totalW.edge).toBeCloseTo(layout.boardY);
  });

  it("emits total height down the left side", () => {
    const layout = layoutFor(3);
    const [, totalH] = computeDimensionSegments(layout, CM);
    expect(totalH.label).toBe("87 cm");
    expect(totalH.orientation).toBe("vertical");
    expect(totalH.a.y).toBeCloseTo(layout.boardY);
    expect(totalH.b.y).toBeCloseTo(layout.boardY + layout.boardSize);
    expect(totalH.a.x).toBeCloseTo(layout.boardX - DIM_NEAR_OFFSET);
    expect(totalH.b.x).toBeCloseTo(layout.boardX - DIM_NEAR_OFFSET);
    expect(totalH.edge).toBeCloseTo(layout.boardX);
  });

  it("near row aligns padding, frame, and gap segments with the first frame", () => {
    const layout = layoutFor(3);
    const segments = computeDimensionSegments(layout, CM);
    expect(segments).toHaveLength(5);
    const [, , padding, frame, gap] = segments;
    const first = frameRect(layout, 0);
    const second = frameRect(layout, 1);
    const nearY = layout.boardY - DIM_NEAR_OFFSET;

    expect(padding.label).toBe("4 cm");
    expect(padding.a.x).toBeCloseTo(layout.boardX);
    expect(padding.b.x).toBeCloseTo(first.x);
    expect(padding.a.y).toBeCloseTo(nearY);

    expect(frame.label).toBe("25 cm");
    expect(frame.a.x).toBeCloseTo(first.x);
    expect(frame.b.x).toBeCloseTo(first.x + first.size);
    expect(frame.a.y).toBeCloseTo(nearY);

    expect(gap.label).toBe("2 cm");
    expect(gap.a.x).toBeCloseTo(first.x + first.size);
    expect(gap.b.x).toBeCloseTo(second.x);
    expect(gap.a.y).toBeCloseTo(nearY);
  });

  it("skips the gap segment when gridSize is 1", () => {
    const layout = layoutFor(1);
    const segments = computeDimensionSegments(layout, CM);
    // totalW, totalH, padding, frame — no gap
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.label)).not.toContain("2 cm");
  });

  it("skips zero-valued gap and padding segments", () => {
    const cm = { frameSizeCm: 25, frameGapCm: 0, boardPaddingCm: 0 };
    const layout = layoutFor(3, cm);
    const segments = computeDimensionSegments(layout, cm);
    // totalW, totalH, frame — no padding, no gap
    expect(segments).toHaveLength(3);
    expect(segments[2].label).toBe("25 cm");
    // total = 3*25 = 75
    expect(segments[0].label).toBe("75 cm");
  });
});
