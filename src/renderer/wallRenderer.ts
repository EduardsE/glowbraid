import { ledColor } from "@/engine/animation";
import type { SegmentLight } from "@/engine/light";
import { blendSegment, delayedTime } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, Point } from "@/engine/types";
import { computeDimensionSegments, drawDimensions } from "./dimensions";
import {
  ADDITIVE_FADE,
  boostSaturation,
  floorIntensity,
  lightBoardFactor,
  SATURATION_BOOST,
} from "./lightMapping";
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

/** Default backing-board / fibre-backdrop fill, used when no boardColor is set. */
export const DEFAULT_BOARD_COLOR = "#101114";

/**
 * Approximates the app's existing edit→sim bezel darkening (the hardcoded
 * #181a20 → #141519 pair) for an arbitrary base color, so custom/preset frame
 * colors get the same relative dimming in sim mode. The original pair's
 * per-channel ratios aren't perfectly uniform (0.83/0.81/0.78) — this uses a
 * single 0.8 ratio as a close approximation rather than reproducing them exactly.
 */
export function shadeForSim(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * 0.8)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export interface WallDrawState {
  frames: Frame[];
  gridSize: number;
  frameSize: number;
  /** Millimetres. */
  frameGap: number;
  boardPadding: number;
  boardColor: string;
  frameColors: (string | null)[];
  showMeasurements: boolean;
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
  color: string | null;
  boardColor: string;
  /** 0 dark board → 1 light board; drives the additive↔graphic crossfade. */
  lightFactor: number;
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
    frameGap: state.frameGap / 10,
    boardPadding: state.boardPadding,
    zoom: state.zoom,
    pan: state.pan,
    canvasWidth: width,
    canvasHeight: height,
  });

  // Backing board — sits behind the frame grid, visible in the inter-frame
  // gaps and around the outer edge per `boardPadding`.
  ctx.save();
  ctx.fillStyle = state.boardColor;
  ctx.fillRect(
    layout.boardX,
    layout.boardY,
    layout.boardSize,
    layout.boardSize,
  );
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    layout.boardX,
    layout.boardY,
    layout.boardSize,
    layout.boardSize,
  );
  ctx.restore();

  const edit = state.mode === "edit";
  const lightFactor = lightBoardFactor(state.boardColor);
  for (let index = 0; index < state.frames.length; index++) {
    const rect = frameRect(layout, index);
    const selected = index === state.selectedFrame;
    drawFrame(ctx, rect.x, rect.y, rect.size, state.frames[index], {
      selected,
      selectedFiber: selected ? state.selectedFiber : null,
      edit,
      color: state.frameColors[index] ?? null,
      boardColor: state.boardColor,
      lightFactor,
      gpos: frameGradientPos(index, state.gridSize),
      time: state.time,
      anim: state.anim,
      speed: state.speed,
      brightness: state.brightness,
      palette: state.palette,
    });
  }

  if (state.showMeasurements) {
    drawDimensions(
      ctx,
      computeDimensionSegments(layout, {
        frameSizeCm: state.frameSize,
        frameGapCm: state.frameGap / 10,
        frameGapMm: state.frameGap,
        boardPaddingCm: state.boardPadding,
      }),
    );
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
    color: null,
    boardColor: DEFAULT_BOARD_COLOR,
    lightFactor: lightBoardFactor(DEFAULT_BOARD_COLOR),
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
    color,
    boardColor,
    lightFactor,
    gpos,
    time,
    anim,
    speed,
    brightness,
    palette,
  } = opts;
  const f = lightFactor;
  const r = sz * 0.045;

  // bezel
  ctx.save();
  roundRect(ctx, x - sz * 0.03, y - sz * 0.03, sz * 1.06, sz * 1.06, r * 1.5);
  ctx.fillStyle =
    color == null
      ? edit
        ? "#181a20"
        : "#141519"
      : edit
        ? color
        : shadeForSim(color);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // panel + fibres (clipped)
  ctx.save();
  roundRect(ctx, x, y, sz, sz, r);
  ctx.clip();
  ctx.fillStyle = boardColor;
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
    `rgba(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0},${(0.14 * (1 - f)).toFixed(3)})`,
  );
  ambientGradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ambientGradient;
  ctx.fillRect(x, y, sz, sz);

  for (const fiber of frame.fibers) {
    const pts = fiber.path;
    const n = pts.length;
    const ledA = frame.leds[fiber.startLedIndex];
    const ledB = frame.leds[fiber.endLedIndex];

    const tracePath = () => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = x + pts[i].x * sz;
        const py = y + pts[i].y * sz;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
    };
    const strokeSeg = (i: number, style: string, width: number) => {
      ctx.beginPath();
      ctx.moveTo(x + pts[i - 1].x * sz, y + pts[i - 1].y * sz);
      ctx.lineTo(x + pts[i].x * sz, y + pts[i].y * sz);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    // Light at each segment, computed once and shared by both passes below.
    const segs: SegmentLight[] = [];
    for (let i = 1; i < n; i++) {
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
      segs.push(blendSegment(lightA, lightB, um));
    }

    const bodyColor = samplePalette(palette, fiber.hueBase);

    // Additive pass — the dark-room look; fades out as the board brightens,
    // where adding light to an already-bright board cannot produce contrast.
    ctx.globalCompositeOperation = "lighter";

    // passive plastic light-guide (faint tinted body — continuous, no dots)
    ctx.lineCap = "round";
    tracePath();
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
    const addScale = 1 - ADDITIVE_FADE * f;
    if (addScale > 0.02) {
      for (let i = 1; i < n; i++) {
        const seg = segs[i - 1];
        if (!seg.visible) continue;
        const [cr, cg, cb] = seg.color;
        const inten = seg.intensity * brightness * addScale;
        strokeSeg(
          i,
          `rgba(${cr | 0},${cg | 0},${cb | 0},${(inten * 0.16 * GLOW).toFixed(3)})`,
          fiber.thickness * sz * 0.05 * GLOW,
        );
        strokeSeg(
          i,
          `rgba(${Math.min(255, cr + 70) | 0},${Math.min(255, cg + 70) | 0},${Math.min(255, cb + 70) | 0},${Math.min(1, inten).toFixed(3)})`,
          fiber.thickness * sz * 0.014,
        );
      }
    }

    // Graphic pass — opaque saturated strokes with a legibility floor, so
    // the wall stays readable on light boards. Culled (invisible) segments
    // still draw at the floor, tinted with the fibre's body hue, keeping the
    // whole path faintly present like a real side-glow fibre in a lit room.
    ctx.globalCompositeOperation = "source-over";
    if (f > 0.01) {
      ctx.lineCap = "round";
      tracePath();
      ctx.strokeStyle = `rgba(${bodyColor[0] | 0},${bodyColor[1] | 0},${bodyColor[2] | 0},${(0.1 * f).toFixed(3)})`;
      ctx.lineWidth = fiber.thickness * sz * 0.028;
      ctx.stroke();
      ctx.strokeStyle = `rgba(180,190,210,${(0.1 * f).toFixed(3)})`;
      ctx.lineWidth = fiber.thickness * sz * 0.01;
      ctx.stroke();

      ctx.lineCap = "butt";
      for (let i = 1; i < n; i++) {
        const seg = segs[i - 1];
        const raw = seg.visible ? seg.intensity * brightness : 0;
        const ip = floorIntensity(raw);
        const sat = boostSaturation(
          seg.visible ? seg.color : bodyColor,
          SATURATION_BOOST,
        );
        strokeSeg(
          i,
          `rgba(${sat[0] | 0},${sat[1] | 0},${sat[2] | 0},${(0.45 * ip * f).toFixed(3)})`,
          fiber.thickness * sz * 0.05,
        );
        strokeSeg(
          i,
          `rgba(${(sat[0] * 0.82) | 0},${(sat[1] * 0.82) | 0},${(sat[2] * 0.82) | 0},${(Math.min(1, ip) * f).toFixed(3)})`,
          fiber.thickness * sz * 0.016,
        );
      }
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
