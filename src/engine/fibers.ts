import {
  countCrossings,
  FIBER_SAMPLES,
  polylineLength,
  sampleCubicBezier,
} from "./geometry";
import { buildLeds } from "./leds";
import { createRng, type Rng } from "./random";
import type { Fiber, FiberStyle, Frame, Led } from "./types";

/** Every LED feeds exactly one fiber end: 24 LEDs → 12 fibers. */
export const FIBERS_PER_FRAME = 12;
/** Whole-matching restart budget before the arbitrary-pairing fallback. */
export const MAX_MATCHING_RESTARTS = 20;

/** Neutral style; also the fallback for missing/invalid persisted values. */
export const DEFAULT_FIBER_STYLE: FiberStyle = {
  curviness: 0.5,
  randomness: 0.5,
  socketDepth: 0.4,
};

/**
 * Control points never leave [MARGIN, 1 − MARGIN]. A cubic Bézier stays
 * inside the convex hull of its four defining points; the stub tips sit at
 * most STUB_MAX inside the frame and the clamped control points are
 * interior, so the whole fiber stays inside — no sampling or retries.
 * Control points lie on axis-aligned LED normals, so clamping only shortens
 * them along the normal; the perpendicular exit direction survives.
 */
const MARGIN = 0.02;

/** Stub length (socket depth) range in normalized frame units. */
const STUB_MIN = 0.005;
const STUB_MAX = 0.12;

function clampAxis(v: number): number {
  return Math.min(1 - MARGIN, Math.max(MARGIN, v));
}

/** Soft-scoring penalty for near-collinear pairs; keeps score positive. */
const COLLINEAR_PENALTY = 0.7;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Finite values clamp to [0, 1]; NaN/±∞ fall back to the given default. */
function sanitizeAxis(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

interface ShapeParams {
  controlMin: number;
  controlRange: number;
}

/** Shape constants interpolated from curviness: 0 = taut arcs, 1 = loopy. */
function shapeParams(curviness: number): ShapeParams {
  return {
    controlMin: lerp(0.3, 0.38, curviness),
    controlRange: lerp(0.12, 0.47, curviness),
  };
}

function shuffledIndices(count: number, rnd: Rng): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * How parallel the chord A→B is to both endpoint normals, 0–1.
 * 1 = directly opposite LEDs (chord parallel to both normals).
 */
function collinearity(a: Led, b: Led): number {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 1;
  const ux = dx / len;
  const uy = dy / len;
  const ca = Math.abs(ux * a.normal.x + uy * a.normal.y);
  const cb = Math.abs(ux * b.normal.x + uy * b.normal.y);
  return ca * cb;
}

/** Soft score: longer chords win, near-collinear pairs are penalized. */
function pairScore(a: Led, b: Led): number {
  const dist = Math.hypot(
    a.position.x - b.position.x,
    a.position.y - b.position.y,
  );
  const c = collinearity(a, b);
  return dist * (1 - COLLINEAR_PENALTY * c * c * c);
}

/**
 * Exactly-facing pair: opposite parallel edges with the same cross-axis
 * coordinate. Perpendicular exits make a single cubic between such LEDs
 * dead straight (all four defining points collinear), so the matcher
 * excludes them. Normals are exact axis units, so the sums are exact; the
 * epsilon absorbs float noise in mirrored edge positions (t vs 1 − t).
 */
const FACING_EPS = 1e-6;

function isFacing(a: Led, b: Led): boolean {
  if (a.normal.x + b.normal.x !== 0 || a.normal.y + b.normal.y !== 0) {
    return false;
  }
  const cross =
    a.normal.x !== 0
      ? Math.abs(a.position.y - b.position.y)
      : Math.abs(a.position.x - b.position.x);
  return cross < FACING_EPS;
}

/**
 * One greedy matching attempt: walk a fresh shuffle, pair each unpaired LED
 * with a weighted-random partner on a different edge (exactly-facing partners
 * excluded). Returns null on a dead end (all remaining unpaired LEDs share the
 * current LED's edge or face it exactly).
 */
function tryMatchOnce(
  leds: Led[],
  rnd: Rng,
  exponent: number,
): Array<[number, number]> | null {
  const order = shuffledIndices(leds.length, rnd);
  const unpaired = new Set(order);
  const pairs: Array<[number, number]> = [];
  for (const i of order) {
    if (!unpaired.has(i)) continue;
    unpaired.delete(i);
    const candidates: number[] = [];
    for (const j of unpaired) {
      if (leds[j].side !== leds[i].side && !isFacing(leds[i], leds[j])) {
        candidates.push(j);
      }
    }
    if (candidates.length === 0) return null;
    const weights = candidates.map(
      (j) => pairScore(leds[i], leds[j]) ** exponent,
    );
    let total = 0;
    for (const w of weights) total += w;
    let r = rnd() * total;
    let pick = candidates[candidates.length - 1];
    for (let k = 0; k < candidates.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        pick = candidates[k];
        break;
      }
    }
    unpaired.delete(pick);
    pairs.push([i, pick]);
  }
  return pairs;
}

