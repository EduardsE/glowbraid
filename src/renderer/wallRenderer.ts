import { ledColor } from "@/engine/animation";
import { blendSegment, delayedTime } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, Point } from "@/engine/types";
import { computeWallLayout, frameGradientPos, frameRect } from "./viewport";

/** Global glow multiplier (design prop default). */
const GLOW = 1;

/**
 * Cache of pre-rendered LED glow sprites keyed by quantized colour+brightness.
 *
 * The edit-mode LED loop previously drew each LED's glow with
 * `ctx.shadowColor`/`ctx.shadowBlur` around a filled arc. `shadowBlur` is one
 * of the slowest Canvas2D operations; at a 5x5 grid that is ~600 shadow-blurred
 * fills per frame and measured FPS dropped to ~18 (12 at 6x6) versus the 60fps
 * target. Baking the glow into a tiny offscreen radial-gradient sprite once and
 * blitting it with `drawImage` removes the per-LED blur cost entirely.
 */
const glowSpriteCache = new Map<string, HTMLCanvasElement>();

/** Offscreen sprite dimensions (px). Small — it is scaled at draw time. */
const GLOW_SPRITE_SIZE = 32;

/**
 * Build (or fetch from cache) a glow sprite for the given LED colour and
 * brightness. RGB is quantized to 16 levels/channel and brightness to 8 levels,
 * so the theoretical keyspace is 16³×8 = 32,768; in practice the 5 fixed
 * palettes bound it to a few hundred entries — no eviction needed. The
 * brightness-dependent halo spread is baked into the sprite geometry via the
 * quantized brightness.
 */
function ledGlowSprite(
  lr: number,
  lg: number,
  lb: number,
  brightness: number,
): HTMLCanvasElement {
  const qr = Math.max(0, Math.min(15, Math.round((lr / 255) * 15)));
  const qg = Math.max(0, Math.min(15, Math.round((lg / 255) * 15)));
  const qb = Math.max(0, Math.min(15, Math.round((lb / 255) * 15)));
  const qbri = Math.max(0, Math.min(7, Math.round(brightness * 7)));
  const key = `${qr}_${qg}_${qb}_${qbri}`;
  const cached = glowSpriteCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = GLOW_SPRITE_SIZE;
  canvas.height = GLOW_SPRITE_SIZE;
  const sctx = canvas.getContext("2d");
  // Environments without a real 2D context: return the blank canvas so callers
  // never crash; drawImage of an empty canvas is a harmless no-op.
  if (!sctx) {
    glowSpriteCache.set(key, canvas);
    return canvas;
  }

  const r = Math.round((qr / 15) * 255);
  const g = Math.round((qg / 15) * 255);
  const b = Math.round((qb / 15) * 255);
  const bri = qbri / 7;
  const coreAlpha = 0.4 + 0.6 * bri;

  // The sprite spans core + halo. `coreFrac` is the fraction of the sprite
  // radius occupied by the solid core; the remainder is the soft falloff whose
  // spread grows with brightness (mirroring the old shadowBlur extent).
  const coreRatio = 0.0095;
  const haloRatio = 0.03 * coreAlpha;
  const coreFrac = coreRatio / (coreRatio + haloRatio);

  const c = GLOW_SPRITE_SIZE / 2;
  const grad = sctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, `rgba(${r},${g},${b},${coreAlpha})`);
  grad.addColorStop(coreFrac, `rgba(${r},${g},${b},${coreAlpha})`);
  grad.addColorStop(
    coreFrac + (1 - coreFrac) * 0.4,
    `rgba(${r},${g},${b},${(coreAlpha * 0.3).toFixed(3)})`,
  );
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  sctx.fillStyle = grad;
  sctx.beginPath();
  sctx.arc(c, c, c, 0, 6.283);
  sctx.fill();

  glowSpriteCache.set(key, canvas);
  return canvas;
}

export interface WallDrawState {
  frames: Frame[];
  gridSize: number;
  frameSize: number;
  zoom: number;
  pan: Point;
  mode: "edit" | "sim";
  selectedFrame: number | null;
  selectedFiber: number | null;
  time: number;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: Palette;
}

