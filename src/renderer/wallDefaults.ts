/** Default backing-board / fibre-backdrop fill, used when no boardColor is set. */
export const DEFAULT_BOARD_COLOR = "#101114";

/**
 * Approximates the darkened installation-view bezel tone (the hardcoded
 * #181a20 → #141519 pair) for an arbitrary base color, so custom/preset frame
 * colors get the same relative dimming. The original pair's per-channel
 * ratios aren't perfectly uniform (0.83/0.81/0.78) — this uses a single 0.8
 * ratio as a close approximation rather than reproducing them exactly.
 */
export function shadeForSim(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * 0.8)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
