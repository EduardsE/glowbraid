import type { Frame, Led } from "@/engine/types";

export interface MapGeometry {
  s: number;
  ox: number;
  oy: number;
}

// Drawing inks — mirror the studio tokens in styles.css (canvas can't read them).
const INK = "#16191e";
const INK_FAINT = "rgba(22, 25, 30, 0.42)";
const REDLINE = "#c81e3a";
const LABEL_FONT =
  '700 11px "Sofia Sans Condensed Variable", "Sofia Sans Variable", sans-serif';

/** LED id label, pushed outward from the frame edge along the LED's normal. */
function drawLedLabel(
  ctx: CanvasRenderingContext2D,
  led: Led,
  x: number,
  y: number,
): void {
  const d = 11;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = REDLINE;
  ctx.textBaseline = "middle";
  ctx.textAlign =
    led.normal.x > 0 ? "right" : led.normal.x < 0 ? "left" : "center";
  ctx.fillText(led.id, x - led.normal.x * d, y - led.normal.y * d);
}

/**
 * Frame wiring detail: the panel outline, its 24 LEDs and 12 fibre runs as
 * ink on paper, with the traced fibre and its two feeding LEDs in redline.
 * Returns the geometry needed to hit-test clicks.
 */
export function drawConnectionMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  selectedFiber: number | null,
): MapGeometry {
  ctx.clearRect(0, 0, width, height);
  // Inset leaves room for the LED labels outside the outline.
  const s = Math.min(width, height) - 40;
  const ox = (width - s) / 2;
  const oy = (height - s) / 2;

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, s, s);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stroke = (fi: number) => {
    const fiber = frame.fibers[fi];
    ctx.beginPath();
    fiber.path.forEach((p, i) => {
      const px = ox + p.x * s;
      const py = oy + p.y * s;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
  };
  ctx.strokeStyle = INK_FAINT;
  ctx.lineWidth = 1;
  for (let fi = 0; fi < frame.fibers.length; fi++) {
    if (fi !== selectedFiber) stroke(fi);
  }

  const selFiber = selectedFiber != null ? frame.fibers[selectedFiber] : null;
  if (selFiber && selectedFiber != null) {
    ctx.strokeStyle = REDLINE;
    ctx.lineWidth = 2.25;
    stroke(selectedFiber);
  }

  for (const led of frame.leds) {
    const on =
      !!selFiber &&
      (selFiber.startLedIndex === led.index ||
        selFiber.endLedIndex === led.index);
    const x = ox + led.position.x * s;
    const y = oy + led.position.y * s;
    ctx.beginPath();
    ctx.arc(x, y, on ? 3.5 : 1.75, 0, 6.283);
    ctx.fillStyle = on ? REDLINE : INK;
    ctx.fill();
    if (on) drawLedLabel(ctx, led, x, y);
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