interface FrameDrawOptions {
  selected: boolean;
  selectedFiber: number | null;
  edit: boolean;
  gpos: number;
  time: number;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: Palette;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: WallDrawState,
): void {
  const layout = computeWallLayout({
    gridSize: state.gridSize,
    frameSize: state.frameSize,
    zoom: state.zoom,
    pan: state.pan,
    canvasWidth: width,
    canvasHeight: height,
  });
  const edit = state.mode === "edit";
  for (let index = 0; index < state.frames.length; index++) {
    const rect = frameRect(layout, index);
    const selected = index === state.selectedFrame;
    drawFrame(ctx, rect.x, rect.y, rect.size, state.frames[index], {
      selected,
      selectedFiber: selected ? state.selectedFiber : null,
      edit,
      gpos: frameGradientPos(index, state.gridSize),
      time: state.time,
      anim: state.anim,
      speed: state.speed,
      brightness: state.brightness,
      palette: state.palette,
    });
  }
}

export interface ShowcaseOptions {
  time: number;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: Palette;
}

/** Single centered demo frame behind the empty-state overlay. */
export function drawShowcaseFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  opts: ShowcaseOptions,
): void {
  const sz = Math.min(width, height) * 0.72;
  const x = width / 2 - sz / 2;
  const y = height / 2 - sz / 2;
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawFrame(ctx, x, y, sz, frame, {
    selected: false,
    selectedFiber: null,
    edit: false,
    gpos: 0.5,
    ...opts,
  });
  ctx.restore();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sz: number,
  frame: Frame,
  opts: FrameDrawOptions,
): void {
  const {
    selected,
    selectedFiber,
    edit,
    gpos,
    time,
    anim,
    speed,
    brightness,
    palette,
  } = opts;
  const r = sz * 0.045;

  // bezel
  ctx.save();
  roundRect(ctx, x - sz * 0.03, y - sz * 0.03, sz * 1.06, sz * 1.06, r * 1.5);
  ctx.fillStyle = edit ? "#181a20" : "#141519";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // panel + fibres (clipped)
  ctx.save();
  roundRect(ctx, x, y, sz, sz, r);
  ctx.clip();
  ctx.fillStyle = "#07080b";
  ctx.fillRect(x, y, sz, sz);
  const amb = samplePalette(palette, (time * 0.03) % 1);
  const ambientGradient = ctx.createRadialGradient(
    x + sz * 0.5,
    y + sz * 0.55,
    sz * 0.05,
    x + sz * 0.5,
    y + sz * 0.55,
    sz * 0.75,
  );
  ambientGradient.addColorStop(
    0,
    `rgba(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0},0.14)`,
  );
  ambientGradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ambientGradient;
  ctx.fillRect(x, y, sz, sz);

  ctx.globalCompositeOperation = "lighter";
  for (const fiber of frame.fibers) {
    const pts = fiber.path;
    const n = pts.length;
    const ledA = frame.leds[fiber.startLedIndex];
    const ledB = frame.leds[fiber.endLedIndex];

    // passive plastic light-guide (faint tinted body — continuous, no dots)
    const bodyColor = samplePalette(palette, fiber.hueBase);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + pts[i].x * sz;
      const py = y + pts[i].y * sz;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = `rgba(${bodyColor[0] | 0},${bodyColor[1] | 0},${bodyColor[2] | 0},0.07)`;
    ctx.lineWidth = fiber.thickness * sz * 0.028;
    ctx.stroke();
    ctx.strokeStyle = "rgba(180,190,210,0.05)";
    ctx.lineWidth = fiber.thickness * sz * 0.01;
    ctx.stroke();

    // injected light from both LED ends — segments are stroked one at a
    // time (colour varies per-sample), so caps must be "butt": with the
    // additive "lighter" composite, round caps double up brightness where
    // adjacent segments' end-caps overlap, showing up as bead-like circles.
    ctx.lineCap = "butt";
    let prevX = x + pts[0].x * sz;
    let prevY = y + pts[0].y * sz;
    for (let i = 1; i < n; i++) {
      const px = x + pts[i].x * sz;
      const py = y + pts[i].y * sz;
      const um = (i - 0.5) / (n - 1);
      const lightA = ledColor(
        ledA,
        gpos,
        delayedTime(time, um * fiber.length),
        anim,
        speed,
        palette,
      );
      const lightB = ledColor(
        ledB,
        gpos,
        delayedTime(time, (1 - um) * fiber.length),
        anim,
        speed,
        palette,
      );
      const seg = blendSegment(lightA, lightB, um);
      if (seg.visible) {
        const [cr, cg, cb] = seg.color;
        const inten = seg.intensity * brightness;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(inten * 0.16 * GLOW).toFixed(3)})`;
        ctx.lineWidth = fiber.thickness * sz * 0.05 * GLOW;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = `rgba(${Math.min(255, cr + 70) | 0},${Math.min(255, cg + 70) | 0},${Math.min(255, cb + 70) | 0},${Math.min(1, inten).toFixed(3)})`;
        ctx.lineWidth = fiber.thickness * sz * 0.014;
        ctx.stroke();
      }
      prevX = px;
      prevY = py;
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // selected fibre highlight (edit mode)
  if (
    edit &&
    selected &&
    selectedFiber != null &&
    frame.fibers[selectedFiber]
  ) {
    const pts = frame.fibers[selectedFiber].path;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = x + pts[i].x * sz;
      const py = y + pts[i].y * sz;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // panel border
  ctx.save();
  roundRect(ctx, x, y, sz, sz, r);
  if (selected) {
    ctx.strokeStyle = "rgba(155,140,255,0.9)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(155,140,255,0.7)";
    ctx.shadowBlur = 16;
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
  }
  ctx.stroke();
  ctx.restore();

  // LEDs embedded in the border — edit mode only
  if (edit) {
    // 3-LED strip backings (real cut LED-strip segments)
    ctx.save();
    for (let s = 0; s < frame.leds.length; s += 3) {
      const first = frame.leds[s];
      const last = frame.leds[s + 2];
      const ax = x + first.position.x * sz - first.normal.x * sz * 0.03;
      const ay = y + first.position.y * sz - first.normal.y * sz * 0.03;
      const cx = x + last.position.x * sz - last.normal.x * sz * 0.03;
      const cy = y + last.position.y * sz - last.normal.y * sz * 0.03;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = sz * 0.012;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.restore();

    const selFiber =
      selected && selectedFiber != null ? frame.fibers[selectedFiber] : null;
    for (const led of frame.leds) {
      const light = ledColor(led, gpos, time, anim, speed, palette);
      const [lr, lg, lb] = light.color;
      const bx = x + led.position.x * sz - led.normal.x * sz * 0.03;
      const by = y + led.position.y * sz - led.normal.y * sz * 0.03;
      ctx.beginPath();
      ctx.arc(bx, by, sz * 0.017, 0, 6.283);
      ctx.fillStyle = "#0a0b0e";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Glow: blit a cached radial-gradient sprite instead of a per-LED
      // shadowBlur fill (see glowSpriteCache above). Sized so the solid
      // core matches the old core radius (sz * 0.0095) and the halo
      // reaches roughly the old blur extent beyond it.
      const coreWorld = sz * 0.0095;
      const haloWorld = sz * 0.03 * (0.4 + 0.6 * light.brightness);
      const glowWorld = coreWorld + haloWorld;
      const sprite = ledGlowSprite(lr, lg, lb, light.brightness);
      ctx.drawImage(
        sprite,
        bx - glowWorld,
        by - glowWorld,
        glowWorld * 2,
        glowWorld * 2,
      );
      if (
        selFiber &&
        (selFiber.startLedIndex === led.index ||
          selFiber.endLedIndex === led.index)
      ) {
        ctx.beginPath();
        ctx.arc(bx, by, sz * 0.022, 0, 6.283);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
  }
}
