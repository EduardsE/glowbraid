import {
  countCrossings,
  FIBER_SAMPLES,
  polylineLength,
  sampleCubicBezier,
} from "./geometry";
import { buildLeds } from "./leds";
import { createRng, type Rng } from "./random";
import type { Fiber, Frame, Led } from "./types";

/** Every LED feeds exactly one fiber end: 24 LEDs → 12 fibers. */
export const FIBERS_PER_FRAME = 12;
/** Whole-matching restart budget before the arbitrary-pairing fallback. */
export const MAX_MATCHING_RESTARTS = 20;

const CONTROL_MIN = 0.34;
const CONTROL_RANGE = 0.42;

/**
 * Tangential bow of the control points. BOW_MIN/BOW_VAR set the drawn bow
 * magnitude and the collinear multiplier grows it for directly-opposite LEDs.
 * The drawn bow alone does NOT guarantee visible curvature: because the
 * control-point offset is `normal·d + tangent·s` with d and s independent,
 * the two terms can cancel out the component perpendicular to the fiber's
 * chord, collapsing the Bézier to a straight line. Straightness is instead
 * guaranteed by PERP_FLOOR below, applied deterministically after the draws.
 */
const BOW_MIN = 0.09;
const BOW_VAR = 0.1;
const BOW_COLLINEAR = 2.2;

/**
 * Minimum magnitude of each control point's offset component perpendicular to
 * the chord. Enforced deterministically (no extra RNG) so every fiber bows
 * off its chord; a worst-case opposing-sign S-curve at this floor still
 * deviates ~0.28·PERP_FLOOR ≈ 0.022 > the 0.01 straightness-test floor.
 */
const PERP_FLOOR = 0.08;

/** Soft-scoring penalty for near-collinear pairs; keeps score positive. */
const COLLINEAR_PENALTY = 0.7;

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
function tryMatchOnce(leds: Led[], rnd: Rng): Array<[number, number]> | null {
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
    const weights = candidates.map((j) => pairScore(leds[i], leds[j]));
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

/** Signed tangential control-point offset; magnitude grows with collinearity. */
function bowOffset(rnd: Rng, coll: number): number {
  const magnitude =
    (BOW_MIN + rnd() * BOW_VAR) * (1 + BOW_COLLINEAR * coll * coll);
  return rnd() < 0.5 ? -magnitude : magnitude;
}

/**
 * Build a control point offset from an endpoint by `normal·d + tangent·s`
 * (tangent = normal rotated 90°: (x, y) → (−y, x)), then deterministically
 * push it perpendicular to the chord (px, py) until that component clears
 * PERP_FLOOR. The endpoint itself never moves — only the control point — and
 * no RNG is drawn, so seeds stay reproducible. This is what actually
 * guarantees a visible bow: without it, d and s can cancel the perpendicular
 * component and the Bézier degenerates to a straight line.
 */
function controlPoint(
  led: Led,
  d: number,
  s: number,
  px: number,
  py: number,
): { x: number; y: number } {
  let ox = led.normal.x * d - led.normal.y * s;
  let oy = led.normal.y * d + led.normal.x * s;
  const perp = ox * px + oy * py;
  if (Math.abs(perp) < PERP_FLOOR) {
    // Keep the intended bow direction (fall back to the drawn sign of s when
    // the current perpendicular component is exactly zero).
    const sign = perp > 0 || (perp === 0 && s >= 0) ? 1 : -1;
    const deficit = sign * PERP_FLOOR - perp;
    ox += deficit * px;
    oy += deficit * py;
  }
  return { x: led.position.x + ox, y: led.position.y + oy };
}

/**
 * Deterministically generate one frame's fiber layout from a seed.
 * Perfect matching (spec 2026-07-04-fiber-perfect-matching): exactly 12
 * fibers, every LED used exactly once, endpoints on different edges,
 * control points bowed tangentially so no fiber is straight.
 *
 * RNG draw order (stable — saved projects persist seeds and regenerate):
 * per matching attempt one 24-element shuffle then one weighted pick per
 * pair; after matching, per fiber: dA, dB, bowA magnitude, bowA sign,
 * bowB magnitude, bowB sign, thickness.
 */
export function generateFrame(seed: number): Frame {
  const rnd = createRng(seed);
  const leds = buildLeds();

  let pairs: Array<[number, number]> | null = null;
  for (
    let attempt = 0;
    pairs === null && attempt < MAX_MATCHING_RESTARTS;
    attempt++
  ) {
    pairs = tryMatchOnce(leds, rnd);
  }
  if (pairs === null) pairs = fallbackPairs(leds.length, rnd);

  const fibers: Fiber[] = pairs.map(([startIndex, endIndex], f) => {
    const start = leds[startIndex];
    const end = leds[endIndex];
    const coll = collinearity(start, end);

    const dA = CONTROL_MIN + rnd() * CONTROL_RANGE;
    const dB = CONTROL_MIN + rnd() * CONTROL_RANGE;
    const sA = bowOffset(rnd, coll);
    const sB = bowOffset(rnd, coll);

    // Chord unit and its perpendicular; used to floor each control point's
    // perpendicular-to-chord offset so the Bézier can never go straight.
    const cx = end.position.x - start.position.x;
    const cy = end.position.y - start.position.y;
    const clen = Math.hypot(cx, cy) || 1;
    const px = -cy / clen;
    const py = cx / clen;

    const p1 = controlPoint(start, dA, sA, px, py);
    const p2 = controlPoint(end, dB, sB, px, py);
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
