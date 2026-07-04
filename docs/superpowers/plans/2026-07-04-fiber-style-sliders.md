# Fiber Style Sliders (Curviness + Randomness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two 0–1 sliders — Curviness (fiber shape: taut C-arcs → loopy S-curves) and Randomness (routing: orderly → chaotic) — plus an unconditional guarantee that fibers never leave the frame.

**Architecture:** `generateFrame(seed, style?)` gains a `FiberStyle` parameter that interpolates the existing shape constants and sharpens/flattens the matcher's weighted pick. Control points are clamped into the unit square after all RNG draws (Bézier convex-hull property ⇒ containment). Style lives in `StudioState`, is persisted in `ProjectSnapshot`, and slider moves rebuild the wall from the *existing* seeds.

**Tech Stack:** TypeScript, React 19, Vitest, Biome. Package manager: `pnpm`.

**Spec:** `docs/superpowers/specs/2026-07-04-fiber-style-sliders-design.md`

## Global Constraints

- Same `(seed, style)` → identical frame, always (single `createRng(seed)` stream).
- RNG draw order and count are unchanged from today: per matching attempt one 24-element shuffle + one weighted pick per pair; per fiber exactly 7 draws in order `dA, dB, magA, signDrawA, magB, signDrawB, thickness`. Low curviness reinterprets draws; it never skips them.
- Perfect-matching invariants hold at every style: exactly 12 fibers, every LED used once, endpoints on different edges, no straight fibers (max chord deviation > 0.01).
- Style axes are clamped to [0, 1] inside `generateFrame`; NaN/±∞ fall back to 0.5.
- Both sliders default to 0.5. Legacy saves (no style fields) load as 0.5/0.5.
- Containment is unconditional: every sampled path point stays inside the unit square at every style value.
- Biome, 2-space indent. Run `pnpm check` before each commit.
- Tests: `pnpm vitest run <file>` for one file, `pnpm test` for the suite.

---

