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
  /** 38 points: straight socket stubs at both ends + sampled cubic Bézier */
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

/** User-tunable fiber generation style; all axes 0–1. */
export interface FiberStyle {
  /** 0 = taut gentle C-arcs, 1 = big loopy sweeps with S-curves */
  curviness: number;
  /** 0 = orderly best-score routing, 1 = near-uniform chaotic routing */
  randomness: number;
  /**
   * Length of the straight perpendicular exit stub at each LED hole
   * (the physical socket that grips the fiber). 0 = a few mm, 1 = deep.
   */
  socketDepth: number;
}

export interface WallConfig {
  gridSize: number;
  frameSeeds: number[];
  /** Omitted → DEFAULT_FIBER_STYLE. */
  style?: FiberStyle;
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
  /** Frame edge length in centimetres (10–40). */
  frameSize: number;
  /** Gap between adjacent frames in millimetres (0–30). Absent in legacy saves → loader defaults to 20. */
  frameGap: number;
  /** Padding between the frame grid's outer edge and the board edge in centimetres (0–20). Absent in legacy saves → loader defaults to 4. */
  boardPadding: number;
  /** Backing board / fibre-backdrop fill (hex). Absent in legacy saves → loader defaults to "#101114". */
  boardColor?: string;
  /** Blueprint dimension overlay toggle. Absent in legacy saves → loader defaults to false. */
  showMeasurements: boolean;
  masterSeed: number;
  seeds: number[];
  /** Per-frame bezel color (hex), parallel to `seeds`; null = use the default edit/sim pair. Absent or length-mismatched → loader defaults to all null. */
  frameColors?: (string | null)[];
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: PaletteId;
  /** FiberStyle axes, 0–1. Absent in legacy saves → loader defaults to 0.5. */
  curviness: number;
  randomness: number;
  /** FiberStyle socket depth, 0–1. Absent in legacy saves → loader defaults to 0.4. */
  socketDepth: number;
  mode: "edit" | "sim";
}
