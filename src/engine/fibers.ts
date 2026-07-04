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
 * Tangential bow of the control points. BOW_MIN guarantees every fiber
 * visibly curves (straightness test floor 0.01); the collinear multiplier
 * kicks in when the chord runs parallel to the endpoint normals (directly
 * opposite LEDs), where the plain normal offsets would degenerate to a
 * straight line. Tuned visually in Task 3.
 */
const BOW_MIN = 0.09;
const BOW_VAR = 0.1;
const BOW_COLLINEAR = 2.2;

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

    // Tangent = normal rotated 90°: (x, y) → (−y, x). Sign is random via s.
    const p1 = {
      x: start.position.x + start.normal.x * dA - start.normal.y * sA,
      y: start.position.y + start.normal.y * dA + start.normal.x * sA,
    };
    const p2 = {
      x: end.position.x + end.normal.x * dB - end.normal.y * sB,
      y: end.position.y + end.normal.y * dB + end.normal.x * sB,
    };
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
