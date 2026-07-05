# Chord-Proportional Fiber Control Arms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix physically impossible knotted fibres (short/same-corner LED pairs) by capping each fibre's Bézier control arms at the chord between its stub tips.

**Architecture:** One arithmetic change inside `generateFrame` in the pure engine layer: after the stub tips are known, both randomly drawn control arms are multiplied by `min(1, ARM_CHORD_FACTOR·chord / maxArm)`. No RNG draws are added, removed, or reordered, so pairings and thicknesses are identical for every seed; fibres whose chord already fits the style's maximum arm are bit-identical (`x * 1 === x`). Spec: `docs/superpowers/specs/2026-07-05-chord-proportional-arms-design.md`.

**Tech Stack:** TypeScript, Vitest (unit tests in `src/engine/__tests__/`), Biome (lint/format), Vite (used only by the one-off verification script to bundle the engine for Node).

## Global Constraints

- **RNG draw order in `src/engine/fibers.ts` is load-bearing** (CLAUDE.md): the change must not add, remove, or reorder any `rnd()` call. Moving non-RNG statements (stub computation) earlier is safe.
- `src/engine/` stays React/DOM-free.
- `ARM_CHORD_FACTOR = 1` exactly, exported from `src/engine/fibers.ts` (spec, user-approved after the empirical sweep; do not "tune" it).
- All commands run from the repo root. `npm run test` (Vitest, picks up `src/**/*.test.ts` only) and `npm run check` (Biome) must pass before the commit.
- Empirical facts the steps assert against (measured 2026-07-05 on pre-fix `main`, sweep = seeds 1–200 × the 7 `KNOT_STYLES` below): 1001 self-intersecting fibre instances pre-fix (default style fails from seed 2 on); 0 at `k = 1.0`; ~15% of default-style fibres reshape.
- `$VERIFY_DIR` below means a scratch directory outside the repo (use your session scratchpad; any writable dir outside the repo works). Never commit its files.

---

### Task 1: Cap control arms at the stub-tip chord (TDD)

