import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { Frame } from "@/engine/types";

export interface MapGeometry {
  s: number;
  ox: number;
  oy: number;
}

/** Inspector connection map. Returns the geometry needed to hit-test clicks. */
export function drawConnectionMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  selectedFiber: number | null,
  palette: Palette,
): MapGeometry {
  ctx.clearRect(0, 0, width, height);
  const s = Math.min(width, height) * 0.84;
  const ox = (width - s) / 2;
  const oy = (height - s) / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, s, s);

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  frame.fibers.forEach((fiber, fi) => {
    const active = fi === selectedFiber;
    const c = samplePalette(palette, fiber.hueBase);
    ctx.beginPath();
    fiber.path.forEach((p, i) => {
      const px = ox + p.x * s;
      const py = oy + p.y * s;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.strokeStyle = active
      ? "rgba(255,255,255,0.95)"
      : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0.45)`;
    ctx.lineWidth = active ? 2.2 : 1.2;
    ctx.stroke();
  });
  ctx.globalCompositeOperation = "source-over";

  const selFiber = selectedFiber != null ? frame.fibers[selectedFiber] : null;
  for (const led of frame.leds) {
    const on =
      !!selFiber &&
      (selFiber.startLedIndex === led.index ||
        selFiber.endLedIndex === led.index);
    ctx.beginPath();
    ctx.arc(
      ox + led.position.x * s,
      oy + led.position.y * s,
      on ? 3 : 1.6,
      0,
      6.283,
    );
    ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.3)";
    ctx.fill();
  }

  return { s, ox, oy };
}

/**
 * Nearest fiber to a point in normalized map-frame coordinates
 * (caller converts from pixels using MapGeometry). Threshold 0.05.
 */
export function pickMapFiber(
  frame: Frame,
  x: number,
  y: number,
): number | null {
  let best = -1;
  let bestDist = 0.05;
  frame.fibers.forEach((fiber, fi) => {
    for (let i = 0; i < fiber.path.length; i += 2) {
      const d = Math.hypot(fiber.path[i].x - x, fiber.path[i].y - y);
      if (d < bestDist) {
        bestDist = d;
        best = fi;
      }
    }
  });
  return best >= 0 ? best : null;
}
