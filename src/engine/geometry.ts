import type { Point } from "./types";

/** Samples per fiber path (matches the design reference) */
export const FIBER_SAMPLES = 38;

export function sampleCubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  samples: number = FIBER_SAMPLES,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    });
  }
  return out;
}

export function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/**
 * Coarse proximity test between two sampled paths (the design reference's
 * crossing heuristic: every 4th interior sample, threshold 0.028).
 */
export function pathsAreClose(
  a: Point[],
  b: Point[],
  threshold = 0.028,
): boolean {
  for (let i = 2; i < a.length - 2; i += 4) {
    for (let j = 2; j < b.length - 2; j += 4) {
      if (Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y) < threshold) return true;
    }
  }
  return false;
}

export function countCrossings(paths: Point[][]): number {
  let crossings = 0;
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      if (pathsAreClose(paths[i], paths[j])) crossings++;
    }
  }
  return crossings;
}
