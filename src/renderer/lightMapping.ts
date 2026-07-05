import type { RGB } from "@/engine/types";

/**
 * Screen-only mapping between board luminance and fibre-light rendering.
 *
 * Additive ("lighter") blending cannot brighten a near-white backdrop, so on
 * light boards the renderer crossfades the additive glow into an opaque
 * "legibility floor" graphic pass (see wallRenderer.ts). This is a display
 * concern only — none of it feeds the future hardware path, which is why it
 * lives in the renderer, not the engine.
 *
 * Constants were tuned interactively during the design brainstorm
 * (docs/superpowers/specs/2026-07-05-light-board-fibre-legibility-design.md).
 */

/** Crossfade begins at this relative board luminance… */
export const CROSSFADE_START = 0.22;
/** …and completes CROSSFADE_RANGE above it. */
export const CROSSFADE_RANGE = 0.4;
/**
 * Fraction of the additive pass faded out at full light-board factor.
 * 1.0 = fully skipped on white boards (perf fallback approved in the spec:
 * at high factor the additive contribution is visually negligible, and
 * skipping it restores ~2 strokes/segment).
 */
export const ADDITIVE_FADE = 1.0;
/** Minimum displayed intensity on light boards — dim fibre never vanishes. */
export const INTENSITY_FLOOR = 0.22;
/** Saturation push for graphic-pass colours (additive colours read pale). */
export const SATURATION_BOOST = 0.8;

/**
 * Rec.709-weighted luminance of a `#rgb`/`#rrggbb` colour, 0–1. Applied to
 * gamma-encoded channels (no linearization) — matches the approved demo.
 * Unparsable input → 0, failing safe to the dark-board (current) rendering.
 */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  let digits = match[1];
  if (digits.length === 3) {
    digits = `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }
  const n = Number.parseInt(digits, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** 0 on dark boards → 1 on light boards; drives the additive↔graphic crossfade. */
export function lightBoardFactor(hex: string): number {
  const f = (relativeLuminance(hex) - CROSSFADE_START) / CROSSFADE_RANGE;
  return Math.max(0, Math.min(1, f));
}

/** Push channels away from their mean by `amount`, clamped to 0–255. */
export function boostSaturation(color: RGB, amount: number): RGB {
  const mean = (color[0] + color[1] + color[2]) / 3;
  const push = (c: number) =>
    Math.max(0, Math.min(255, c + (c - mean) * amount));
  return [push(color[0]), push(color[1]), push(color[2])];
}

/** Remap displayed intensity so it never drops below INTENSITY_FLOOR. */
export function floorIntensity(i: number): number {
  return INTENSITY_FLOOR + (1 - INTENSITY_FLOOR) * Math.min(1, Math.max(0, i));
}
