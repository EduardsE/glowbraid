import { describe, expect, it } from "vitest";
import { computeWallLayout, frameRect } from "../viewport";

const BASE_INPUT = {
  gridSize: 3,
  frameSize: 200,
  frameGap: 20,
  zoom: 1,
  pan: { x: 0, y: 0 },
  canvasWidth: 1000,
  canvasHeight: 800,
};

describe("computeWallLayout", () => {
  it("boardPadding=0 matches the pre-board-feature layout exactly", () => {
    const layout = computeWallLayout({ ...BASE_INPUT, boardPadding: 0 });
    const wall =
      BASE_INPUT.gridSize * BASE_INPUT.frameSize +
      (BASE_INPUT.gridSize - 1) * BASE_INPUT.frameGap;
    const base = Math.min(
      (BASE_INPUT.canvasWidth * 0.82) / wall,
      (BASE_INPUT.canvasHeight * 0.82) / wall,
    );
    expect(layout.scale).toBeCloseTo(base * BASE_INPUT.zoom);
    expect(layout.tx).toBeCloseTo(
      BASE_INPUT.canvasWidth / 2 - (layout.scale * wall) / 2,
    );
    expect(layout.ty).toBeCloseTo(
      BASE_INPUT.canvasHeight / 2 - (layout.scale * wall) / 2,
    );
    expect(layout.boardX).toBeCloseTo(layout.tx);
    expect(layout.boardY).toBeCloseTo(layout.ty);
    expect(layout.boardSize).toBeCloseTo(layout.scale * wall);
  });

  it("positive boardPadding shrinks scale relative to boardPadding=0", () => {
    const flat = computeWallLayout({ ...BASE_INPUT, boardPadding: 0 });
    const padded = computeWallLayout({ ...BASE_INPUT, boardPadding: 40 });
    expect(padded.scale).toBeLessThan(flat.scale);
  });

  it("frame placement is still consistent with tx/ty/scale/gap regardless of boardPadding", () => {
    const layout = computeWallLayout({ ...BASE_INPUT, boardPadding: 40 });
    const rect = frameRect(layout, 4); // center frame of a 3x3 grid
    const gx = 1;
    const gy = 1;
    expect(rect.x).toBeCloseTo(
      layout.tx + gx * (layout.frameSize + layout.gap) * layout.scale,
    );
    expect(rect.y).toBeCloseTo(
      layout.ty + gy * (layout.frameSize + layout.gap) * layout.scale,
    );
    expect(rect.size).toBeCloseTo(layout.frameSize * layout.scale);
  });

  it("board fully encloses the frame grid with the padding inset on all sides", () => {
    const layout = computeWallLayout({ ...BASE_INPUT, boardPadding: 40 });
    expect(layout.tx).toBeCloseTo(layout.boardX + layout.scale * 40);
    expect(layout.ty).toBeCloseTo(layout.boardY + layout.scale * 40);
  });
});
