import { describe, expect, it } from "vitest";
import { FIBERS_PER_FRAME, generateFrame } from "../fibers";
import type { FiberStyle } from "../types";
import { deriveFrameSeeds, generateWall } from "../wall";

describe("deriveFrameSeeds", () => {
  it("matches the reference formula", () => {
    const seeds = deriveFrameSeeds(7431, 9);
    for (let i = 0; i < 9; i++) {
      expect(seeds[i]).toBe(((7431 * 2654435761 + i * 40503) >>> 0) % 100000);
    }
  });

  it("is deterministic and length-correct", () => {
    expect(deriveFrameSeeds(42, 36)).toEqual(deriveFrameSeeds(42, 36));
    expect(deriveFrameSeeds(42, 36)).toHaveLength(36);
  });
});

describe("generateWall", () => {
  it("generates one frame per seed with FIBERS_PER_FRAME fibers", () => {
    const frameSeeds = deriveFrameSeeds(7431, 4);
    const frames = generateWall({ gridSize: 2, frameSeeds });
    expect(frames).toHaveLength(4);
    frames.forEach((frame, i) => {
      expect(frame.seed).toBe(frameSeeds[i]);
      expect(frame.fibers).toHaveLength(FIBERS_PER_FRAME);
    });
  });

  it("replacing one frame seed changes only that frame", () => {
    const seeds = deriveFrameSeeds(7431, 4);
    const before = generateWall({ gridSize: 2, frameSeeds: seeds });
    const reseeded = [...seeds];
    reseeded[2] = 12345;
    const after = generateWall({ gridSize: 2, frameSeeds: reseeded });
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);
    expect(after[3]).toEqual(before[3]);
    expect(after[2]).not.toEqual(before[2]);
  });

  it("forwards style to every frame", () => {
    const style: FiberStyle = {
      curviness: 0.1,
      randomness: 0.9,
      socketDepth: 0.4,
    };
    const frameSeeds = deriveFrameSeeds(7431, 4);
    const frames = generateWall({ gridSize: 2, frameSeeds, style });
    frames.forEach((frame, i) => {
      expect(frame).toEqual(generateFrame(frameSeeds[i], style));
    });
  });
});
