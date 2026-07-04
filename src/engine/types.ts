export type Point = { x: number; y: number };
export type RGB = [number, number, number];
export type Side = "top" | "right" | "bottom" | "left";

export interface Led {
  /** Human-readable id used in the inspector, e.g. "T3", "L6" */
  id: string;
  /** 0–23, global within the frame */
  index: number;
  /** Position on the frame border, normalized 0–1 */
  position: Point;
  /** Inward edge normal (unit axis vector) */
  normal: Point;
  side: Side;
  /** 0–5 within the edge */
  edgeIndex: number;
  /** Which 3-LED cut strip segment on the edge */
  strip: 0 | 1;
  /** Perimeter coordinate 0–1; drives animation phase */
  u: number;
}

export interface Fiber {
  id: string;
  startLedIndex: number;
  endLedIndex: number;
  /** 38 samples of a cubic Bézier, includes both endpoints */
  path: Point[];
  /** Polyline length in frame units */
  length: number;
  /** Stroke width multiplier 0.85–1.35 */
  thickness: number;
  /** (startLed.u + endLed.u) / 2 — tints the passive guide */
  hueBase: number;
}

export interface Frame {
  seed: number;
  leds: Led[];
  fibers: Fiber[];
  crossings: number;
}

export interface WallConfig {
  gridSize: number;
  frameSeeds: number[];
}

export type AnimationId =
  | "flow"
  | "rainbow"
  | "pulse"
  | "breathe"
  | "sparkle"
  | "gradient";

export type PaletteId = "sunset" | "neon" | "aurora" | "ember" | "spectrum";

/** One LED's animated output at a moment in time */
export interface LedLight {
  color: RGB;
  brightness: number;
}

/** Shape persisted to localStorage under "filament.project" */
export interface ProjectSnapshot {
  gridSize: number;
  frameSize: number;
  fiberDensity: number;
  masterSeed: number;
  seeds: number[];
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: PaletteId;
  mode: "edit" | "sim";
}