**Files:**
- Modify: `src/engine/fibers.ts:46-47` (add constant below `ARM_TUCK`/`ARM_RAMP_END`), `src/engine/fibers.ts:239-273` (the `pairs.map` body), `src/engine/fibers.ts:187-204` (doc comment)
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: existing exports `generateFrame(seed, style?)`, `DEFAULT_FIBER_STYLE` from `src/engine/fibers.ts`; `Point`, `FiberStyle` from `src/engine/types.ts`.
- Produces: `export const ARM_CHORD_FACTOR = 1;` in `src/engine/fibers.ts` (imported by the new tests and the Task 1 verification script's constants). Fibre generation output shape is unchanged.

- [ ] **Step 1: Capture the pre-change baseline (BEFORE touching any source file)**

Create `$VERIFY_DIR/dump-frames.mjs`:

```js
// Usage (from the repo root): node $VERIFY_DIR/dump-frames.mjs <outFile.json>
// Bundles the repo's CURRENT src/engine/fibers.ts for Node and dumps
// generateFrame output for seeds 1..50 at the default style.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const { build } = await import(`${repo}/node_modules/vite/dist/node/index.js`);

const outFile = process.argv[2];
const bundleDir = mkdtempSync(join(tmpdir(), "fibers-bundle-"));
await build({
  configFile: false,
  logLevel: "silent",
  build: {
    lib: {
      entry: `${repo}/src/engine/fibers.ts`,
      formats: ["es"],
      fileName: "fibers",
    },
    outDir: bundleDir,
    emptyOutDir: true,
    minify: false,
  },
});

const { generateFrame } = await import(join(bundleDir, "fibers.mjs"));
const frames = {};
for (let seed = 1; seed <= 50; seed++) {
  frames[seed] = generateFrame(seed).fibers.map((f) => ({
    start: f.startLedIndex,
    end: f.endLedIndex,
    thickness: f.thickness,
    path: f.path,
  }));
}
writeFileSync(outFile, JSON.stringify(frames));
console.log("wrote", outFile);
```

Run: `git status --porcelain` — must be clean (baseline must be pre-change). Then:

```bash
node $VERIFY_DIR/dump-frames.mjs $VERIFY_DIR/baseline.json
```

Expected output: `wrote .../baseline.json`

- [ ] **Step 2: Write the failing tests**

In `src/engine/__tests__/fibers.test.ts`, extend the import from `../fibers`:

```ts
import {
  ARM_CHORD_FACTOR,
  DEFAULT_FIBER_STYLE,
  FIBERS_PER_FRAME,
  generateFrame,
} from "../fibers";
```

Add three helpers at module scope, directly after the existing `maxChordDeviation` function (ends line 24):

```ts
/** Strict segment-crossing test; shared endpoints and touches don't count. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (o: Point, p: Point, q: Point) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** True if any two non-adjacent segments of the polyline cross. */
function pathSelfIntersects(path: Point[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = i + 2; j < path.length - 1; j++) {
      if (segmentsCross(path[i], path[i + 1], path[j], path[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

/** Distance from p to the segment ab. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2),
        );
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}
```

Add a new `describe` block at the end of the file (after the socket-depth block, line 394):

```ts
describe("generateFrame chord-proportional arms (no knots)", () => {
  // Style corners that produced knots before the ARM_CHORD_FACTOR limit:
  // 1001 self-intersecting fibres across this sweep, e.g. seeds 2-5 at the
  // default style (spec 2026-07-05-chord-proportional-arms-design).
  const KNOT_STYLES: FiberStyle[] = [
    { curviness: 0, randomness: 0, socketDepth: 0.4 },
    { curviness: 0, randomness: 1, socketDepth: 0.4 },
    { curviness: 1, randomness: 0, socketDepth: 0.4 },
    { curviness: 1, randomness: 1, socketDepth: 0.4 },
    { curviness: 0.5, randomness: 0.5, socketDepth: 0.4 },
    { curviness: 1, randomness: 1, socketDepth: 0 },
    { curviness: 1, randomness: 1, socketDepth: 1 },
  ];

  /** Engine's stub-length mapping: L = lerp(0, 0.12, socketDepth). */
  const stubLength = (socketDepth: number) => 0.12 * socketDepth;

  it("no fiber path self-intersects (seeds 1-200, style extremes)", () => {
    for (const style of KNOT_STYLES) {
      for (let seed = 1; seed <= 200; seed++) {
        const frame = generateFrame(seed, style);
        for (const fiber of frame.fibers) {
          expect(pathSelfIntersects(fiber.path)).toBe(false);
        }
      }
    }
  });

  it("every path point stays inside the chord envelope (seeds 1-200, style extremes)", () => {
    // Convex-hull bound: the cubic lies in hull{stubA, p1, p2, stubB}; the
    // arms are ≤ ARM_CHORD_FACTOR·chord, so no curve sample strays farther
    // than that from the stub-tip segment, and the hole→stub legs add at
    // most the stub length.
    for (const style of KNOT_STYLES) {
      const L = stubLength(style.socketDepth);
      for (let seed = 1; seed <= 200; seed++) {
        const frame = generateFrame(seed, style);
        for (const fiber of frame.fibers) {
          const a = frame.leds[fiber.startLedIndex];
          const b = frame.leds[fiber.endLedIndex];
          const tipA = {
            x: a.position.x + a.normal.x * L,
            y: a.position.y + a.normal.y * L,
          };
          const tipB = {
            x: b.position.x + b.normal.x * L,
            y: b.position.y + b.normal.y * L,
          };
          const chord = Math.hypot(tipB.x - tipA.x, tipB.y - tipA.y);
          const bound = ARM_CHORD_FACTOR * chord + L + 1e-9;
          let worst = 0;
          for (const p of fiber.path) {
            const d = distanceToSegment(p, tipA, tipB);
            if (d > worst) worst = d;
          }
          expect(worst).toBeLessThanOrEqual(bound);
        }
      }
    }
  });
});
```

Note: `ARM_CHORD_FACTOR` does not exist yet — the test file will not compile. That is the expected red state.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`

Expected: FAIL — the file errors on the missing `ARM_CHORD_FACTOR` export. To also see the behavioural failure (not just the compile error), temporarily stub the import locally with `const ARM_CHORD_FACTOR = 1` — both new tests must then fail on assertions (self-intersections exist from seed 2 at the default style) — then restore the import. Do not proceed if the behavioural tests pass against the unmodified engine: that means the test is broken.

- [ ] **Step 4: Implement the arm cap in `src/engine/fibers.ts`**

Add the exported constant directly after the `ARM_TUCK`/`ARM_RAMP_END` declarations (after line 47):

```ts
/**
 * A control arm never exceeds ARM_CHORD_FACTOR × the stub-tip chord, so a
 * short (same-corner) pair renders as a short arc instead of an
 * overshooting knot — a real fibre tube cannot fold back on itself. At 1.0
 * ("an arm never exceeds the fibre's span") an empirical sweep of seeds
 * 1–1000 × 18 style combos found zero self-intersecting paths (first knots
 * appear at 1.4×), while every fibre whose chord already fits the style's
 * maximum arm stays bit-identical. Spec:
 * docs/superpowers/specs/2026-07-05-chord-proportional-arms-design.md.
 */
export const ARM_CHORD_FACTOR = 1;
```

In the `pairs.map` body, replace this block (currently lines 243–263):

```ts
    const dA = (shape.controlMin + rnd() * shape.controlRange) * armScale;
    const dB = (shape.controlMin + rnd() * shape.controlRange) * armScale;
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
```

with (stub computation moved up — it draws no RNG — then the fit factor, then the unchanged draw sequence):

```ts
    // Straight socket stub: the fiber leaves the hole along the LED normal.
    const stubA = {
      x: start.position.x + start.normal.x * stub,
      y: start.position.y + start.normal.y * stub,
    };
    const stubB = {
      x: end.position.x + end.normal.x * stub,
      y: end.position.y + end.normal.y * stub,
    };
    // Both arms shrink in proportion when the chord is short (same-corner
    // pairs), keeping per-fiber variation; armFit is exactly 1 — and the
    // output bit-identical — whenever the style's maximum possible arm
    // already fits the chord.
    const chord = Math.hypot(stubB.x - stubA.x, stubB.y - stubA.y);
    const maxArm = (shape.controlMin + shape.controlRange) * armScale;
    const armFit = Math.min(1, (ARM_CHORD_FACTOR * chord) / maxArm);

    const dA = (shape.controlMin + rnd() * shape.controlRange) * armScale * armFit;
    const dB = (shape.controlMin + rnd() * shape.controlRange) * armScale * armFit;
    // Four draws kept from the retired tangent-bow machinery (magA,
    // signDrawA, magB, signDrawB) — consumed so persisted seeds keep their
    // matching and thickness across engine versions, but perpendicular
    // exits leave them nothing to steer.
    rnd();
    rnd();
    rnd();
    rnd();
    const thickness = 0.85 + rnd() * 0.5;
```

(`maxArm` can't be 0: `controlMin ≥ 0.3` and `armScale ≥ ARM_TUCK = 0.3`.)

In the `generateFrame` doc comment, append one sentence to the paragraph that starts `* Style (specs 2026-07-04-fiber-style-sliders, ...)` (before the RNG-draw-order paragraph):

```
 * Arms are additionally capped at ARM_CHORD_FACTOR × the stub-tip chord
 * (spec 2026-07-05-chord-proportional-arms) so short same-corner pairs
 * arc instead of knotting.
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm run test`
Expected: all test files pass (the change must not disturb light/wall/viewport tests).

Run: `npm run check`
Expected: no Biome errors. If Biome reformats the new code, apply with `npm run format` and re-check.

- [ ] **Step 7: Verify the determinism contract against the baseline**

Create `$VERIFY_DIR/compare-frames.mjs`:

```js
// Usage: node $VERIFY_DIR/compare-frames.mjs <baseline.json> <after.json>
// Contract of the arm-cap change: pairings and thicknesses identical
// everywhere (RNG stream untouched); paths bit-identical for every fibre
// whose stub-tip chord already fits the default style's maximum arm.
import { readFileSync } from "node:fs";

const K = 1.0; // ARM_CHORD_FACTOR
// (controlMin 0.34 + controlRange 0.295) at default curviness 0.5, armScale 1:
const MAX_ARM = 0.635;

const a = JSON.parse(readFileSync(process.argv[2], "utf8"));
const b = JSON.parse(readFileSync(process.argv[3], "utf8"));

let long = 0;
let longChanged = 0;
let short = 0;
let shortChanged = 0;
for (const seed of Object.keys(a)) {
  for (let i = 0; i < a[seed].length; i++) {
    const fa = a[seed][i];
    const fb = b[seed][i];
    if (fa.start !== fb.start || fa.end !== fb.end) {
      throw new Error(`pairing changed: seed ${seed} fiber ${i}`);
    }
    if (fa.thickness !== fb.thickness) {
      throw new Error(`thickness changed: seed ${seed} fiber ${i}`);
    }
    // path[1] / path[length-2] are exactly the stub tips.
    const tipA = fa.path[1];
    const tipB = fa.path[fa.path.length - 2];
    const chord = Math.hypot(tipA.x - tipB.x, tipA.y - tipB.y);
    const identical = JSON.stringify(fa.path) === JSON.stringify(fb.path);
    if (K * chord >= MAX_ARM) {
      long++;
      if (!identical) {
        longChanged++;
        console.log(`LONG FIBRE CHANGED: seed ${seed} fiber ${i}`);
      }
    } else {
      short++;
      if (!identical) shortChanged++;
    }
  }
}
console.log(`long fibres: ${long}, changed: ${longChanged} (must be 0)`);
console.log(`short fibres: ${short}, reshaped: ${shortChanged}`);
if (longChanged > 0) process.exit(1);
console.log("OK");
```

Run (from the repo root, with the Step 4 changes in the working tree):

```bash
node $VERIFY_DIR/dump-frames.mjs $VERIFY_DIR/after.json
node $VERIFY_DIR/compare-frames.mjs $VERIFY_DIR/baseline.json $VERIFY_DIR/after.json
```

Expected: no pairing/thickness errors; `changed: 0` for long fibres; short-fibre `reshaped` around 10–20% of the 600 total; final line `OK`.

- [ ] **Step 8: Commit**

```bash
git add src/engine/fibers.ts src/engine/__tests__/fibers.test.ts
git commit -m "fix(engine): cap fiber control arms at the stub-tip chord

Short (same-corner) LED pairs rendered as physically impossible knots
because control arms (0.3-0.85) ignored the chord length (min ~0.26).
Arms now scale by min(1, chord / maxArm): zero self-intersections across
216k swept fibres, pairings/thicknesses untouched, and ~85% of
default-style fibres stay bit-identical.

Spec: docs/superpowers/specs/2026-07-05-chord-proportional-arms-design.md

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Visual confirmation in the running app

**Files:**
- None modified. Read-only verification against the dev server.

**Interfaces:**
- Consumes: the committed engine change from Task 1; `npm run dev` (Vite dev server on port 3000).
- Produces: a screenshot of the inspector connection map confirming knot-free corner fibres, and a pass/fail statement reported to the user.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)
Expected: Vite serving on `http://localhost:3000`.

- [ ] **Step 2: Inspect connection maps**

Open `http://localhost:3000` in the browser (Playwright tools or manually). Open the inspector panel's connection map (the per-frame LED/fibre map drawn by `src/renderer/mapRenderer.ts` — the view shown in the bug report). Regenerate the wall several times (the UI's regenerate/reseed control in `FilamentStudio`).

Check on each regeneration: fibres joining two LEDs near the same corner render as short arcs hugging the corner (like the red reference sketch) — no loops, hooks, or knots anywhere on the map. Take a screenshot of at least one frame that contains a same-corner connection.

- [ ] **Step 3: Report**

Expected: screenshot(s) showing knot-free corner arcs. Report the observation to the user with the screenshot; if any knot appears, stop and reopen Task 1 (the sweep says this should be impossible — a knot here means the implementation diverged from the plan).
