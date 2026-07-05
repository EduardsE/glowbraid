# Light-Board Fibre Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the fibre light show legible on light board colours by crossfading the additive glow into an opaque "legibility floor" graphic pass as board luminance rises.

**Architecture:** A new pure module `src/renderer/lightMapping.ts` holds the luminance→crossfade math and colour helpers (unit-tested). `wallRenderer.ts` computes one `lightFactor` per wall draw from `state.boardColor` and threads it into `drawFrame`, which scales the existing additive pass down and a new source-over graphic pass up with that factor. Engine untouched.

**Tech Stack:** TypeScript, Canvas2D, Vitest, Biome. Spec: `docs/superpowers/specs/2026-07-05-light-board-fibre-legibility-design.md`.

## Global Constraints

- No changes under `src/engine/` — no new RNG draws, no `ProjectSnapshot` fields (determinism/persistence contract).
- No `ctx.shadowBlur` or per-LED/per-segment filter effects in hot draw paths.
- Default dark board `#101114` must render pixel-identical to before (crossfade factor 0 must short-circuit every new pass and alpha change).
- Approved constants: crossfade start luminance 0.22, range 0.4, additive fade 0.85, intensity floor 0.22, saturation boost 0.8.
- Performance acceptance: 5×5 grid, white board, sim mode ≥ 60fps.
- `npm run check` (Biome) and `npm run test` must pass at every commit.
- Path alias: use `@/` for cross-directory imports (matches existing code); tests import their subject relatively (`../lightMapping`), matching `src/renderer/__tests__/wallRenderer.test.ts`.

---

### Task 1: `lightMapping` pure module

**Files:**
- Create: `src/renderer/lightMapping.ts`
- Test: `src/renderer/__tests__/lightMapping.test.ts`

**Interfaces:**
- Consumes: `RGB` from `@/engine/types` (`[number, number, number]`), `MIN_SEGMENT_INTENSITY` from `@/engine/light` (test only).
- Produces (Task 2 relies on these exact names/signatures):
  - `CROSSFADE_START = 0.22`, `CROSSFADE_RANGE = 0.4`, `ADDITIVE_FADE = 0.85`, `INTENSITY_FLOOR = 0.22`, `SATURATION_BOOST = 0.8` (exported `number` consts)
  - `relativeLuminance(hex: string): number`
  - `lightBoardFactor(hex: string): number`
  - `boostSaturation(color: RGB, amount: number): RGB`
  - `floorIntensity(i: number): number`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/lightMapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MIN_SEGMENT_INTENSITY } from "@/engine/light";
import {
  boostSaturation,
  floorIntensity,
  INTENSITY_FLOOR,
  lightBoardFactor,
  relativeLuminance,
} from "../lightMapping";

describe("relativeLuminance", () => {
  it("returns 0 for black", () => {
    expect(relativeLuminance("#000000")).toBe(0);
  });

  it("returns 1 for white", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("rates the default dark board as very dark", () => {
    // #101114 = rgb(16,17,20) → (0.2126·16 + 0.7152·17 + 0.0722·20)/255
    expect(relativeLuminance("#101114")).toBeCloseTo(0.0667, 3);
  });

  it("expands 3-digit hex (hand-edited saves)", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
  });

  it("fails safe to 0 (dark → current behaviour) on unparsable input", () => {
    expect(relativeLuminance("not-a-color")).toBe(0);
    expect(relativeLuminance("")).toBe(0);
  });
});

describe("lightBoardFactor", () => {
  it("is 0 on the default dark board and pure black", () => {
    expect(lightBoardFactor("#101114")).toBe(0);
    expect(lightBoardFactor("#000000")).toBe(0);
  });

  it("clamps to 1 on white and near-white boards", () => {
    expect(lightBoardFactor("#ffffff")).toBe(1);
    expect(lightBoardFactor("#f6f6f8")).toBe(1);
  });

  it("sits mid-ramp on a mid grey", () => {
    // #6b6b6b → L ≈ 0.4196 → (0.4196 − 0.22) / 0.4 ≈ 0.499
    expect(lightBoardFactor("#6b6b6b")).toBeCloseTo(0.5, 2);
  });
});