/** Guaranteed-termination fallback: pair a shuffle in order, no constraints. */
function fallbackPairs(count: number, rnd: Rng): Array<[number, number]> {
  const order = shuffledIndices(count, rnd);
  const pairs: Array<[number, number]> = [];
  for (let k = 0; k < count; k += 2) {
    pairs.push([order[k], order[k + 1]]);
  }
  return pairs;
}

/**
 * Deterministically generate one frame's fiber layout from a seed and style.
 * Perfect matching (spec 2026-07-04-fiber-perfect-matching): exactly 12
 * fibers, every LED used exactly once, endpoints on different edges,
 * control points bowed so no fiber is straight.
 *
 * Style (specs 2026-07-04-fiber-style-sliders, 2026-07-04-socket-depth-
 * slider): curviness scales the control-point reach, randomness reshapes
 * matcher weights, socketDepth sets the straight perpendicular stub length
 * at each LED hole. All axes clamp to [0, 1]. Exits are always
 * perpendicular; only the stub length is user-tunable.
 *
 * RNG draw order (stable — saved projects persist seeds and regenerate):
 * per matching attempt one 24-element shuffle then one weighted pick per
 * pair; after matching, per fiber: dA, dB, four retired-but-consumed shape
 * draws, thickness. Style never changes the number or order of draws.
 */
export function generateFrame(
  seed: number,
  style: FiberStyle = DEFAULT_FIBER_STYLE,
): Frame {
  const curviness = sanitizeAxis(
    style.curviness,
    DEFAULT_FIBER_STYLE.curviness,
  );
  const randomness = sanitizeAxis(
    style.randomness,
    DEFAULT_FIBER_STYLE.randomness,
  );
  const socketDepth = sanitizeAxis(
    style.socketDepth,
    DEFAULT_FIBER_STYLE.socketDepth,
  );
  /** r=0 → 8 (best-score routing), r=0.5 → 1 (today), r=1 → 0.125 (chaos). */
  const exponent = 8 ** (1 - 2 * randomness);
  const shape = shapeParams(curviness);
  const stub = lerp(STUB_MIN, STUB_MAX, socketDepth);
  const rnd = createRng(seed);
  const leds = buildLeds();

  let pairs: Array<[number, number]> | null = null;
  for (
    let attempt = 0;
    pairs === null && attempt < MAX_MATCHING_RESTARTS;
    attempt++
  ) {
    pairs = tryMatchOnce(leds, rnd, exponent);
  }
  if (pairs === null) pairs = fallbackPairs(leds.length, rnd);

  const fibers: Fiber[] = pairs.map(([startIndex, endIndex], f) => {
    const start = leds[startIndex];
    const end = leds[endIndex];

    const dA = shape.controlMin + rnd() * shape.controlRange;
    const dB = shape.controlMin + rnd() * shape.controlRange;
    // Four draws kept from the retired tangent-bow machinery (magA,
    // signDrawA, magB, signDrawB) — consumed so persisted seeds keep their
    // matching and thickness across engine versions, but perpendicular
    // exits leave them nothing to steer.
    rnd();
    rnd();
    rnd();
    rnd();
    const thickness = 0.85 + rnd() * 0.5;

    // Straight socket stub: the fiber leaves the hole along the LED normal.
    const stubA = {
      x: start.position.x + start.normal.x * stub,
      y: start.position.y + start.normal.y * stub,
    };
    const stubB = {
      x: end.position.x + end.normal.x * stub,
      y: end.position.y + end.normal.y * stub,
    };
    // Control points on the normals: the cubic's end tangents continue the
    // stubs exactly — perpendicular exit, no kink at the joint.
    const p1 = {
      x: clampAxis(stubA.x + start.normal.x * dA),
      y: clampAxis(stubA.y + start.normal.y * dA),
    };
    const p2 = {
      x: clampAxis(stubB.x + end.normal.x * dB),
      y: clampAxis(stubB.y + end.normal.y * dB),
    };
    const path = [
      { ...start.position },
      ...sampleCubicBezier(stubA, p1, p2, stubB, FIBER_SAMPLES - 2),
      { ...end.position },
    ];

    return {
      id: `${seed}-${f}`,
      startLedIndex: startIndex,
      endLedIndex: endIndex,
      path,
      length: polylineLength(path),
      thickness,
      hueBase: (start.u + end.u) / 2,
    };
  });

  return {
    seed,
    leds,
    fibers,
    crossings: countCrossings(fibers.map((fiber) => fiber.path)),
  };
}
