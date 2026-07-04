import { generateFrame } from "./fibers";
import type { Frame, WallConfig } from "./types";

/** Per-frame seeds derived from the master seed (reference formula). */
export function deriveFrameSeeds(masterSeed: number, count: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => ((masterSeed * 2654435761 + i * 40503) >>> 0) % 100000,
  );
}

export function generateWall(config: WallConfig): Frame[] {
  return config.frameSeeds.map((seed) =>
    generateFrame(seed, config.fiberDensity),
  );
}
