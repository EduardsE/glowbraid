import type { Palette } from "./palettes";
import { samplePalette } from "./palettes";
import { hash } from "./random";
import type { AnimationId, Led, LedLight } from "./types";

export interface AnimationDef {
  id: AnimationId;
  name: string;
}

export const ANIMATIONS: AnimationDef[] = [
  { id: "flow", name: "Flowing" },
  { id: "rainbow", name: "Rainbow" },
  { id: "pulse", name: "Pulse" },
  { id: "breathe", name: "Breathing" },
  { id: "sparkle", name: "Sparkle" },
  { id: "gradient", name: "Gradient" },
];

/**
 * Animated color+brightness of one LED at a moment in time.
 * `gpos`: frame position gradient across the wall (0–1).
 * `time` may be negative — fibers sample LEDs at delayed times.
 */
export function ledColor(
  led: Led,
  gpos: number,
  time: number,
  anim: AnimationId,
  speed: number,
  palette: Palette,
): LedLight {
  const u = led.u;
  let huePhase = u;
  let brightness = 1;

  if (anim === "flow") {
    huePhase = u * 1.5 + time * speed * 0.11;
  } else if (anim === "rainbow") {
    huePhase = u * 3 + time * speed * 0.08;
  } else if (anim === "pulse") {
    huePhase = u * 0.6 + time * speed * 0.03;
    brightness =
      0.22 + 0.78 * (0.5 + 0.5 * Math.sin(time * speed * 2.6 + u * 6.283));
  } else if (anim === "breathe") {
    huePhase = u * 0.4 + time * 0.02;
    brightness = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(time * speed * 1.0));
  } else if (anim === "sparkle") {
    const cycle = Math.floor(time * speed * 1.8);
    const h = hash(cycle * 61 + led.index * 7 + Math.floor(gpos * 13) * 131);
    const phase = (time * speed * 1.8) % 1;
    brightness = h > 0.66 ? Math.max(0.06, 1 - phase) : 0.06;
    huePhase = u + h;
  } else if (anim === "gradient") {
    const g =
      0.5 + 0.5 * Math.sin(time * speed * 0.55 - (gpos * 3.2 + u * 1.4));
    huePhase = gpos * 0.5 + u * 0.5 + time * speed * 0.02;
    brightness = 0.15 + 0.85 * g;
  }

  return { color: samplePalette(palette, huePhase), brightness };
}
