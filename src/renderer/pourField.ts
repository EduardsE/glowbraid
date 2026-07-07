import { hash } from "@/engine/random";
import type { RGB } from "@/engine/types";

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

export type PourPaletteId = "tidal" | "magma" | "bubblegum" | "iris";

export interface PourPalette {
  id: PourPaletteId;
  name: string;
  stops: RGB[];
}

/**
 * Pour palettes are separate from the LED palettes: pours live on white
 * lacing and near-black negative space, which the LED palettes deliberately
 * avoid. Stops are ordered dark → light; samplePourStops clamps (no wrap).
 */
export const POUR_PALETTES: Record<PourPaletteId, PourPalette> = {
  tidal: {
    id: "tidal",
    name: "Tidal",
    stops: [
      [6, 10, 18],
      [13, 48, 74],
      [26, 134, 150],
      [126, 206, 208],
      [243, 246, 246],
    ],
  },
  magma: {
    id: "magma",
    name: "Magma",
    stops: [
      [24, 28, 52],
      [41, 74, 158],
      [227, 66, 32],
      [255, 148, 54],
      [247, 244, 238],
    ],
  },
  bubblegum: {
    id: "bubblegum",
    name: "Bubblegum",
    stops: [
      [46, 74, 168],
      [221, 58, 158],
      [248, 150, 206],
      [164, 240, 222],
      [236, 248, 246],
    ],
  },
  iris: {
    id: "iris",
    name: "Iris",
    stops: [
      [16, 10, 20],
      [84, 32, 130],
      [168, 90, 220],
      [212, 166, 74],
      [246, 244, 248],
    ],
  },
};

export const POUR_PALETTE_IDS: PourPaletteId[] = [
  "tidal",
  "magma",
  "bubblegum",
  "iris",
];

/** Clamped piecewise-linear palette sample (unlike samplePalette, no wrap). */
export function samplePourStops(palette: PourPalette, t: number): RGB {
  const stops = palette.stops;
  const n = stops.length - 1;
  const c = Math.min(1, Math.max(0, t)) * n;
  const i = Math.min(n - 1, Math.floor(c));
  const f = c - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/** Marble features across the board's width. */
const FLOW_SCALE = 3.2;
/** Worley cells per warped flow unit. */
const CELL_SCALE = 1.8;
/** F2−F1 distance below which a pixel reads as bright lacing. */
const LACE_WIDTH = 0.16;
/** How strongly lacing pulls toward the palette's lightest stop. */
const LACE_STRENGTH = 0.85;
/** Max darkening of cell rims (the dark webbing between cells). */
const RIM_DARKEN = 0.45;
/** Widen the fbm output (which clusters near 0.5) across the full palette. */
const CONTRAST = 2.2;

/**
 * Rasterize one pour artwork into a raw RGBA buffer.
 *
 * Per pixel: warp the coordinates (marbling), map fbm through the palette,
 * then — gated by a low-frequency mask so parts of the canvas stay purely
 * marbled — overlay Worley cells: bright lacing where f2−f1 is small, and
 * darkened rims just inside cell borders. Pure function of its arguments.
 */
export function renderPourRGBA(
  seed: number,
  palette: PourPalette,
  width: number,
  height: number,
): { pixels: Uint8ClampedArray<ArrayBuffer>; averageLuminance: number } {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const laceColor = palette.stops[palette.stops.length - 1];
  let lumSum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width) * FLOW_SCALE;
      const v = ((y + 0.5) / height) * FLOW_SCALE;
      const w = warpPoint(seed, u, v);
      const base = fbm(seed + 5, w.x, w.y, 4);
      const t = (base - 0.5) * CONTRAST + 0.5;
      let [r, g, b] = samplePourStops(palette, t);

      const mask = fbm(seed + 83, u * 0.9 + 7.3, v * 0.9 + 2.1, 3);
      const cellAmount = Math.min(1, Math.max(0, (mask - 0.42) / 0.22));
      if (cellAmount > 0) {
        const { f1, f2 } = worley(seed + 3, w.x * CELL_SCALE, w.y * CELL_SCALE);
        const lace = Math.max(0, 1 - (f2 - f1) / LACE_WIDTH) * cellAmount;
        const rim =
          Math.min(1, Math.max(0, (f1 - 0.3) / 0.35)) * cellAmount * (1 - lace);
        const pull = lace * LACE_STRENGTH;
        const shade = 1 - RIM_DARKEN * rim;
        r = (r + (laceColor[0] - r) * pull) * shade;
        g = (g + (laceColor[1] - g) * pull) * shade;
        b = (b + (laceColor[2] - b) * pull) * shade;
      }

      const o = (y * width + x) * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
      lumSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }
  }
  return { pixels, averageLuminance: lumSum / (width * height) };
}