describe("floorIntensity", () => {
  it("maps 0 to the floor and 1 to 1", () => {
    expect(floorIntensity(0)).toBe(INTENSITY_FLOOR);
    expect(floorIntensity(1)).toBeCloseTo(1, 10);
  });

  it("clamps out-of-range input", () => {
    expect(floorIntensity(-0.5)).toBe(INTENSITY_FLOOR);
    expect(floorIntensity(2)).toBeCloseTo(1, 10);
  });

  it("is monotonic", () => {
    expect(floorIntensity(0.6)).toBeGreaterThan(floorIntensity(0.3));
  });

  it("stays continuous across the engine's segment-cull threshold", () => {
    // Culled segments draw at floorIntensity(0); a segment just above the
    // cull threshold must not visibly jump.
    const jump = floorIntensity(MIN_SEGMENT_INTENSITY) - floorIntensity(0);
    expect(jump).toBeGreaterThan(0);
    expect(jump).toBeLessThan(0.04);
  });
});

describe("boostSaturation", () => {
  it("is the identity at amount 0", () => {
    expect(boostSaturation([200, 100, 50], 0)).toEqual([200, 100, 50]);
  });

  it("leaves pure grey unchanged (all channels at the mean)", () => {
    expect(boostSaturation([128, 128, 128], 0.8)).toEqual([128, 128, 128]);
  });

  it("pushes channels apart and clamps to 0–255", () => {
    const [r, g, b] = boostSaturation([200, 100, 50], 0.8);
    expect(r).toBe(255); // 200 + (200 − 116.67)·0.8 ≈ 266.7 → clamped
    expect(g).toBeCloseTo(86.67, 1);
    expect(b).toBe(0); // 50 + (50 − 116.67)·0.8 ≈ −3.3 → clamped
  });

  it("keeps an already-saturated primary unchanged", () => {
    expect(boostSaturation([255, 0, 0], 0.8)).toEqual([255, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/lightMapping.test.ts`
Expected: FAIL — cannot resolve `../lightMapping` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/lightMapping.ts`:

```ts
import type { RGB } from "@/engine/types";

/**
 * Screen-only mapping between board luminance and fibre-light rendering.
 *
 * Additive ("lighter") blending cannot brighten a near-white backdrop, so on
 * light boards the renderer crossfades the additive glow into an opaque
 * "legibility floor" graphic pass (see wallRenderer.ts). This is a display
 * concern only — none of it feeds the future hardware path, which is why it
 * lives in the renderer, not the engine.
 *
 * Constants were tuned interactively during the design brainstorm
 * (docs/superpowers/specs/2026-07-05-light-board-fibre-legibility-design.md).
 */

/** Crossfade begins at this relative board luminance… */
export const CROSSFADE_START = 0.22;
/** …and completes CROSSFADE_RANGE above it. */
export const CROSSFADE_RANGE = 0.4;
/** Fraction of the additive pass faded out at full light-board factor. */
export const ADDITIVE_FADE = 0.85;
/** Minimum displayed intensity on light boards — dim fibre never vanishes. */
export const INTENSITY_FLOOR = 0.22;
/** Saturation push for graphic-pass colours (additive colours read pale). */
export const SATURATION_BOOST = 0.8;

/**
 * Rec.709-weighted luminance of a `#rgb`/`#rrggbb` colour, 0–1. Applied to
 * gamma-encoded channels (no linearization) — matches the approved demo.
 * Unparsable input → 0, failing safe to the dark-board (current) rendering.
 */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  let digits = match[1];
  if (digits.length === 3) {
    digits = `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }
  const n = Number.parseInt(digits, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** 0 on dark boards → 1 on light boards; drives the additive↔graphic crossfade. */
export function lightBoardFactor(hex: string): number {
  const f = (relativeLuminance(hex) - CROSSFADE_START) / CROSSFADE_RANGE;
  return Math.max(0, Math.min(1, f));
}

/** Push channels away from their mean by `amount`, clamped to 0–255. */
export function boostSaturation(color: RGB, amount: number): RGB {
  const mean = (color[0] + color[1] + color[2]) / 3;
  const push = (c: number) =>
    Math.max(0, Math.min(255, c + (c - mean) * amount));
  return [push(color[0]), push(color[1]), push(color[2])];
}

/** Remap displayed intensity so it never drops below INTENSITY_FLOOR. */
export function floorIntensity(i: number): number {
  return (
    INTENSITY_FLOOR + (1 - INTENSITY_FLOOR) * Math.min(1, Math.max(0, i))
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/lightMapping.test.ts`
Expected: PASS (5 + 3 + 4 + 4 = 16 tests).

- [ ] **Step 5: Lint/format and full suite**

Run: `npm run check && npm run test`
Expected: Biome clean, all suites pass. If Biome complains about formatting, run `npm run format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lightMapping.ts src/renderer/__tests__/lightMapping.test.ts
git commit -m "feat(renderer): add lightMapping module for board-luminance crossfade"
```

---

### Task 2: Wire the crossfade into `wallRenderer`

**Files:**
- Modify: `src/renderer/wallRenderer.ts` (imports; `FrameDrawOptions`; `drawWall`; `drawShowcaseFrame`; ambient wash + fibre loop inside `drawFrame`)

**Interfaces:**
- Consumes (from Task 1): `ADDITIVE_FADE`, `SATURATION_BOOST`, `boostSaturation(color: RGB, amount: number): RGB`, `floorIntensity(i: number): number`, `lightBoardFactor(hex: string): number`.
- Produces: `FrameDrawOptions` gains `lightFactor: number` (internal interface; no external consumers).

Background for the implementer: in the current code, `ctx.globalCompositeOperation = "lighter"` is set once **before** the fibre loop — so the faint fibre-body strokes are additive too, which is why they also vanish on white. The restructure below keeps those body strokes additive and unchanged (dark board stays pixel-identical at factor 0) and adds a separate source-over body overlay + graphic pass that only activates as the factor rises. Segment light values are computed once per segment and shared by both passes, so `ledColor`/`blendSegment` are not called twice.

- [ ] **Step 1: Add imports**

In `src/renderer/wallRenderer.ts`, the imports currently read:

```ts
import { ledColor } from "@/engine/animation";
import { blendSegment, delayedTime } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, Point } from "@/engine/types";
import { computeDimensionSegments, drawDimensions } from "./dimensions";
import { computeWallLayout, frameGradientPos, frameRect } from "./viewport";
```

Replace with:

```ts
import { ledColor } from "@/engine/animation";
import { blendSegment, delayedTime } from "@/engine/light";
import type { SegmentLight } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, Point } from "@/engine/types";
import { computeDimensionSegments, drawDimensions } from "./dimensions";
import {
  ADDITIVE_FADE,
  SATURATION_BOOST,
  boostSaturation,
  floorIntensity,
  lightBoardFactor,
} from "./lightMapping";
import { computeWallLayout, frameGradientPos, frameRect } from "./viewport";
```

- [ ] **Step 2: Thread `lightFactor` through the option types and callers**

In `interface FrameDrawOptions`, after the `boardColor: string;` field, add:

```ts
  /** 0 dark board → 1 light board; drives the additive↔graphic crossfade. */
  lightFactor: number;
```

In `drawWall`, before the `for (let index = 0; ...)` frame loop, compute the factor once (the fibre backdrop is always `boardColor`; frame colours only tint the bezel):

```ts
  const lightFactor = lightBoardFactor(state.boardColor);
```

and add `lightFactor,` to the options object passed to `drawFrame` (next to `boardColor: state.boardColor,`).

In `drawShowcaseFrame`, add to the options object passed to `drawFrame` (next to `boardColor: DEFAULT_BOARD_COLOR,`):

```ts
    lightFactor: lightBoardFactor(DEFAULT_BOARD_COLOR),
```

In `drawFrame`, add `lightFactor` to the destructuring of `opts`, and directly below the destructuring add the short alias used throughout the fibre code:

```ts
  const f = lightFactor;
```

- [ ] **Step 3: Fade the ambient wash**

In `drawFrame`, the ambient gradient's centre stop currently reads:

```ts
  ambientGradient.addColorStop(
    0,
    `rgba(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0},0.14)`,
  );
```

Replace with (dark-room ambience fades out on lit boards):

```ts
  ambientGradient.addColorStop(
    0,
    `rgba(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0},${(0.14 * (1 - f)).toFixed(3)})`,
  );
```

- [ ] **Step 4: Replace the fibre loop with the two-pass version**

Replace everything from the line `ctx.globalCompositeOperation = "lighter";` (just before `for (const fiber of frame.fibers)`) through the matching `ctx.globalCompositeOperation = "source-over";` reset after the loop, with:

```ts
  for (const fiber of frame.fibers) {
    const pts = fiber.path;
    const n = pts.length;
    const ledA = frame.leds[fiber.startLedIndex];
    const ledB = frame.leds[fiber.endLedIndex];

    const tracePath = () => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = x + pts[i].x * sz;
        const py = y + pts[i].y * sz;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
    };
    const strokeSeg = (i: number, style: string, width: number) => {
      ctx.beginPath();
      ctx.moveTo(x + pts[i - 1].x * sz, y + pts[i - 1].y * sz);
      ctx.lineTo(x + pts[i].x * sz, y + pts[i].y * sz);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    // Light at each segment, computed once and shared by both passes below.
    const segs: SegmentLight[] = [];
    for (let i = 1; i < n; i++) {
      const um = (i - 0.5) / (n - 1);
      const lightA = ledColor(
        ledA,
        gpos,
        delayedTime(time, um * fiber.length),
        anim,
        speed,
        palette,
      );
      const lightB = ledColor(
        ledB,
        gpos,
        delayedTime(time, (1 - um) * fiber.length),
        anim,
        speed,
        palette,
      );
      segs.push(blendSegment(lightA, lightB, um));
    }

    const bodyColor = samplePalette(palette, fiber.hueBase);

    // Additive pass — the dark-room look; fades out as the board brightens,
    // where adding light to an already-bright board cannot produce contrast.
    ctx.globalCompositeOperation = "lighter";

    // passive plastic light-guide (faint tinted body — continuous, no dots)
    ctx.lineCap = "round";
    tracePath();
    ctx.strokeStyle = `rgba(${bodyColor[0] | 0},${bodyColor[1] | 0},${bodyColor[2] | 0},0.07)`;
    ctx.lineWidth = fiber.thickness * sz * 0.028;
    ctx.stroke();
    ctx.strokeStyle = "rgba(180,190,210,0.05)";
    ctx.lineWidth = fiber.thickness * sz * 0.01;
    ctx.stroke();

    // injected light from both LED ends — segments are stroked one at a
    // time (colour varies per-sample), so caps must be "butt": with the
    // additive "lighter" composite, round caps double up brightness where
    // adjacent segments' end-caps overlap, showing up as bead-like circles.
    ctx.lineCap = "butt";
    const addScale = 1 - ADDITIVE_FADE * f;
    if (addScale > 0.02) {
      for (let i = 1; i < n; i++) {
        const seg = segs[i - 1];
        if (!seg.visible) continue;
        const [cr, cg, cb] = seg.color;
        const inten = seg.intensity * brightness * addScale;
        strokeSeg(
          i,
          `rgba(${cr | 0},${cg | 0},${cb | 0},${(inten * 0.16 * GLOW).toFixed(3)})`,
          fiber.thickness * sz * 0.05 * GLOW,
        );
        strokeSeg(
          i,
          `rgba(${Math.min(255, cr + 70) | 0},${Math.min(255, cg + 70) | 0},${Math.min(255, cb + 70) | 0},${Math.min(1, inten).toFixed(3)})`,
          fiber.thickness * sz * 0.014,
        );
      }
    }

    // Graphic pass — opaque saturated strokes with a legibility floor, so
    // the wall stays readable on light boards. Culled (invisible) segments
    // still draw at the floor, tinted with the fibre's body hue, keeping the
    // whole path faintly present like a real side-glow fibre in a lit room.
    ctx.globalCompositeOperation = "source-over";
    if (f > 0.01) {
      ctx.lineCap = "round";
      tracePath();
      ctx.strokeStyle = `rgba(${bodyColor[0] | 0},${bodyColor[1] | 0},${bodyColor[2] | 0},${(0.1 * f).toFixed(3)})`;
      ctx.lineWidth = fiber.thickness * sz * 0.028;
      ctx.stroke();
      ctx.strokeStyle = `rgba(180,190,210,${(0.1 * f).toFixed(3)})`;
      ctx.lineWidth = fiber.thickness * sz * 0.01;
      ctx.stroke();

      ctx.lineCap = "butt";
      for (let i = 1; i < n; i++) {
        const seg = segs[i - 1];
        const raw = seg.visible ? seg.intensity * brightness : 0;
        const ip = floorIntensity(raw);
        const sat = boostSaturation(
          seg.visible ? seg.color : bodyColor,
          SATURATION_BOOST,
        );
        strokeSeg(
          i,
          `rgba(${sat[0] | 0},${sat[1] | 0},${sat[2] | 0},${(0.45 * ip * f).toFixed(3)})`,
          fiber.thickness * sz * 0.05,
        );
        strokeSeg(
          i,
          `rgba(${(sat[0] * 0.82) | 0},${(sat[1] * 0.82) | 0},${(sat[2] * 0.82) | 0},${(Math.min(1, ip) * f).toFixed(3)})`,
          fiber.thickness * sz * 0.016,
        );
      }
    }
  }
  ctx.globalCompositeOperation = "source-over";
```

Notes for the implementer:
- The spec expresses the body-stroke change as "alpha 0.07 → 0.07 + 0.10·f". It is implemented here as the unchanged additive 0.07 stroke **plus** a source-over 0.10·f overlay — equivalent visibility, but keeps the dark board bit-identical (the additive stroke is untouched) and gives the overlay real opacity on white where additive strokes do nothing.
- Do not "simplify" the two `strokeSeg` calls per pass into one: widths and colours differ (soft underlay vs. bright core), matching the pre-existing additive structure.
- `GLOW` stays only on the additive pass — it is the historical design prop; the graphic pass uses the spec widths directly.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm run test && npm run check`
Expected: all suites pass (including the untouched `wallRenderer.test.ts` and Task 1's `lightMapping.test.ts`); Biome clean. If Biome flags formatting, run `npm run format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/wallRenderer.ts
git commit -m "feat(renderer): crossfade fibre light to legibility-floor pass on light boards"
```

---

### Task 3: Visual and performance verification

**Files:**
- Modify (only if the perf fallback is needed): `src/renderer/lightMapping.ts`

**Interfaces:**
- Consumes: the running app (`npm run dev`, port 3000) with Tasks 1–2 merged.
- Produces: sign-off against the spec's acceptance criteria; possibly one constant change.

- [ ] **Step 1: Visual sweep**

Run: `npm run dev` and open `http://localhost:3000`. Create/open a wall (3×3 is fine). Using the board colour control in the UI, check each of:

1. **Default dark board (`#101114`)** — edit and sim modes look exactly like the pre-change app: additive glow, faint bodies, no opaque strands. (Factor is 0; if anything looks different here, Task 2 has a bug — stop and fix.)
2. **White board (~`#f6f6f8`)** — every fibre's full path is visible as a pale tinted strand; bright animation stretches read as saturated opaque colour; the show is roughly as legible as on dark.
3. **Mid grey (~`#6b6b6b`)** — both regimes coexist without banding or popping; drag the colour picker continuously and confirm no sudden jumps.
4. **Sim mode on white** — same legibility (fibre drawing is shared between modes; this guards the mode-specific bezel/ambient paths).

- [ ] **Step 2: Performance check**

With the dev server running: 5×5 grid, board colour white, sim mode, an animation playing. Open Chrome DevTools → Cmd+Shift+P → "Show frames per second (FPS) meter" (or Performance panel recording ~5s).
Expected: steady ≥ 60fps (the signed-off budget; 6×6 may drop to ~44fps as before).

- [ ] **Step 3 (only if Step 2 misses 60fps): apply the approved fallback**

In `src/renderer/lightMapping.ts`, change:

```ts
/** Fraction of the additive pass faded out at full light-board factor. */
export const ADDITIVE_FADE = 0.85;
```

to:

```ts
/**
 * Fraction of the additive pass faded out at full light-board factor.
 * 1.0 = fully skipped on white boards (perf fallback approved in the spec:
 * at high factor the additive contribution is visually negligible, and
 * skipping it restores ~2 strokes/segment).
 */
export const ADDITIVE_FADE = 1.0;
```

Then re-run Step 1's dark-board and white-board checks (dark board is unaffected — the factor is 0 there) and Step 2's FPS check. Run `npm run test && npm run check`, then commit:

```bash
git add src/renderer/lightMapping.ts
git commit -m "perf(renderer): skip additive fibre pass entirely on white boards"
```

- [ ] **Step 4: Final verification and report**

Run: `npm run test && npm run check && npm run build`
Expected: all pass. Report the observed FPS numbers and which board colours were checked — no success claims without having run these.
