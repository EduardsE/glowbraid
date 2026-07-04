# Fiber Perfect-Matching Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace random fiber endpoint picking with a perfect matching — every frame has exactly 12 fibers, every LED exactly one fiber end, and no fiber renders as a straight line.

**Architecture:** `generateFrame(seed)` builds a greedy randomized perfect matching over the 24 LEDs (seeded shuffle → weighted partner pick → bounded restarts → arbitrary-pairing fallback), then routes each fiber as a cubic Bézier whose control points get a tangential "bow" offset that grows for near-collinear (directly opposite) pairs. The density slider and `fiberDensity` field are removed everywhere.

**Tech Stack:** TypeScript, React, Vitest, Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-fiber-perfect-matching-design.md`

## Global Constraints

- `FIBERS_PER_FRAME = 12`; every LED index 0–23 appears exactly once per frame across fiber endpoints.
- Generation is fully deterministic from the seed (single `createRng(seed)` stream, fixed draw order).
- Hard constraint: fiber endpoints on different edges (`side` differs). Only the unreachable fallback may violate it; the generator never throws and never loops forever (restart bound 20).
- Old saves must load without migration: the loader must simply not read `fiberDensity`.
- Kept per-fiber draws: `d ∈ [0.34, 0.76)`, thickness `0.85 + rnd()·0.5`, `hueBase = (start.u + end.u)/2`, 38-sample Bézier path.
- Commands: `npm run test` (vitest run), `npm run check` (biome). Test single file: `npx vitest run <path>`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Repo has unrelated uncommitted changes — `git add` only the files named in each task, never `git add -A`.

---

### Task 1: Engine — perfect matching + curvature

**Files:**
- Modify: `src/engine/fibers.ts` (full rewrite of generation)
- Modify: `src/engine/wall.ts:12-16` (drop density param)
- Modify: `src/engine/types.ts:44-48` (WallConfig loses `fiberDensity`)
- Test: `src/engine/__tests__/fibers.test.ts` (full rewrite)
- Test: `src/engine/__tests__/wall.test.ts` (drop density usage)

**Interfaces:**
- Consumes: `buildLeds()`, `LEDS_PER_FRAME` from `./leds`; `createRng`, `Rng` from `./random`; `sampleCubicBezier`, `polylineLength`, `countCrossings`, `FIBER_SAMPLES` from `./geometry` — all unchanged.
- Produces: `generateFrame(seed: number): Frame` (density parameter GONE), `FIBERS_PER_FRAME = 12`, `MAX_MATCHING_RESTARTS = 20` from `src/engine/fibers.ts`; `WallConfig` is now `{ gridSize: number; frameSeeds: number[] }`; `generateWall(config: WallConfig): Frame[]` unchanged in name/return. Task 2 relies on exactly these signatures.

**Note:** After this task, `src/components/filament/FilamentStudio.tsx` has TypeScript errors (extra argument to `generateFrame`, excess `fiberDensity` property) until Task 2 removes them. Nothing breaks at runtime — `npm run build` (vite) and vitest don't typecheck — but do not run `tsc` between tasks and expect it clean.

- [ ] **Step 1: Rewrite the test file with failing tests**

Replace the entire contents of `src/engine/__tests__/fibers.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { FIBERS_PER_FRAME, generateFrame } from "../fibers";
import { FIBER_SAMPLES } from "../geometry";
import { LEDS_PER_FRAME } from "../leds";
import type { Point } from "../types";

/** Max perpendicular distance from the path's points to its endpoint chord. */
function maxChordDeviation(path: Point[]): number {
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let max = 0;
  for (const p of path) {
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    if (d > max) max = d;
  }
  return max;
}

