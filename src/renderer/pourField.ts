import { hash } from "@/engine/random";

/**
 * Procedural acrylic-pour field — pure math, DOM-free.
 *
 * Marbling comes from domain-warping sample coordinates through layered
 * value noise; cells and "lacing" come from Worley noise evaluated on the
 * warped coordinates (see renderPourRGBA). Everything derives from the
 * engine's stateless `hash`, so a given seed regenerates the identical
 * artwork. Renderer-layer on purpose: the board painting is simulator
 * visual only and never feeds the hardware path.
 */

/** Lattice-point hash decorrelated across integer coordinates and seeds. */
function hash2(seed: number, ix: number, iy: number): number {
  return hash(ix + iy * 57.31 + seed * 0.9871);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smoothly interpolated lattice noise, [0, 1). */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = smooth(x - ix);
  const sy = smooth(y - iy);
  const a = hash2(seed, ix, iy);
  const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy + 1);
  const d = hash2(seed, ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal sum of valueNoise octaves, normalized to [0, 1). */
export function fbm(
  seed: number,
  x: number,
  y: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 101, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** How far coordinates are advected by the warp field (marble intensity). */
const WARP_STRENGTH = 1.6;

/**
 * Two-layer domain warp: the point is displaced by noise that is itself
 * sampled at noise-displaced coordinates, producing the curling flow lines
 * characteristic of a pour.
 */
export function warpPoint(
  seed: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const ax = fbm(seed + 11, x + 3.1, y + 1.7, 3);
  const ay = fbm(seed + 29, x - 2.3, y + 4.9, 3);
  const bx = fbm(seed + 47, x + 4 * ax, y + 4 * ay, 3);
  const by = fbm(seed + 61, x + 4 * ay + 8.2, y + 4 * ax + 2.8, 3);
  return {
    x: x + WARP_STRENGTH * (bx - 0.5) * 2,
    y: y + WARP_STRENGTH * (by - 0.5) * 2,
  };
}

/**
 * Worley (cellular) noise over a jittered unit grid: distances to the
 * nearest (f1) and second-nearest (f2) feature points in the 3×3
 * neighborhood. f2 − f1 → 0 along cell borders.
 */
export function worley(
  seed: number,
  x: number,
  y: number,
): { f1: number; f2: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = Number.POSITIVE_INFINITY;
  let f2 = Number.POSITIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const px = cx + hash2(seed + 7, cx, cy);
      const py = cy + hash2(seed + 13, cx, cy);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}
