import { POUR_PALETTES, type PourPaletteId, renderPourRGBA } from "./pourField";

/**
 * Offscreen-canvas cache for the generated pour artwork: generate once,
 * blit every frame. Single entry — only one artwork is ever on screen.
 */

/**
 * Generation resolution. The field is smooth, so scaling up at draw time is
 * visually lossless; if generation stalls noticeably (>~1.5 s), lowering
 * this to 512 is the intended knob.
 */
export const POUR_TEXTURE_SIZE = 768;

export interface PourTexture {
  canvas: HTMLCanvasElement;
  averageLuminance: number;
}

let cacheKey = "";
let cached: PourTexture | null = null;

/**
 * Build (or fetch) the pour artwork for a seed + palette. Returns null when
 * canvas 2D context creation fails (canvas-less test envs). Callers only
 * run client-side; the flat boardColor fill is the fallback.
 */
export function getPourTexture(
  seed: number,
  paletteId: PourPaletteId,
  size: number = POUR_TEXTURE_SIZE,
): PourTexture | null {
  const key = `${seed}|${paletteId}|${size}`;
  if (cached && key === cacheKey) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { pixels, averageLuminance } = renderPourRGBA(
    seed,
    POUR_PALETTES[paletteId],
    size,
    size,
  );
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
  cached = { canvas, averageLuminance };
  cacheKey = key;
  return cached;
}
