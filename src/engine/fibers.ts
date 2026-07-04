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
 * inside the convex hull of its four defining points, and the two endpoints
 * sit on the frame border, so clamped control points guarantee the whole
 * fiber stays inside the frame — no sampling, retries, or extra RNG draws.
 */
const MARGIN = 0.02;

function clampAxis(v: number): number {
  return Math.min(1 - MARGIN, Math.max(MARGIN, v));
}

/**
 * Clamp a control point into the frame. If clamping crushes the bow's
 * perpendicular-to-chord component below the floor, re-apply the floor on
 * the point's resolved side and clamp again. The side is interior-facing
 * for suppressed-S fibers (Task 1), so the re-push has room; the final
 * clamp keeps containment absolute either way.
 */
function containControlPoint(
  led: Led,
  cp: ControlPoint,
  px: number,
  py: number,
  floor: number,
): { x: number; y: number } {
  let x = clampAxis(cp.x);
  let y = clampAxis(cp.y);
  const perp = (x - led.position.x) * px + (y - led.position.y) * py;
  if (perp * cp.side < floor) {
    x = clampAxis(x + (cp.side * floor - perp) * px);
    y = clampAxis(y + (cp.side * floor - perp) * py);
  }
  return { x, y };
}

/** Extra bow multiplier for directly-opposite (collinear) LED pairs. */
const BOW_COLLINEAR = 2.2;

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
  bowMin: number;
  bowVar: number;
  /**
   * Minimum magnitude of each control point's offset component perpendicular
   * to the chord. Enforced deterministically (no extra RNG) so every fiber
   * bows off its chord; a worst-case opposing-sign S-curve at the 0.05 floor
   * still deviates ~0.28·0.05 = 0.014 > the 0.01 straightness-test floor.
   */
  perpFloor: number;
}

/** Shape constants interpolated from curviness: 0 = taut arcs, 1 = loopy. */
function shapeParams(curviness: number): ShapeParams {
  return {
    controlMin: lerp(0.3, 0.38, curviness),
    controlRange: lerp(0.12, 0.47, curviness),
    bowMin: lerp(0.04, 0.12, curviness),
    bowVar: lerp(0.04, 0.33, curviness),
    perpFloor: lerp(0.05, 0.1, curviness),
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
 * One greedy matching attempt: walk a fresh shuffle, pair each unpaired LED
 * with a weighted-random partner on a different edge. Returns null on a
 * dead end (all remaining unpaired LEDs share the current LED's edge).
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
      if (leds[j].side !== leds[i].side) candidates.push(j);
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

interface ControlPoint {
  x: number;
  y: number;
  /** Resolved sign of the offset's perpendicular-to-chord component. */
  side: 1 | -1;
}

/**
 * Build a control point offset from an endpoint by `normal·d + tangent·s`
 * (tangent = normal rotated 90°: (x, y) → (−y, x)), then deterministically
 * set its component perpendicular to the chord (px, py) to
 * `side · max(floor, |current|)`. With no forcedSide the natural sign is
 * kept and only the floor is enforced — this guarantees a visible bow (the
 * normal and tangent terms alone can cancel perpendicular to the chord and
 * collapse the Bézier to a straight line). With forcedSide the offset is
 * mirrored onto that side, keeping its magnitude — used to suppress
 * S-curves at low curviness. No RNG is drawn; seeds stay reproducible.
 */
function controlPoint(
  led: Led,
  d: number,
  s: number,
  px: number,
  py: number,
  floor: number,
  forcedSide?: 1 | -1,
): ControlPoint {
  let ox = led.normal.x * d - led.normal.y * s;
  let oy = led.normal.y * d + led.normal.x * s;
  const perp = ox * px + oy * py;
  const side = forcedSide ?? (perp > 0 || (perp === 0 && s >= 0) ? 1 : -1);
  const desired = side * Math.max(floor, Math.abs(perp));
  ox += (desired - perp) * px;
  oy += (desired - perp) * py;
  return { x: led.position.x + ox, y: led.position.y + oy, side };
}

/**
 * Deterministically generate one frame's fiber layout from a seed and style.
 * Perfect matching (spec 2026-07-04-fiber-perfect-matching): exactly 12
 * fibers, every LED used exactly once, endpoints on different edges,
 * control points bowed so no fiber is straight.
 *
 * Style (spec 2026-07-04-fiber-style-sliders): curviness interpolates the
 * shape constants and gates S-curves; both axes clamp to [0, 1].
 *
 * RNG draw order (stable — saved projects persist seeds and regenerate):
 * per matching attempt one 24-element shuffle then one weighted pick per
 * pair; after matching, per fiber: dA, dB, magA, signDrawA, magB, signDrawB,
 * thickness. Style never changes the number or order of draws, only how
 * they are interpreted — curviness reinterprets the shape draws, randomness
 * reshapes the pick weights.
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
  /** r=0 → 8 (best-score routing), r=0.5 → 1 (today), r=1 → 0.125 (chaos). */
  const exponent = 8 ** (1 - 2 * randomness);
  const shape = shapeParams(curviness);
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
    const coll = collinearity(start, end);
    const boost = 1 + BOW_COLLINEAR * coll * coll;

    const dA = shape.controlMin + rnd() * shape.controlRange;
    const dB = shape.controlMin + rnd() * shape.controlRange;
    const magA = (shape.bowMin + rnd() * shape.bowVar) * boost;
    const signDrawA = rnd();
    const magB = (shape.bowMin + rnd() * shape.bowVar) * boost;
    const signDrawB = rnd();

    // Chord unit and its perpendicular; all bow geometry lives in this frame.
    const cx = end.position.x - start.position.x;
    const cy = end.position.y - start.position.y;
    const clen = Math.hypot(cx, cy) || 1;
    const px = -cy / clen;
    const py = cx / clen;

    // Side of the chord facing the square's center — the side with room.
    const mx = (start.position.x + end.position.x) / 2;
    const my = (start.position.y + end.position.y) / 2;
    const interiorSide: 1 | -1 =
      (0.5 - mx) * px + (0.5 - my) * py >= 0 ? 1 : -1;

    // signDrawB's sign bit and its re-expanded fraction are independent
    // uniforms: the bit picks sB's tangent sign, the fraction gates
    // S-curves. With probability `curviness` the natural chord sides are
    // kept (S-curves possible, today's behavior); otherwise both control
    // points are forced to the interior side — a clean C-arc.
    const sA = (signDrawA < 0.5 ? -1 : 1) * magA;
    const sB = (signDrawB < 0.5 ? -1 : 1) * magB;
    const sGate = signDrawB < 0.5 ? signDrawB * 2 : signDrawB * 2 - 1;
    const forcedSide = sGate < curviness ? undefined : interiorSide;

    const cpA = controlPoint(
      start,
      dA,
      sA,
      px,
      py,
      shape.perpFloor,
      forcedSide,
    );
    const cpB = controlPoint(end, dB, sB, px, py, shape.perpFloor, forcedSide);
    const p1 = containControlPoint(start, cpA, px, py, shape.perpFloor);
    const p2 = containControlPoint(end, cpB, px, py, shape.perpFloor);
    const path = sampleCubicBezier(
      start.position,
      p1,
      p2,
      end.position,
      FIBER_SAMPLES,
    );
    const thickness = 0.85 + rnd() * 0.5;

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