### Task 1: Engine — `FiberStyle` API + curviness shape mapping

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/fibers.ts`
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: existing `generateFrame`, `createRng`, `buildLeds`, geometry helpers.
- Produces: `interface FiberStyle { curviness: number; randomness: number }` (in `types.ts`), `DEFAULT_FIBER_STYLE: FiberStyle` (exported from `fibers.ts`), and `generateFrame(seed: number, style?: FiberStyle): Frame`. Later tasks rely on these exact names.

**Design notes for this task:**
- Curviness `c` interpolates the shape constants (taut at 0, loopy at 1):
  `controlMin = lerp(0.30, 0.38, c)`, `controlRange = lerp(0.12, 0.47, c)`, `bowMin = lerp(0.04, 0.12, c)`, `bowVar = lerp(0.04, 0.33, c)`, `perpFloor = lerp(0.05, 0.10, c)`.
- S-curve suppression: each fiber gets an "interior side" — the side of its chord facing the square's center. The second sign draw `rB` supplies two independent uniforms (its sign bit, and its re-expanded fraction `rB < 0.5 ? rB*2 : rB*2−1`). The fraction gates S-curves: with probability `c` the control points keep their natural chord sides (S possible, as today); otherwise both are forced to the interior side (clean C-arc). At `c = 1` the gate always passes → today's behavior; at `c = 0` it never does → no S-curves. Forcing toward the *interior* side (not A's natural side) is deliberate: it's the side with room, which Task 2's clamping relies on.
- `controlPoint` gains `floor` and optional `forcedSide` parameters and returns its resolved side. `randomness` is accepted and sanitized in this task but not yet used (Task 3).

- [ ] **Step 1: Add `FiberStyle` to `src/engine/types.ts`**

Insert after the `Frame` interface (before `WallConfig`):

```ts
/** User-tunable fiber generation style; both axes 0–1. */
export interface FiberStyle {
  /** 0 = taut gentle C-arcs, 1 = big loopy sweeps with S-curves */
  curviness: number;
  /** 0 = orderly best-score routing, 1 = near-uniform chaotic routing */
  randomness: number;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `src/engine/__tests__/fibers.test.ts`. Extend the import from `../fibers` to include `DEFAULT_FIBER_STYLE`, and add `import type { FiberStyle } from "../types";`. Add this helper next to `maxChordDeviation`:

```ts
/** Signed perpendicular distance of each path point from the endpoint chord. */
function signedDeviations(path: Point[]): number[] {
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return path.map((p) => ((p.x - a.x) * dy - (p.y - a.y) * dx) / len);
}
```

Add a new describe block:

```ts
describe("generateFrame with FiberStyle", () => {
  const TAUT: FiberStyle = { curviness: 0, randomness: 0.5 };

  it("defaults match DEFAULT_FIBER_STYLE exactly", () => {
    expect(DEFAULT_FIBER_STYLE).toEqual({ curviness: 0.5, randomness: 0.5 });
    expect(generateFrame(7431)).toEqual(generateFrame(7431, DEFAULT_FIBER_STYLE));
  });

  it("is deterministic per (seed, style)", () => {
    const style: FiberStyle = { curviness: 0.3, randomness: 0.8 };
    expect(generateFrame(7431, style)).toEqual(generateFrame(7431, style));
  });

  it("changing curviness changes fiber paths", () => {
    const a = generateFrame(7431, { curviness: 0, randomness: 0.5 });
    const b = generateFrame(7431, { curviness: 1, randomness: 0.5 });
    expect(a.fibers.map((f) => f.path)).not.toEqual(b.fibers.map((f) => f.path));
  });

  it("clamps out-of-range style values to the extremes", () => {
    expect(generateFrame(5, { curviness: -1, randomness: 2 })).toEqual(
      generateFrame(5, { curviness: 0, randomness: 1 }),
    );
  });

  it("falls back to defaults for non-finite style values", () => {
    expect(
      generateFrame(5, { curviness: Number.NaN, randomness: Number.NaN }),
    ).toEqual(generateFrame(5));
  });

  it("no straight fibers at curviness 0 (seeds 1-200)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const frame = generateFrame(seed, TAUT);
      for (const fiber of frame.fibers) {
        expect(maxChordDeviation(fiber.path)).toBeGreaterThan(0.01);
      }
    }
  });

  it("no S-curves at curviness 0: paths stay on one side of their chord (seeds 1-200)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const frame = generateFrame(seed, TAUT);
      for (const fiber of frame.fibers) {
        const devs = signedDeviations(fiber.path);
        const extreme = devs.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0);
        const side = Math.sign(extreme) || 1;
        for (const d of devs) {
          expect(d * side).toBeGreaterThan(-0.005);
        }
      }
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/engine/__tests__/fibers.test.ts`
Expected: FAIL — `DEFAULT_FIBER_STYLE` is not exported, and `generateFrame` ignores its second argument (TS build error / equality failures).

- [ ] **Step 4: Implement in `src/engine/fibers.ts`**

Replace the file's constants and generation code so the whole file reads:

```ts
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
};

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
 * they are interpreted.
 */
export function generateFrame(
  seed: number,
  style: FiberStyle = DEFAULT_FIBER_STYLE,
): Frame {
  const curviness = sanitizeAxis(
    style.curviness,
    DEFAULT_FIBER_STYLE.curviness,
  );
  const shape = shapeParams(curviness);
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

    const cpA = controlPoint(start, dA, sA, px, py, shape.perpFloor, forcedSide);
    const cpB = controlPoint(end, dB, sB, px, py, shape.perpFloor, forcedSide);
    const path = sampleCubicBezier(
      start.position,
      { x: cpA.x, y: cpA.y },
      { x: cpB.x, y: cpB.y },
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
```

Note: `style.randomness` is intentionally unused until Task 3 — do not add a
`sanitizeAxis` call for it yet (Biome flags unused values).

- [ ] **Step 5: Run the full engine test file**

Run: `pnpm vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS — all new tests and all pre-existing tests (the old suite calls `generateFrame(seed)` which now uses the default style; its assertions are property-based, not golden).

If the "no S-curves at curviness 0" test fails on specific seeds, the cause is a control point whose natural geometry fights the interior side after mirroring — report the failing seed rather than loosening the tolerance; the constants in `shapeParams` are the tuning surface.

- [ ] **Step 6: Run the whole suite and Biome**

Run: `pnpm test && pnpm check`
Expected: PASS / no diagnostics. (`wall.test.ts`, `leds.test.ts` etc. must be unaffected.)

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/fibers.ts src/engine/__tests__/fibers.test.ts
git commit -m "feat(engine): FiberStyle parameter — curviness shape mapping and S-curve gating"
```

---

### Task 2: Engine — unconditional containment (out-of-frame fix)

**Files:**
- Modify: `src/engine/fibers.ts`
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: Task 1's `generateFrame(seed, style?)`, `ControlPoint`, `shapeParams`.
- Produces: no API change — behavioral guarantee only (every path point inside the unit square at every style).

- [ ] **Step 1: Write the failing test**

Add inside the `describe("generateFrame with FiberStyle", ...)` block:

```ts
const STYLE_EXTREMES: FiberStyle[] = [
  { curviness: 0, randomness: 0 },
  { curviness: 0, randomness: 1 },
  { curviness: 1, randomness: 0 },
  { curviness: 1, randomness: 1 },
  { curviness: 0.5, randomness: 0.5 },
];

it("every path point stays inside the frame at all style extremes (seeds 1-100)", () => {
  for (const style of STYLE_EXTREMES) {
    for (let seed = 1; seed <= 100; seed++) {
      const frame = generateFrame(seed, style);
      for (const fiber of frame.fibers) {
        for (const p of fiber.path) {
          expect(p.x).toBeGreaterThanOrEqual(-1e-9);
          expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(-1e-9);
          expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/__tests__/fibers.test.ts`
Expected: FAIL — at `curviness: 1` large bows push control points (and thus path points) outside [0, 1].

- [ ] **Step 3: Implement containment in `src/engine/fibers.ts`**

Add below the `DEFAULT_FIBER_STYLE` export:

```ts
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
```

In `generateFrame`, replace the two lines building the Bézier inputs:

```ts
    const cpA = controlPoint(start, dA, sA, px, py, shape.perpFloor, forcedSide);
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
```

- [ ] **Step 4: Run the engine test file**

Run: `pnpm vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS — containment, and the Task 1 straightness/one-sidedness tests still green (containment runs after all draws; determinism unaffected).

- [ ] **Step 5: Run the whole suite and Biome**

Run: `pnpm test && pnpm check`
Expected: PASS / no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/engine/fibers.ts src/engine/__tests__/fibers.test.ts
git commit -m "fix(engine): clamp control points into the frame — fibers can no longer exit"
```

---

### Task 3: Engine — randomness slider (matcher pick exponent)

**Files:**
- Modify: `src/engine/fibers.ts`
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: Task 1's `generateFrame(seed, style?)`, `tryMatchOnce`, `pairScore`, `sanitizeAxis`.
- Produces: no API change — `style.randomness` now affects pairing.

**Design note:** candidate weights become `pairScore ** exponent` with `exponent = 8 ** (1 − 2·randomness)`: r = 0 → 8 (walk almost always takes the best-scoring partner), r = 0.5 → 1 (**exactly today's behavior** — default-style pairings are unchanged), r = 1 → 0.125 (near-uniform). Scores are strictly positive (`COLLINEAR_PENALTY < 1`), so the exponent is always well-defined.

- [ ] **Step 1: Write the failing tests**

Add inside the `describe("generateFrame with FiberStyle", ...)` block:

```ts
it("changing randomness changes the pairing for some seeds", () => {
  const pairsAt = (r: number) =>
    Array.from({ length: 20 }, (_, i) =>
      generateFrame(i + 1, { curviness: 0.5, randomness: r }).fibers.map(
        (f) => [f.startLedIndex, f.endLedIndex],
      ),
    );
  expect(pairsAt(0)).not.toEqual(pairsAt(1));
});

it("matching invariants hold at randomness extremes (seeds 1-50)", () => {
  for (const randomness of [0, 1]) {
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed, { curviness: 0.5, randomness });
      const used = frame.fibers
        .flatMap((f) => [f.startLedIndex, f.endLedIndex])
        .sort((x, y) => x - y);
      expect(used).toEqual(Array.from({ length: LEDS_PER_FRAME }, (_, i) => i));
      for (const fiber of frame.fibers) {
        expect(frame.leds[fiber.startLedIndex].side).not.toBe(
          frame.leds[fiber.endLedIndex].side,
        );
      }
    }
  }
});
```

- [ ] **Step 2: Run tests to verify the first fails**

Run: `pnpm vitest run src/engine/__tests__/fibers.test.ts`
Expected: "changing randomness changes the pairing" FAILS (randomness is currently ignored); the invariants test may already pass — that's fine, it's the regression guard.

- [ ] **Step 3: Implement**

In `src/engine/fibers.ts`, change `tryMatchOnce` to accept the exponent — signature and the one changed line:

```ts
function tryMatchOnce(
  leds: Led[],
  rnd: Rng,
  exponent: number,
): Array<[number, number]> | null {
```

```ts
    const weights = candidates.map((j) => pairScore(leds[i], leds[j]) ** exponent);
```

In `generateFrame`, sanitize randomness next to curviness and derive the exponent, then pass it:

```ts
  const randomness = sanitizeAxis(
    style.randomness,
    DEFAULT_FIBER_STYLE.randomness,
  );
  /** r=0 → 8 (best-score routing), r=0.5 → 1 (today), r=1 → 0.125 (chaos). */
  const exponent = 8 ** (1 - 2 * randomness);
```

```ts
    pairs = tryMatchOnce(leds, rnd, exponent);
```

Also extend the RNG draw-order doc comment's style sentence to: "Style never changes the number or order of draws, only how they are interpreted — curviness reinterprets the shape draws, randomness reshapes the pick weights."

- [ ] **Step 4: Run the engine test file**

Run: `pnpm vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS — including all Task 1/2 tests (default `randomness: 0.5` gives exponent 1, so default-style output is byte-identical to before this task).

- [ ] **Step 5: Run the whole suite and Biome**

Run: `pnpm test && pnpm check`
Expected: PASS / no diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/engine/fibers.ts src/engine/__tests__/fibers.test.ts
git commit -m "feat(engine): randomness slider axis — matcher pick exponent"
```

---

### Task 4: Engine — `generateWall` forwards style

**Files:**
- Modify: `src/engine/types.ts` (WallConfig)
- Modify: `src/engine/wall.ts`
- Test: `src/engine/__tests__/wall.test.ts`

**Interfaces:**
- Consumes: `generateFrame(seed, style?)`, `FiberStyle`.
- Produces: `WallConfig` gains optional `style?: FiberStyle`; `generateWall({ gridSize, frameSeeds, style })` forwards it to every frame. Task 5 relies on this exact field name.

- [ ] **Step 1: Write the failing test**

Add to `src/engine/__tests__/wall.test.ts` (extend imports: `generateFrame` from `../fibers`, `import type { FiberStyle } from "../types";`):

```ts
it("forwards style to every frame", () => {
  const style: FiberStyle = { curviness: 0.1, randomness: 0.9 };
  const frameSeeds = deriveFrameSeeds(7431, 4);
  const frames = generateWall({ gridSize: 2, frameSeeds, style });
  frames.forEach((frame, i) => {
    expect(frame).toEqual(generateFrame(frameSeeds[i], style));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/__tests__/wall.test.ts`
Expected: FAIL — TS error: `style` is not a property of `WallConfig` (and/or deep-equality failure).

- [ ] **Step 3: Implement**

`src/engine/types.ts` — extend `WallConfig`:

```ts
export interface WallConfig {
  gridSize: number;
  frameSeeds: number[];
  /** Omitted → DEFAULT_FIBER_STYLE. */
  style?: FiberStyle;
}
```

`src/engine/wall.ts` — forward it:

```ts
export function generateWall(config: WallConfig): Frame[] {
  return config.frameSeeds.map((seed) => generateFrame(seed, config.style));
}
```

(`generateFrame`'s default parameter handles `undefined`.)

- [ ] **Step 4: Run tests and Biome**

Run: `pnpm test && pnpm check`
Expected: PASS / no diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/wall.ts src/engine/__tests__/wall.test.ts
git commit -m "feat(engine): generateWall forwards FiberStyle"
```

---

### Task 5: UI + persistence — sliders, state, snapshot

**Files:**
- Modify: `src/engine/types.ts` (ProjectSnapshot)
- Modify: `src/components/filament/LeftPanel.tsx`
- Modify: `src/components/filament/FilamentStudio.tsx`

**Interfaces:**
- Consumes: `FiberStyle`, `DEFAULT_FIBER_STYLE`, `generateFrame(seed, style)`, `generateWall({ ..., style })`.
- Produces: `LeftPanelProps` gains `curviness: number; randomness: number; onCurviness: (v: number) => void; onRandomness: (v: number) => void`. `ProjectSnapshot` gains `curviness: number; randomness: number`.

There are no component tests in this repo; verification for this task is the existing suite + `pnpm check` + `pnpm build` + the manual smoke test in Task 6.

- [ ] **Step 1: Extend `ProjectSnapshot` in `src/engine/types.ts`**

Add two fields after `palette`:

```ts
  palette: PaletteId;
  /** FiberStyle axes, 0–1. Absent in legacy saves → loader defaults to 0.5. */
  curviness: number;
  randomness: number;
  mode: "edit" | "sim";
```

- [ ] **Step 2: Add the sliders to `src/components/filament/LeftPanel.tsx`**

Extend the props interface (after `onFrameSize`):

```ts
  curviness: number;
  onCurviness: (v: number) => void;
  randomness: number;
  onRandomness: (v: number) => void;
```

Insert directly after the "12 fibre runs / frame" info card `</div>` and before the `<div className="mt-1 flex flex-col gap-2">` button block:

```tsx
      <SliderRow label="Curviness" value={`${Math.round(props.curviness * 100)}%`}>
        <input
          type="range"
          aria-label="Curviness"
          min={0}
          max={1}
          step={0.01}
          value={props.curviness}
          onChange={(e) => props.onCurviness(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Randomness" value={`${Math.round(props.randomness * 100)}%`}>
        <input
          type="range"
          aria-label="Randomness"
          min={0}
          max={1}
          step={0.01}
          value={props.randomness}
          onChange={(e) => props.onRandomness(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>
```

- [ ] **Step 3: Wire state and regeneration in `src/components/filament/FilamentStudio.tsx`**

3a. Imports — extend the engine imports:

```ts
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
```

and add `FiberStyle` to the `@/engine/types` type import list.

3b. State — add to `StudioState` (after `frameSize`):

```ts
  curviness: number;
  randomness: number;
```

and to `INITIAL_STATE`:

```ts
  curviness: DEFAULT_FIBER_STYLE.curviness,
  randomness: DEFAULT_FIBER_STYLE.randomness,
```

3c. Helpers — add above `FilamentStudio`:

```ts
function styleOf(s: { curviness: number; randomness: number }): FiberStyle {
  return { curviness: s.curviness, randomness: s.randomness };
}

/** Loader sanitizer: legacy/hand-edited snapshots → finite 0–1 or 0.5. */
function styleAxis(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}
```

3d. `rebuild` — style becomes an explicit parameter (keep the empty deps array):

```ts
  const rebuild = useCallback(
    (
      gridSize: number,
      masterSeed: number,
      style: FiberStyle,
      seeds?: number[],
    ) => {
      const count = gridSize * gridSize;
      seedsRef.current =
        seeds && seeds.length === count
          ? seeds
          : deriveFrameSeeds(masterSeed, count);
      framesRef.current = generateWall({
        gridSize,
        frameSeeds: seedsRef.current,
        style,
      });
    },
    [],
  );
```

3e. Showcase — in `draw()`, pass the live style so the empty-state preview follows the sliders:

```ts
      if (!showcaseRef.current) {
        showcaseRef.current = generateFrame(2024, styleOf(s));
      }
```

3f. Existing handlers — update every `rebuild` call site to pass the style, and `handleReseed` to pass it to `generateFrame`:

```ts
  const handleGridSize = (n: number) => {
    rebuild(n, ui.masterSeed, styleOf(ui));
    patch({ gridSize: n, selectedFrame: null, selectedFiber: null });
  };
  const handleReroute = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({ masterSeed: seed });
  };
  const handleGenerate = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
      empty: false,
      selectedFrame: null,
      selectedFiber: null,
    });
  };
  const handleReseed = () => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const seed = randomSeed();
    seedsRef.current[s.selectedFrame] = seed;
    framesRef.current[s.selectedFrame] = generateFrame(seed, styleOf(s));
    patch({ selectedFiber: null });
  };
```

3g. New style handler — add after `handleReseed`. Slider moves rebuild from the **existing** seeds (wall reshapes in place; selection survives because indices are untouched) and invalidate the cached showcase frame:

```ts
  const handleStyle = (partial: Partial<FiberStyle>) => {
    const s = uiRef.current;
    const style = { ...styleOf(s), ...partial };
    if (!s.empty) {
      rebuild(s.gridSize, s.masterSeed, style, seedsRef.current);
    }
    showcaseRef.current = null;
    patch(partial);
  };
```

3h. Save — add both fields to the snapshot in `handleSave`:

```ts
      palette: s.palette,
      curviness: s.curviness,
      randomness: s.randomness,
      mode: s.mode,
```

3i. Load — in `handleLoad`, sanitize and use the loaded style (insert after the `gridSize` sanitization; update the `rebuild` call and `patch`):

```ts
    const curviness = styleAxis(d.curviness);
    const randomness = styleAxis(d.randomness);
    rebuild(gridSize, d.masterSeed, { curviness, randomness }, d.seeds);
    patch({
      gridSize,
      frameSize: d.frameSize,
      masterSeed: d.masterSeed,
      curviness,
      randomness,
      anim,
      speed: d.speed,
      brightness: d.brightness,
      palette,
      mode: d.mode ?? "sim",
      empty: false,
      selectedFrame: null,
      selectedFiber: null,
    });
```

3j. Render — pass the new props to `LeftPanel` (after `onFrameSize`):

```tsx
          curviness={ui.curviness}
          onCurviness={(v) => handleStyle({ curviness: v })}
          randomness={ui.randomness}
          onRandomness={(v) => handleStyle({ randomness: v })}
```

- [ ] **Step 4: Verify types, tests, lint, build**

Run: `pnpm test && pnpm check && pnpm build`
Expected: tests PASS, no Biome diagnostics, build succeeds (build is the type-safety gate for the .tsx changes — there is no separate tsc script).

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/components/filament/LeftPanel.tsx src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): curviness and randomness sliders — persisted, reshape wall in place"
```

---

### Task 6: End-to-end verification

**Files:** none modified — this task drives the app.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` (port 3000, background).

- [ ] **Step 2: Manual smoke test in the browser** (use Playwright tools if running agentically)

1. Open `http://localhost:3000`. Empty state: showcase frame renders; dragging Curviness to 0 visibly relaxes the showcase into gentle one-sided arcs (cache invalidation works before generating).
2. Generate a wall. Drag **Curviness** 0 → 100: fibers morph from taut C-arcs to loopy curves; LED pairings do not change while dragging; no fiber ever pokes outside any frame border, especially at 100.
3. Drag **Randomness** 0 → 100: routing changes (orderly long chords → chaotic mix); wall reshapes in place without a full re-roll.
4. Select a frame: inspector map reflects the current slider values; "Re-seed" produces a new layout at the current style.
5. Save → move both sliders → Load: sliders and wall return to the saved values.
6. Legacy-save check: in devtools run `const p = JSON.parse(localStorage.getItem("filament.project")); delete p.curviness; delete p.randomness; localStorage.setItem("filament.project", JSON.stringify(p));` then Load → sliders read 50% and the wall renders.

- [ ] **Step 3: Full suite once more**

Run: `pnpm test && pnpm check`
Expected: PASS / no diagnostics.

- [ ] **Step 4: Update the spec status**

In `docs/superpowers/specs/2026-07-04-fiber-style-sliders-design.md`, change `Status: Approved (pending implementation)` to `Status: Implemented`.

```bash
git add docs/superpowers/specs/2026-07-04-fiber-style-sliders-design.md
git commit -m "docs: mark fiber style sliders spec implemented"
```