describe("generateFrame", () => {
  it("is deterministic: same seed produces identical frames", () => {
    expect(generateFrame(7431)).toEqual(generateFrame(7431));
  });

  it("different seeds produce different layouts", () => {
    const a = generateFrame(1);
    const b = generateFrame(2);
    expect(a.fibers.map((f) => f.path)).not.toEqual(
      b.fibers.map((f) => f.path),
    );
  });

  it("produces exactly FIBERS_PER_FRAME fibers", () => {
    expect(FIBERS_PER_FRAME).toBe(12);
    expect(generateFrame(7431).fibers).toHaveLength(FIBERS_PER_FRAME);
  });

  it("perfect matching: every LED appears exactly once (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed);
      const used = frame.fibers
        .flatMap((f) => [f.startLedIndex, f.endLedIndex])
        .sort((x, y) => x - y);
      expect(used).toEqual(
        Array.from({ length: LEDS_PER_FRAME }, (_, i) => i),
      );
    }
  });

  it("endpoints lie on different edges (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed);
      for (const fiber of frame.fibers) {
        expect(frame.leds[fiber.startLedIndex].side).not.toBe(
          frame.leds[fiber.endLedIndex].side,
        );
      }
    }
  });

  it("no straight fibers: every path bows off its chord (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed);
      for (const fiber of frame.fibers) {
        expect(maxChordDeviation(fiber.path)).toBeGreaterThan(0.01);
      }
    }
  });

  it("every fiber references two valid LEDs and spans them exactly", () => {
    const frame = generateFrame(2024);
    for (const fiber of frame.fibers) {
      const a = frame.leds[fiber.startLedIndex];
      const b = frame.leds[fiber.endLedIndex];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(fiber.path).toHaveLength(FIBER_SAMPLES);
      expect(fiber.path[0]).toEqual(a.position);
      const last = fiber.path[fiber.path.length - 1];
      expect(last.x).toBeCloseTo(b.position.x, 10);
      expect(last.y).toBeCloseTo(b.position.y, 10);
      expect(fiber.length).toBeGreaterThan(0);
      expect(fiber.thickness).toBeGreaterThanOrEqual(0.85);
      expect(fiber.thickness).toBeLessThan(1.35);
    }
  });

  it("counts crossings deterministically", () => {
    const frame = generateFrame(7431);
    expect(frame.crossings).toBe(generateFrame(7431).crossings);
    expect(frame.crossings).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`
Expected: FAIL — `FIBERS_PER_FRAME` is not exported, and `generateFrame(seed)` without density produces `undefined`-density behavior (`density` param becomes `undefined`, loop runs 0 times → 0 fibers).

- [ ] **Step 3: Rewrite `src/engine/fibers.ts`**

Replace the entire file with:

```typescript
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
const BOW_MIN = 0.05;
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
```

Note the removed exports `MIN_ENDPOINT_DISTANCE` and `MAX_PICK_TRIES` — nothing else imports them (verified).

- [ ] **Step 4: Run the fibers tests to verify they pass**

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS, all 8 tests. If the straightness test fails, raise `BOW_MIN` (e.g. to 0.06) — do not lower the 0.01 test floor.

- [ ] **Step 5: Update `src/engine/types.ts` — WallConfig**

In `src/engine/types.ts`, change:

```typescript
export interface WallConfig {
  gridSize: number;
  fiberDensity: number;
  frameSeeds: number[];
}
```

to:

```typescript
export interface WallConfig {
  gridSize: number;
  frameSeeds: number[];
}
```

(The `ProjectSnapshot.fiberDensity` field is removed in Task 2, not here.)

- [ ] **Step 6: Update `src/engine/wall.ts`**

Change `generateWall` from:

```typescript
export function generateWall(config: WallConfig): Frame[] {
  return config.frameSeeds.map((seed) =>
    generateFrame(seed, config.fiberDensity),
  );
}
```

to:

```typescript
export function generateWall(config: WallConfig): Frame[] {
  return config.frameSeeds.map((seed) => generateFrame(seed));
}
```

- [ ] **Step 7: Update `src/engine/__tests__/wall.test.ts`**

Replace the `generateWall` describe block (keep the `deriveFrameSeeds` block untouched) with:

```typescript
describe("generateWall", () => {
  it("generates one frame per seed with FIBERS_PER_FRAME fibers", () => {
    const frameSeeds = deriveFrameSeeds(7431, 4);
    const frames = generateWall({ gridSize: 2, frameSeeds });
    expect(frames).toHaveLength(4);
    frames.forEach((frame, i) => {
      expect(frame.seed).toBe(frameSeeds[i]);
      expect(frame.fibers).toHaveLength(FIBERS_PER_FRAME);
    });
  });

  it("replacing one frame seed changes only that frame", () => {
    const seeds = deriveFrameSeeds(7431, 4);
    const before = generateWall({ gridSize: 2, frameSeeds: seeds });
    const reseeded = [...seeds];
    reseeded[2] = 12345;
    const after = generateWall({ gridSize: 2, frameSeeds: reseeded });
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);
    expect(after[3]).toEqual(before[3]);
    expect(after[2]).not.toEqual(before[2]);
  });
});
```

And update the imports at the top of the file to:

```typescript
import { describe, expect, it } from "vitest";
import { FIBERS_PER_FRAME } from "../fibers";
import { deriveFrameSeeds, generateWall } from "../wall";
```

- [ ] **Step 8: Run the full engine test suite**

Run: `npx vitest run src/engine`
Expected: PASS — all engine test files (animation, fibers, geometry, leds, light, palettes, random, wall). Only fibers/wall tests changed; the others must not regress.

- [ ] **Step 9: Format and commit**

```bash
npx biome check --write src/engine
git add src/engine/fibers.ts src/engine/wall.ts src/engine/types.ts src/engine/__tests__/fibers.test.ts src/engine/__tests__/wall.test.ts
git commit -m "feat(engine): perfect-matching fiber generation — 12 fibers, one per LED, no straight runs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: UI and persistence — remove the density slider and field

**Files:**
- Modify: `src/components/filament/FilamentStudio.tsx`
- Modify: `src/components/filament/LeftPanel.tsx`
- Modify: `src/engine/types.ts:66-78` (ProjectSnapshot)

**Interfaces:**
- Consumes: `generateFrame(seed: number): Frame`, `FIBERS_PER_FRAME` from `@/engine/fibers`; `WallConfig = { gridSize, frameSeeds }` (Task 1).
- Produces: `LeftPanelProps` without `fiberDensity`/`onFiberDensity`; `ProjectSnapshot` without `fiberDensity`. No downstream task consumes these.

There are no unit tests for these components (canvas-heavy; verified in Task 3 by running the app). Steps below are edit → typecheck-by-lint → visual verification in Task 3.

- [ ] **Step 1: Remove `fiberDensity` from `ProjectSnapshot` in `src/engine/types.ts`**

Change:

```typescript
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
```

to the same interface without the `fiberDensity: number;` line. Old saves keep the key in localStorage; the loader never reads it, so they load unchanged (spec §3).

- [ ] **Step 2: Update `src/components/filament/FilamentStudio.tsx`**

Apply all of the following edits:

1. `StudioState` interface: delete the `fiberDensity: number;` line.
2. `INITIAL_STATE`: delete the `fiberDensity: 16,` line.
3. `rebuild` callback — remove the density parameter:

```typescript
const rebuild = useCallback(
  (gridSize: number, masterSeed: number, seeds?: number[]) => {
    const count = gridSize * gridSize;
    seedsRef.current =
      seeds && seeds.length === count
        ? seeds
        : deriveFrameSeeds(masterSeed, count);
    framesRef.current = generateWall({
      gridSize,
      frameSeeds: seedsRef.current,
    });
  },
  [],
);
```

4. Showcase frame in `draw`: `generateFrame(2024, 18)` → `generateFrame(2024)`.
5. Handlers — delete `handleDensity` entirely and update the others:

```typescript
const handleGridSize = (n: number) => {
  rebuild(n, ui.masterSeed);
  patch({ gridSize: n, selectedFrame: null, selectedFiber: null });
};
const handleReroute = () => {
  const seed = randomSeed();
  rebuild(ui.gridSize, seed);
  patch({ masterSeed: seed });
};
const handleGenerate = () => {
  const seed = randomSeed();
  rebuild(ui.gridSize, seed);
  patch({
    masterSeed: seed,
    empty: false,
    selectedFrame: null,
    selectedFiber: null,
  });
};
```

6. `handleReseed`: `generateFrame(seed, s.fiberDensity)` → `generateFrame(seed)`.
7. `handleSave`: delete the `fiberDensity: s.fiberDensity,` line from the snapshot literal.
8. `handleLoad`: change `rebuild(gridSize, d.fiberDensity, d.masterSeed, d.seeds);` → `rebuild(gridSize, d.masterSeed, d.seeds);` and delete the `fiberDensity: d.fiberDensity,` line from the `patch` call.
9. `<LeftPanel …>` JSX: delete the `fiberDensity={ui.fiberDensity}` and `onFiberDensity={handleDensity}` props.

- [ ] **Step 3: Update `src/components/filament/LeftPanel.tsx`**

1. `LeftPanelProps`: delete `fiberDensity: number;` and `onFiberDensity: (n: number) => void;`.
2. Replace the density `SliderRow` (the whole `<SliderRow label="Fibre runs / frame" …>…</SliderRow>` block) with a static info card styled like the LED card above it:

```tsx
<div className="rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 leading-[1.3]">
  <div className="text-xs text-[#e9eaf0]">12 fibre runs / frame</div>
  <div className="text-[10px] text-[rgba(233,234,240,0.4)]">
    one per LED · fixed
  </div>
</div>
```

- [ ] **Step 4: Verify no `fiberDensity` references remain**

Run: `grep -rn "fiberDensity\|handleDensity\|onFiberDensity" src/`
Expected: no output.

- [ ] **Step 5: Lint, test, commit**

```bash
npx biome check --write src/components/filament src/engine/types.ts
npm run test
```

Expected: biome clean, all tests pass. Then:

```bash
git add src/components/filament/FilamentStudio.tsx src/components/filament/LeftPanel.tsx src/engine/types.ts
git commit -m "feat(ui): remove fibre density slider — fiber count is fixed at 12

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Visual verification and bow tuning

**Files:**
- Possibly modify: `src/engine/fibers.ts` (BOW_MIN / BOW_VAR / BOW_COLLINEAR constants only)

**Interfaces:**
- Consumes: the running app (`npm run dev`, port 3000).
- Produces: final tuned constants; nothing downstream.

- [ ] **Step 1: Run the app and inspect frames**

```bash
npm run dev
```

Open http://localhost:3000 (or drive it with the Playwright MCP browser tools and take screenshots). Click "Generate new wall" several times and check, in both edit and sim mode:

1. No dark LEDs — all 24 sockets per frame feed a fiber (edit mode makes LED dots visible).
2. No straight fibers — especially look for left↔right and top↔bottom runs; they must bow visibly.
3. No fiber looks absurdly loopy or bulges hard against the frame border.
4. The left panel shows the static "12 fibre runs / frame · one per LED · fixed" card and no density slider; "Re-route fibres", "Generate new wall", per-frame reseed, Save and Load all still work. After Save + Load the wall re-renders without errors.

- [ ] **Step 2: Tune if needed**

If fibers look too straight, raise `BOW_MIN`/`BOW_COLLINEAR`; if too loopy, lower `BOW_VAR`/`BOW_COLLINEAR`. Keep `BOW_MIN ≥ 0.05` (the straightness test floor depends on it). After any change:

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS.

- [ ] **Step 3: Full verification**

```bash
npm run test
npm run check
npm run build
```

Expected: all tests pass, biome clean, build succeeds.

- [ ] **Step 4: Commit (only if constants changed)**

```bash
git add src/engine/fibers.ts
git commit -m "polish: tune fiber bow constants after visual pass

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
