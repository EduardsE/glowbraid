/** Diagonal position gradient of a frame across the wall, 0–1 (drives gradient/sparkle). */
export function frameGradientPos(index: number, gridSize: number): number {
  const gd = Math.max(1, gridSize - 1);
  const gx = index % gridSize;
  const gy = Math.floor(index / gridSize);
  return (gx + gy) / (2 * gd);
}
