# Socket Depth Slider (Perpendicular Fiber Exits) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third fiber-style slider, "Socket depth", that makes every fiber exit its LED hole exactly perpendicular to the frame through a straight stub of slider-controlled length, matching the physical fixture.

**Architecture:** Each fiber becomes: straight stub `P0 → P0 + normal·L` at both ends plus one cubic Bézier between the stub tips whose control points lie **on the LED normals** (kink-free, perpendicular exits by construction). The tangent-offset machinery (`sA`/`sB`, S-curve gate, `perpFloor`, collinear bow boost) is deleted; the matcher hard-excludes exactly-facing LED pairs (which perpendicular exits would force dead straight). RNG draw order stays byte-identical so saved seeds keep their compositions.

**Tech Stack:** TypeScript, React 19, Vitest, Biome. Spec: `docs/superpowers/specs/2026-07-04-socket-depth-slider-design.md`.

## Global Constraints

- `socketDepth` axis is 0–1; engine maps to stub length `L = lerp(0.005, 0.12, socketDepth)` in normalized frame units.
- `DEFAULT_FIBER_STYLE = { curviness: 0.5, randomness: 0.5, socketDepth: 0.4 }`.
- RNG draw order must stay exactly: per matching attempt one 24-shuffle + one weighted pick per pair; per fiber `dA, dB, magA, signDrawA, magB, signDrawB, thickness` (the four mag/sign draws are consumed but unused).
- Fiber `path` stays a single `Point[]` of exactly `FIBER_SAMPLES` (38) points, endpoints exactly on the LED positions.
- Containment is unconditional: every path point in `[0, 1]` both axes at every slider value.
- Perpendicular exits are unconditional (not gated on slider value); the slider controls only stub length.
- UI copy: slider label is exactly "Socket depth", displayed 0–100 %, step 0.01 on a 0–1 range.
- Legacy saves without `socketDepth` load as the default 0.4 (not 0.5 — the loader's fallback must be per-axis).
- Commands: `npm test` (vitest run), `npm run check` (biome). Both must pass at the end of every task.

---

### Task 1: Plumb `socketDepth` through types, defaults, and the studio (no behavior change)

Adds the required field everywhere `FiberStyle` is constructed so the codebase typechecks, sanitizes the new axis in `generateFrame`, and persists/loads it — while the engine still ignores it geometrically. Every literal of `FiberStyle` in src and tests gains the field.

**Files:**
- Modify: `src/engine/types.ts:44-57` (FiberStyle, WallConfig untouched), `src/engine/types.ts:75-89` (ProjectSnapshot)
- Modify: `src/engine/fibers.ts:17-20` (DEFAULT_FIBER_STYLE)
- Modify: `src/components/filament/FilamentStudio.tsx` (StudioState, INITIAL_STATE, styleOf, styleAxis, handleSave, handleLoad)
- Test: `src/engine/__tests__/fibers.test.ts`, `src/engine/__tests__/wall.test.ts`

**Interfaces:**
- Consumes: existing `FiberStyle`, `DEFAULT_FIBER_STYLE`, `generateFrame(seed, style?)`.
- Produces: `FiberStyle.socketDepth: number` (required), `DEFAULT_FIBER_STYLE.socketDepth === 0.4`, `ProjectSnapshot.socketDepth: number`, loader helper `styleAxis(value: unknown, fallback: number): number`. Tasks 3–4 rely on these exact names. `generateFrame` does not read the new axis yet (that lands with the geometry in Task 3, keeping this task lint-clean — no unused variable).

- [ ] **Step 1: Update the defaults test to expect the new axis (failing test)**

In `src/engine/__tests__/fibers.test.ts`, replace the body of the `"defaults match DEFAULT_FIBER_STYLE exactly"` test:

```ts
  it("defaults match DEFAULT_FIBER_STYLE exactly", () => {
    expect(DEFAULT_FIBER_STYLE).toEqual({
      curviness: 0.5,
      randomness: 0.5,
      socketDepth: 0.4,
    });
    expect(generateFrame(7431)).toEqual(
      generateFrame(7431, DEFAULT_FIBER_STYLE),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/engine/__tests__/fibers.test.ts`
Expected: FAIL — `DEFAULT_FIBER_STYLE` lacks `socketDepth` (toEqual mismatch). Other failures at this point are TypeScript errors once Step 3 lands; that's fine, proceed.

- [ ] **Step 3: Add the field to types and defaults**

In `src/engine/types.ts`, replace the `FiberStyle` interface:

```ts
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
```

In `src/engine/types.ts`, inside `ProjectSnapshot`, after the `randomness: number;` line add:

```ts
  /** FiberStyle socket depth, 0–1. Absent in legacy saves → loader defaults to 0.4. */
  socketDepth: number;
```

In `src/engine/fibers.ts`, replace `DEFAULT_FIBER_STYLE`:

```ts
/** Neutral style; also the fallback for missing/invalid persisted values. */
export const DEFAULT_FIBER_STYLE: FiberStyle = {
  curviness: 0.5,
  randomness: 0.5,
  socketDepth: 0.4,
};
```

Do NOT touch `generateFrame` in this task — it keeps ignoring `style.socketDepth` until Task 3 (an unused sanitized local would fail lint).

- [ ] **Step 4: Update every remaining `FiberStyle` construction site**

In `src/engine/__tests__/fibers.test.ts` — every style literal gains `socketDepth: 0.4` (the current-default equivalent, so nothing else changes):

```ts
  const TAUT: FiberStyle = { curviness: 0, randomness: 0.5, socketDepth: 0.4 };

  const STYLE_EXTREMES: FiberStyle[] = [
    { curviness: 0, randomness: 0, socketDepth: 0.4 },
    { curviness: 0, randomness: 1, socketDepth: 0.4 },
    { curviness: 1, randomness: 0, socketDepth: 0.4 },
    { curviness: 1, randomness: 1, socketDepth: 0.4 },
    { curviness: 0.5, randomness: 0.5, socketDepth: 0.4 },
  ];
```

And in the same file update the five inline style literals the same way:
- `"is deterministic per (seed, style)"`: `{ curviness: 0.3, randomness: 0.8, socketDepth: 0.4 }`
- `"changing curviness changes fiber paths"`: both literals get `socketDepth: 0.4`
- `"clamps out-of-range style values to the extremes"`: both literals get `socketDepth: 0.4`
- `"falls back to defaults for non-finite style values"`: `{ curviness: Number.NaN, randomness: Number.NaN, socketDepth: Number.NaN }`
- `"changing randomness changes the pairing for some seeds"` and `"matching invariants hold at randomness extremes"`: `{ curviness: 0.5, randomness: r, socketDepth: 0.4 }` / `{ curviness: 0.5, randomness, socketDepth: 0.4 }`

In `src/engine/__tests__/wall.test.ts`, the `"forwards style to every frame"` literal:

```ts
    const style: FiberStyle = {
      curviness: 0.1,
      randomness: 0.9,
      socketDepth: 0.4,
    };
```

In `src/components/filament/FilamentStudio.tsx`:

`StudioState` gains a field after `randomness: number;`:

```ts
  socketDepth: number;
```

`INITIAL_STATE` gains, after the `randomness:` line:

```ts
  socketDepth: DEFAULT_FIBER_STYLE.socketDepth,
```

Replace `styleOf` and `styleAxis`:

```ts
function styleOf(s: {
  curviness: number;
  randomness: number;
  socketDepth: number;
}): FiberStyle {
  return {
    curviness: s.curviness,
    randomness: s.randomness,
    socketDepth: s.socketDepth,
  };
}

/** Loader sanitizer: legacy/hand-edited snapshots → finite 0–1 or fallback. */
function styleAxis(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}
```

In `handleSave`, after `randomness: s.randomness,` add:

```ts
      socketDepth: s.socketDepth,
```

In `handleLoad`, replace the style-loading lines:

```ts
    const curviness = styleAxis(d.curviness, DEFAULT_FIBER_STYLE.curviness);
    const randomness = styleAxis(d.randomness, DEFAULT_FIBER_STYLE.randomness);
    const socketDepth = styleAxis(
      d.socketDepth,
      DEFAULT_FIBER_STYLE.socketDepth,
    );
    rebuild(gridSize, d.masterSeed, { curviness, randomness, socketDepth }, d.seeds);
```

and add `socketDepth,` to the `patch({...})` call right after `randomness,`.

Note: `styleAxis`'s old single-argument fallback was 0.5, which equals `DEFAULT_FIBER_STYLE.curviness`/`.randomness` — behavior for legacy curviness/randomness is unchanged.

- [ ] **Step 5: Run tests and checks to verify everything passes**

Run: `npm test && npm run check`
Expected: all tests PASS, biome clean. Every frame is byte-identical to before this task (`socketDepth` is sanitized but unused).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/fibers.ts src/components/filament/FilamentStudio.tsx src/engine/__tests__/fibers.test.ts src/engine/__tests__/wall.test.ts
git commit -m "feat(engine): plumb socketDepth style axis — sanitized, persisted, not yet used"
```

---

### Task 2: Matcher excludes exactly-facing LED pairs

Under perpendicular exits (Task 3) a directly-facing pair — opposite parallel edges, same cross-axis coordinate — is mathematically forced into a dead-straight fiber (all four Bézier defining points collinear). Exclude such pairs in `tryMatchOnce` so the no-straight-fibers guarantee survives Task 3. The LED grid is edge-symmetric, so each LED has exactly one facing partner; excluding it cannot make matching infeasible, and the restart budget + arbitrary fallback still guarantee termination.

**Files:**
- Modify: `src/engine/fibers.ts:133-172` (`tryMatchOnce`) plus a new `isFacing` helper above it
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: `Led` (`position`, `normal`, `side`), `tryMatchOnce` internals.
- Produces: module-private `isFacing(a: Led, b: Led): boolean`. Task 3's straightness test relies on facing pairs being absent.

- [ ] **Step 1: Write the failing test**

Add to the `"generateFrame"` describe block in `src/engine/__tests__/fibers.test.ts`:

```ts
  it("never matches exactly-facing LEDs (seeds 1-200)", () => {
    // Opposite parallel edges + same cross-axis coordinate would force a
    // dead-straight fiber under perpendicular exits (socket-depth spec).
    for (let seed = 1; seed <= 200; seed++) {
      const frame = generateFrame(seed);
      for (const fiber of frame.fibers) {
        const a = frame.leds[fiber.startLedIndex];
        const b = frame.leds[fiber.endLedIndex];
        const opposite =
          a.normal.x + b.normal.x === 0 && a.normal.y + b.normal.y === 0;
        if (!opposite) continue;
        const cross =
          a.normal.x !== 0
            ? Math.abs(a.position.y - b.position.y)
            : Math.abs(a.position.x - b.position.x);
        expect(cross).toBeGreaterThan(1e-6);
      }
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/__tests__/fibers.test.ts`
Expected: FAIL — some seed in 1–200 pairs facing LEDs (top/bottom or left/right LEDs share cross coordinates by construction of `buildLeds`). If it happens to pass, widen to seeds 1–1000 to find a failing seed and keep that range; do not skip the red step.

- [ ] **Step 3: Implement the exclusion**

In `src/engine/fibers.ts`, add above `tryMatchOnce`:

```ts
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
```

In `tryMatchOnce`, replace the candidate filter line:

```ts
      if (leds[j].side !== leds[i].side && !isFacing(leds[i], leds[j])) {
        candidates.push(j);
      }
```

Also update `tryMatchOnce`'s doc comment first sentence to: `One greedy matching attempt: walk a fresh shuffle, pair each unpaired LED with a weighted-random partner on a different edge (exactly-facing partners excluded).` And extend the dead-end sentence to `(all remaining unpaired LEDs share the current LED's edge or face it exactly)`.

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npm test && npm run check`
Expected: all PASS — including the existing perfect-matching/determinism tests (pairings change for some seeds, but no test pins exact pairings; the wall reseed test only compares wall-internal consistency).

- [ ] **Step 5: Commit**

```bash
git add src/engine/fibers.ts src/engine/__tests__/fibers.test.ts
git commit -m "feat(engine): matcher excludes exactly-facing LED pairs"
```

---

### Task 3: Stub + constrained-cubic geometry — perpendicular exits

The core rewrite. Fiber = `[LED position, stub tip, 36 cubic samples…, stub tip, LED position]` — wait, no: the cubic's own endpoints ARE the stub tips, so the path is `[P0, cubic(S0→S1) sampled 36×, P3]` = 38 points, where segment `P0→S0` (= `path[0]→path[1]`) is the exact straight socket stub. Control points sit on the normals; deletes `sA`/`sB` tangent bows, the S-curve gate, `perpFloor`, `containControlPoint`, and `BOW_COLLINEAR`.

**Files:**
- Modify: `src/engine/fibers.ts` (shapeParams, generateFrame per-fiber body; delete `containControlPoint`, `controlPoint`, `ControlPoint`, `BOW_COLLINEAR`, `perpFloor`/`bowMin`/`bowVar`)
- Modify: `src/engine/types.ts:26-28` (Fiber.path doc comment)
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: `isFacing` exclusion (Task 2), `socketDepth` sanitize (Task 1), `sampleCubicBezier(p0, p1, p2, p3, samples)`, `FIBER_SAMPLES = 38`, `clampAxis`, `lerp`, `shapeParams`.
- Produces: unchanged public API `generateFrame(seed, style?)`; path shape guarantee `path[1] === P0 + normal·L` exactly (both ends, mirrored). Task 4 and the renderer rely on nothing new.

- [ ] **Step 1: Write the failing geometry tests**

Add a new describe block at the end of `src/engine/__tests__/fibers.test.ts`:

```ts
describe("generateFrame socket depth (perpendicular exits)", () => {
  const depthStyle = (socketDepth: number): FiberStyle => ({
    curviness: 0.5,
    randomness: 0.5,
    socketDepth,
  });

  /** Engine's stub-length mapping: L = lerp(0.005, 0.12, socketDepth). */
  const stubLength = (socketDepth: number) =>
    0.005 + (0.12 - 0.005) * socketDepth;

  it("every fiber exits both LEDs exactly perpendicular through its stub (seeds 1-100, depths 0/0.4/1)", () => {
    for (const socketDepth of [0, 0.4, 1]) {
      const L = stubLength(socketDepth);
      for (let seed = 1; seed <= 100; seed++) {
        const frame = generateFrame(seed, depthStyle(socketDepth));
        for (const fiber of frame.fibers) {
          const a = frame.leds[fiber.startLedIndex];
          const b = frame.leds[fiber.endLedIndex];
          const first = fiber.path[1];
          expect(first.x).toBeCloseTo(a.position.x + a.normal.x * L, 12);
          expect(first.y).toBeCloseTo(a.position.y + a.normal.y * L, 12);
          const last = fiber.path[fiber.path.length - 2];
          expect(last.x).toBeCloseTo(b.position.x + b.normal.x * L, 12);
          expect(last.y).toBeCloseTo(b.position.y + b.normal.y * L, 12);
        }
      }
    }
  });

  it("the curve leaves the stub tip along the normal (no kink), seeds 1-50", () => {
    // First cubic sample after the stub tip: its deviation from the normal
    // ray through the LED is O(t²) ≈ 0.002 — assert well under 0.01.
    for (let seed = 1; seed <= 50; seed++) {
      const frame = generateFrame(seed, depthStyle(1));
      for (const fiber of frame.fibers) {
        const a = frame.leds[fiber.startLedIndex];
        const p = fiber.path[2];
        const offNormal = Math.abs(
          (p.x - a.position.x) * a.normal.y - (p.y - a.position.y) * a.normal.x,
        );
        expect(offNormal).toBeLessThan(0.01);
      }
    }
  });

  it("socketDepth reshapes paths without changing pairings (seeds 1-50)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const shallow = generateFrame(seed, depthStyle(0));
      const deep = generateFrame(seed, depthStyle(1));
      expect(
        shallow.fibers.map((f) => [f.startLedIndex, f.endLedIndex]),
      ).toEqual(deep.fibers.map((f) => [f.startLedIndex, f.endLedIndex]));
      expect(shallow.fibers.map((f) => f.path)).not.toEqual(
        deep.fibers.map((f) => f.path),
      );
    }
  });

  it("stays inside the frame at socket depth extremes (seeds 1-100)", () => {
    for (const socketDepth of [0, 1]) {
      for (let seed = 1; seed <= 100; seed++) {
        const frame = generateFrame(seed, depthStyle(socketDepth));
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

  it("sanitizes socketDepth like the other axes", () => {
    expect(
      generateFrame(5, { curviness: 0.5, randomness: 0.5, socketDepth: 2 }),
    ).toEqual(generateFrame(5, depthStyle(1)));
    expect(
      generateFrame(5, {
        curviness: 0.5,
        randomness: 0.5,
        socketDepth: Number.NaN,
      }),
    ).toEqual(generateFrame(5, depthStyle(0.4)));
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `npm test -- src/engine/__tests__/fibers.test.ts`
Expected: FAIL — `path[1]` is a dense Bézier sample near the LED, not the stub tip, and depth 0 vs 1 paths are identical (socketDepth unused).

- [ ] **Step 3: Rewrite the fiber geometry in `src/engine/fibers.ts`**

Delete: `BOW_COLLINEAR` (and its comment), the `ControlPoint` interface, `containControlPoint`, and `controlPoint`. Keep `collinearity`/`COLLINEAR_PENALTY`/`pairScore` (still soft-penalize near-collinear routing) and `isFacing`.

In `generateFrame`, directly after the `randomness` sanitize block, add the third axis:

```ts
  const socketDepth = sanitizeAxis(
    style.socketDepth,
    DEFAULT_FIBER_STYLE.socketDepth,
  );
```

Replace `ShapeParams`/`shapeParams`:

```ts
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
```

Add near `MARGIN` (and rewrite the `MARGIN` comment):

```ts
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
```

In `generateFrame`, after the `shape` line add:

```ts
  const stub = lerp(STUB_MIN, STUB_MAX, socketDepth);
```

Replace the whole `pairs.map` fiber construction with:

```ts
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
```

Update `generateFrame`'s doc comment: replace the style paragraph and draw-order paragraph with:

```ts
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
```

In `src/engine/types.ts`, update the `Fiber.path` comment:

```ts
  /** 38 points: straight socket stubs at both ends + sampled cubic Bézier */
  path: Point[];
```

- [ ] **Step 4: Update the existing tests that pinned the old geometry**

In `src/engine/__tests__/fibers.test.ts`:

1. Delete the `signedDeviations` helper and the entire `"no S-curves at curviness 0..."` test — with perpendicular exits, opposite-edge pairs are inherently S-shaped at every curviness; S-vs-C now follows from endpoint geometry by design.
2. In both straightness tests (`"no straight fibers: every path bows off its chord..."` and `"no straight fibers at curviness 0..."`), change the floor `0.01` to `0.005` and add this comment above the assertion in each:

```ts
        // Perpendicular exits cap the bow of near-facing opposite pairs
        // (min cross-offset 0.085 → deviation ≈ 0.007); floor lowered from
        // 0.01 accordingly. Exactly-facing pairs are matcher-excluded.
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run check`
Expected: all PASS. If a straightness assertion fails under 0.005 for some seed, do NOT lower the floor further — investigate: it means either a facing pair leaked through (`isFacing` bug) or the control distances collapsed (shapeParams bug). The math guarantees ≈0.007 minimum for legal pairs.

- [ ] **Step 6: Commit**

```bash
git add src/engine/fibers.ts src/engine/types.ts src/engine/__tests__/fibers.test.ts
git commit -m "feat(engine): perpendicular fiber exits — socket stub + on-normal cubic"
```

---

### Task 4: "Socket depth" slider in the left panel

Wires the already-plumbed state to a third slider. After this task the feature is user-complete: slider reshapes the wall in place (existing `handleStyle` path), persists via Save/Load, and legacy saves fall back to 0.4.

**Files:**
- Modify: `src/components/filament/LeftPanel.tsx:6-20` (props), `:103-117` (slider rows)
- Modify: `src/components/filament/FilamentStudio.tsx:382-400` (LeftPanel usage)

**Interfaces:**
- Consumes: `LeftPanelProps` pattern, `handleStyle(partial: Partial<FiberStyle>)` (already regenerates from current seeds and clears the showcase cache), `ui.socketDepth` (Task 1).
- Produces: `LeftPanelProps.socketDepth: number`, `LeftPanelProps.onSocketDepth: (v: number) => void`.

- [ ] **Step 1: Add the slider to LeftPanel**

In `src/components/filament/LeftPanel.tsx`, add to `LeftPanelProps` after `onRandomness`:

```ts
  socketDepth: number;
  onSocketDepth: (v: number) => void;
```

Add after the Randomness `SliderRow` (before the Re-route/Generate button block):

```tsx
      <SliderRow
        label="Socket depth"
        value={`${Math.round(props.socketDepth * 100)}%`}
      >
        <input
          type="range"
          aria-label="Socket depth"
          min={0}
          max={1}
          step={0.01}
          value={props.socketDepth}
          onChange={(e) => props.onSocketDepth(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>
```

- [ ] **Step 2: Wire it in FilamentStudio**

In `src/components/filament/FilamentStudio.tsx`, in the `<LeftPanel>` JSX after the `onRandomness` prop:

```tsx
          socketDepth={ui.socketDepth}
          onSocketDepth={(v) => handleStyle({ socketDepth: v })}
```

- [ ] **Step 3: Run tests, checks, and verify in the app**

Run: `npm test && npm run check`
Expected: all PASS, biome clean (typecheck confirms the new required props are supplied).

Then verify end-to-end: `npm run dev`, open http://localhost:3000 and confirm —
1. "Socket depth" slider renders under Randomness showing "40%".
2. Generate a wall; every fiber leaves its frame edge perpendicular with a visible straight stub.
3. Drag Socket depth 0 → 100%: stubs lengthen in place, routing (which fiber connects which LEDs) does not change.
4. Save, reload the page, Load: slider position and wall geometry restore.
5. Legacy check: in devtools run `const p = JSON.parse(localStorage.getItem("filament.project")); delete p.socketDepth; localStorage.setItem("filament.project", JSON.stringify(p));`, then Load — slider shows 40%, no console errors.

- [ ] **Step 4: Commit and mark the spec implemented**

In `docs/superpowers/specs/2026-07-04-socket-depth-slider-design.md`, change `Status: Approved` to `Status: Implemented`.

```bash
git add src/components/filament/LeftPanel.tsx src/components/filament/FilamentStudio.tsx docs/superpowers/specs/2026-07-04-socket-depth-slider-design.md
git commit -m "feat(ui): socket depth slider — perpendicular exits, persisted"
```
