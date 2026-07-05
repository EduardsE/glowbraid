# Real Measurements (cm) + Blueprint Dimension Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-unit `frameSize`/`frameGap`/`boardPadding` to real centimetres and add an optional blueprint-style dimension overlay on the wall canvas.

**Architecture:** The viewport math is unit-agnostic (it normalizes the board to fit the canvas), so the cm switch is a re-unit of state, UI ranges, and persistence — no engine or layout-math changes. The overlay is a new renderer module split into a pure, unit-tested segment-geometry function and a dumb Canvas2D draw function, called at the end of `drawWall` behind a `showMeasurements` flag.

**Tech Stack:** TypeScript, React 19 (UI shell only), Canvas2D, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-07-05-real-measurements-design.md`

## Global Constraints

- Slider ranges/steps: frame size **10–40 cm step 1 default 25**, frame spacing **0–15 cm step 1 default 2**, board padding **0–20 cm step 1 default 4**.
- All measurement labels are integer centimetres formatted exactly `` `${n} cm` `` (e.g. `25 cm`, `87 cm`). Never metres.
- Total board size in cm = `gridSize * frameSize + (gridSize - 1) * frameGap + 2 * boardPadding`.
- No changes under `src/engine/` except doc comments + one new `ProjectSnapshot` field (`showMeasurements`). RNG draw order in `fibers.ts` must not be touched.
- No `ctx.shadowBlur` or per-frame filter effects anywhere (project-wide perf rule).
- No legacy-save migration: the loader clamps out-of-range numbers into the new cm ranges.
- Every task must end with `npm run test` and `npm run check` passing.
- Path alias: use `@/` imports (matches existing code).

---

### Task 1: Pure dimension-segment computation (`computeDimensionSegments`)

**Files:**
- Create: `src/renderer/dimensions.ts`
- Test: `src/renderer/__tests__/dimensions.test.ts`

**Interfaces:**
- Consumes: `WallLayout`, `frameRect` from `src/renderer/viewport.ts` (existing); `Point` from `src/engine/types.ts` (existing).
- Produces: `DimSegment { a: Point; b: Point; orientation: "horizontal" | "vertical"; label: string; edge: number }`, constants `DIM_NEAR_OFFSET = 18` / `DIM_FAR_OFFSET = 40`, and `computeDimensionSegments(layout: WallLayout, cm: DimensionCm): DimSegment[]` where `DimensionCm = { frameSizeCm: number; frameGapCm: number; boardPaddingCm: number }`. Segment order is fixed and load-bearing for tests: `[totalWidth, totalHeight, boardPadding?, frameSize, frameGap?]` (optional entries skipped when zero / grid size 1). `edge` is the board-edge coordinate extension lines reach toward: `boardY` for horizontal segments, `boardX` for the vertical one. Task 2 consumes `DimSegment[]`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/dimensions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeDimensionSegments,
  DIM_FAR_OFFSET,
  DIM_NEAR_OFFSET,
} from "../dimensions";
import { computeWallLayout, frameRect } from "../viewport";

const CM = { frameSizeCm: 25, frameGapCm: 2, boardPaddingCm: 4 };

function layoutFor(gridSize: number, cm = CM) {
  return computeWallLayout({
    gridSize,
    frameSize: cm.frameSizeCm,
    frameGap: cm.frameGapCm,
    boardPadding: cm.boardPaddingCm,
    zoom: 1,
    pan: { x: 0, y: 0 },
    canvasWidth: 1000,
    canvasHeight: 800,
  });
}

describe("computeDimensionSegments", () => {
  it("emits total width across the board on the far row", () => {
    const layout = layoutFor(3);
    const [totalW] = computeDimensionSegments(layout, CM);
    // 3*25 + 2*2 + 2*4 = 87
    expect(totalW.label).toBe("87 cm");
    expect(totalW.orientation).toBe("horizontal");
    expect(totalW.a.x).toBeCloseTo(layout.boardX);
    expect(totalW.b.x).toBeCloseTo(layout.boardX + layout.boardSize);
    expect(totalW.a.y).toBeCloseTo(layout.boardY - DIM_FAR_OFFSET);
    expect(totalW.b.y).toBeCloseTo(layout.boardY - DIM_FAR_OFFSET);
    expect(totalW.edge).toBeCloseTo(layout.boardY);
  });

  it("emits total height down the left side", () => {
    const layout = layoutFor(3);
    const [, totalH] = computeDimensionSegments(layout, CM);
    expect(totalH.label).toBe("87 cm");
    expect(totalH.orientation).toBe("vertical");
    expect(totalH.a.y).toBeCloseTo(layout.boardY);
    expect(totalH.b.y).toBeCloseTo(layout.boardY + layout.boardSize);
    expect(totalH.a.x).toBeCloseTo(layout.boardX - DIM_NEAR_OFFSET);
    expect(totalH.b.x).toBeCloseTo(layout.boardX - DIM_NEAR_OFFSET);
    expect(totalH.edge).toBeCloseTo(layout.boardX);
  });

  it("near row aligns padding, frame, and gap segments with the first frame", () => {
    const layout = layoutFor(3);
    const segments = computeDimensionSegments(layout, CM);
    expect(segments).toHaveLength(5);
    const [, , padding, frame, gap] = segments;
    const first = frameRect(layout, 0);
    const second = frameRect(layout, 1);
    const nearY = layout.boardY - DIM_NEAR_OFFSET;

    expect(padding.label).toBe("4 cm");
    expect(padding.a.x).toBeCloseTo(layout.boardX);
    expect(padding.b.x).toBeCloseTo(first.x);
    expect(padding.a.y).toBeCloseTo(nearY);

    expect(frame.label).toBe("25 cm");
    expect(frame.a.x).toBeCloseTo(first.x);
    expect(frame.b.x).toBeCloseTo(first.x + first.size);
    expect(frame.a.y).toBeCloseTo(nearY);

    expect(gap.label).toBe("2 cm");
    expect(gap.a.x).toBeCloseTo(first.x + first.size);
    expect(gap.b.x).toBeCloseTo(second.x);
    expect(gap.a.y).toBeCloseTo(nearY);
  });

  it("skips the gap segment when gridSize is 1", () => {
    const layout = layoutFor(1);
    const segments = computeDimensionSegments(layout, CM);
    // totalW, totalH, padding, frame — no gap
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.label)).not.toContain("2 cm");
  });

  it("skips zero-valued gap and padding segments", () => {
    const cm = { frameSizeCm: 25, frameGapCm: 0, boardPaddingCm: 0 };
    const layout = layoutFor(3, cm);
    const segments = computeDimensionSegments(layout, cm);
    // totalW, totalH, frame — no padding, no gap
    expect(segments).toHaveLength(3);
    expect(segments[2].label).toBe("25 cm");
    // total = 3*25 = 75
    expect(segments[0].label).toBe("75 cm");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/dimensions.test.ts`
Expected: FAIL — cannot resolve `../dimensions` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/renderer/dimensions.ts`:

```ts
import type { Point } from "@/engine/types";
import { frameRect, type WallLayout } from "./viewport";

/** One blueprint dimension line in canvas px, plus its printed label. */
export interface DimSegment {
  a: Point;
  b: Point;
  orientation: "horizontal" | "vertical";
  label: string;
  /** Board-edge coordinate (y for horizontal, x for vertical) that extension lines reach toward. */
  edge: number;
}

export interface DimensionCm {
  frameSizeCm: number;
  frameGapCm: number;
  boardPaddingCm: number;
}

/** Screen-px offsets from the board edge, fixed regardless of zoom so labels stay readable. */
export const DIM_NEAR_OFFSET = 18;
export const DIM_FAR_OFFSET = 40;

/**
 * Segments in fixed order: total width (far row above the board), total
 * height (left of the board), then the near row above the board reading
 * left-to-right across the first frame: board padding, frame size, frame
 * gap. Zero-valued padding/gap segments (and the gap on a 1×1 grid) are
 * skipped.
 */
export function computeDimensionSegments(
  layout: WallLayout,
  cm: DimensionCm,
): DimSegment[] {
  const { boardX, boardY, boardSize, gridSize } = layout;
  const totalCm =
    gridSize * cm.frameSizeCm +
    (gridSize - 1) * cm.frameGapCm +
    2 * cm.boardPaddingCm;
  const nearY = boardY - DIM_NEAR_OFFSET;
  const farY = boardY - DIM_FAR_OFFSET;
  const leftX = boardX - DIM_NEAR_OFFSET;
  const first = frameRect(layout, 0);

  const segments: DimSegment[] = [
    {
      a: { x: boardX, y: farY },
      b: { x: boardX + boardSize, y: farY },
      orientation: "horizontal",
      label: `${totalCm} cm`,
      edge: boardY,
    },
    {
      a: { x: leftX, y: boardY },
      b: { x: leftX, y: boardY + boardSize },
      orientation: "vertical",
      label: `${totalCm} cm`,
      edge: boardX,
    },
  ];

  if (cm.boardPaddingCm > 0) {
    segments.push({
      a: { x: boardX, y: nearY },
      b: { x: first.x, y: nearY },
      orientation: "horizontal",
      label: `${cm.boardPaddingCm} cm`,
      edge: boardY,
    });
  }

  segments.push({
    a: { x: first.x, y: nearY },
    b: { x: first.x + first.size, y: nearY },
    orientation: "horizontal",
    label: `${cm.frameSizeCm} cm`,
    edge: boardY,
  });

  if (gridSize > 1 && cm.frameGapCm > 0) {
    const second = frameRect(layout, 1);
    segments.push({
      a: { x: first.x + first.size, y: nearY },
      b: { x: second.x, y: nearY },
      orientation: "horizontal",
      label: `${cm.frameGapCm} cm`,
      edge: boardY,
    });
  }

  return segments;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/dimensions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Full verification and commit**

Run: `npm run test` — all suites pass.
Run: `npm run check` — Biome clean (if it flags formatting, run `npm run format` and re-check).

```bash
git add src/renderer/dimensions.ts src/renderer/__tests__/dimensions.test.ts
git commit -m "feat(renderer): pure blueprint dimension segment computation"
```

---

### Task 2: cm units in state + UI (sliders, checkbox)

**Files:**
- Modify: `src/components/filament/FilamentStudio.tsx:30-74` (StudioState + INITIAL_STATE), `:434-458` (LeftPanel props)
- Modify: `src/components/filament/LeftPanel.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `StudioState.showMeasurements: boolean` (default `false`) and cm defaults `frameSize: 25, frameGap: 2, boardPadding: 4` — Tasks 3 and 4 read `s.showMeasurements` from `uiRef`/snapshot. `LeftPanelProps` gains `showMeasurements: boolean` and `onShowMeasurements: (v: boolean) => void`.

Note: after this task the checkbox renders and toggles state but has no visual effect yet — the overlay draw lands in Task 3. The wall itself renders identically (viewport math only uses ratios, and 25:2:4 ≈ the old 236:20:40).

- [ ] **Step 1: Re-unit StudioState defaults**

In `src/components/filament/FilamentStudio.tsx`, add the field to `StudioState` (after `boardPadding: number;`):

```ts
  boardPadding: number;
  showMeasurements: boolean;
```

and change `INITIAL_STATE`:

```ts
  frameSize: 25,
  frameGap: 2,
  boardPadding: 4,
  showMeasurements: false,
```

(replacing `frameSize: 236, frameGap: 20, boardPadding: 40,`).

- [ ] **Step 2: Update LeftPanel sliders and add the checkbox**

In `src/components/filament/LeftPanel.tsx`, add to `LeftPanelProps` (after `onBoardPadding`):

```ts
  showMeasurements: boolean;
  onShowMeasurements: (v: boolean) => void;
```

Replace the three wall `SliderRow`s with cm ranges/labels:

```tsx
      <SliderRow label="Frame size" value={`${props.frameSize} cm`}>
        <input
          type="range"
          aria-label="Frame size"
          min={10}
          max={40}
          step={1}
          value={props.frameSize}
          onChange={(e) => props.onFrameSize(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Frame spacing" value={`${props.frameGap} cm`}>
        <input
          type="range"
          aria-label="Frame spacing"
          min={0}
          max={15}
          step={1}
          value={props.frameGap}
          onChange={(e) => props.onFrameGap(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Board padding" value={`${props.boardPadding} cm`}>
        <input
          type="range"
          aria-label="Board padding"
          min={0}
          max={20}
          step={1}
          value={props.boardPadding}
          onChange={(e) => props.onBoardPadding(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-xs text-[rgba(233,234,240,0.7)]">
          Show measurements
        </span>
        <input
          type="checkbox"
          aria-label="Show measurements"
          checked={props.showMeasurements}
          onChange={(e) => props.onShowMeasurements(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-[#9b8cff]"
        />
      </label>
```

- [ ] **Step 3: Wire the new props in FilamentStudio**

In the `<LeftPanel>` element in `FilamentStudio.tsx`, after `onBoardPadding={(n) => patch({ boardPadding: n })}`:

```tsx
          showMeasurements={ui.showMeasurements}
          onShowMeasurements={(v) => patch({ showMeasurements: v })}
```

- [ ] **Step 4: Verify**

Run: `npm run test` — all pass (no test reads the defaults).
Run: `npm run check` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/filament/FilamentStudio.tsx src/components/filament/LeftPanel.tsx
git commit -m "feat(ui): cm units for wall dimensions and show-measurements toggle"
```

---

### Task 3: Draw the overlay (`drawDimensions` + `drawWall` integration)

**Files:**
- Modify: `src/renderer/dimensions.ts` (append `drawDimensions`)
- Modify: `src/renderer/wallRenderer.ts:90-106` (WallDrawState), `:137-190` (drawWall)
- Modify: `src/components/filament/FilamentStudio.tsx:169-185` (drawWall call)

**Interfaces:**
- Consumes: `DimSegment`, `computeDimensionSegments` from Task 1; `StudioState.showMeasurements` from Task 2.
- Produces: `drawDimensions(ctx: CanvasRenderingContext2D, segments: DimSegment[]): void`; `WallDrawState.showMeasurements: boolean` (required field).

Canvas drawing is not unit-testable here (Vitest runs plain `.ts` with no DOM), so this task's verification is typecheck + existing suites + a manual visual check.

- [ ] **Step 1: Append `drawDimensions` to `src/renderer/dimensions.ts`**

```ts
const DIM_STROKE = "rgba(140, 180, 220, 0.5)";
const DIM_TEXT = "rgba(140, 180, 220, 0.9)";
const DIM_FONT = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
const TICK = 4;
/** Extension lines stop this far short of the measured edge. */
const EXT_GAP = 2;

export function drawDimensions(
  ctx: CanvasRenderingContext2D,
  segments: DimSegment[],
): void {
  ctx.save();
  ctx.strokeStyle = DIM_STROKE;
  ctx.fillStyle = DIM_TEXT;
  ctx.lineWidth = 1;
  ctx.font = DIM_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const seg of segments) {
    const mx = (seg.a.x + seg.b.x) / 2;
    const my = (seg.a.y + seg.b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(seg.a.x, seg.a.y);
    ctx.lineTo(seg.b.x, seg.b.y);
    if (seg.orientation === "horizontal") {
      // End ticks + extension lines toward the board edge.
      for (const x of [seg.a.x, seg.b.x]) {
        ctx.moveTo(x, seg.a.y - TICK);
        ctx.lineTo(x, seg.a.y + TICK);
        ctx.moveTo(x, seg.a.y + TICK);
        ctx.lineTo(x, seg.edge - EXT_GAP);
      }
      ctx.stroke();
      ctx.fillText(seg.label, mx, seg.a.y - 7);
    } else {
      for (const y of [seg.a.y, seg.b.y]) {
        ctx.moveTo(seg.a.x - TICK, y);
        ctx.lineTo(seg.a.x + TICK, y);
        ctx.moveTo(seg.a.x + TICK, y);
        ctx.lineTo(seg.edge - EXT_GAP, y);
      }
      ctx.stroke();
      ctx.save();
      ctx.translate(seg.a.x - 7, my);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(seg.label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
```

- [ ] **Step 2: Thread the flag through `wallRenderer.ts`**

Add the import at the top of `src/renderer/wallRenderer.ts`:

```ts
import { computeDimensionSegments, drawDimensions } from "./dimensions";
```

Add to `WallDrawState` (after `boardPadding: number;`):

```ts
  showMeasurements: boolean;
```

At the end of `drawWall`, after the frame draw loop (after the `for` loop's closing brace, before the function's closing brace):

```ts
  if (state.showMeasurements) {
    drawDimensions(
      ctx,
      computeDimensionSegments(layout, {
        frameSizeCm: state.frameSize,
        frameGapCm: state.frameGap,
        boardPaddingCm: state.boardPadding,
      }),
    );
  }
```

- [ ] **Step 3: Pass the flag from FilamentStudio**

In the `drawWall(ctx, width, height, { ... })` call in `FilamentStudio.tsx` (inside `draw`), after `boardPadding: s.boardPadding,`:

```ts
      showMeasurements: s.showMeasurements,
```

- [ ] **Step 4: Verify**

Run: `npm run test` — all pass.
Run: `npm run check` — clean (this also typechecks via Biome lint; additionally `npm run build` must succeed if in doubt about types).

Manual check: `npm run dev`, generate a wall, tick "Show measurements" — dimension lines with cm labels appear above and left of the board, follow pan/zoom, and disappear when unticked. Verify in both Edit and Sim modes, and that a 1×1 grid shows no gap segment.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/dimensions.ts src/renderer/wallRenderer.ts src/components/filament/FilamentStudio.tsx
git commit -m "feat(renderer): blueprint dimension overlay on the wall canvas"
```

---

### Task 4: Persistence (snapshot field, save, load clamping)

**Files:**
- Modify: `src/engine/types.ts:81-100` (ProjectSnapshot)
- Modify: `src/components/filament/FilamentStudio.tsx:324-396` (handleSave, handleLoad)

**Interfaces:**
- Consumes: `StudioState.showMeasurements` from Task 2.
- Produces: `ProjectSnapshot.showMeasurements: boolean`; loader clamp helper `cmField(value: unknown, fallback: number, min: number, max: number): number`.

- [ ] **Step 1: Update `ProjectSnapshot` in `src/engine/types.ts`**

Replace the three size fields' declarations and add the toggle:

```ts
  gridSize: number;
  /** Frame edge length in centimetres (10–40). */
  frameSize: number;
  /** Gap between adjacent frames in centimetres (0–15). Absent in legacy saves → loader defaults to 2. */
  frameGap: number;
  /** Padding between the frame grid's outer edge and the board edge in centimetres (0–20). Absent in legacy saves → loader defaults to 4. */
  boardPadding: number;
  /** Blueprint dimension overlay toggle. Absent in legacy saves → loader defaults to false. */
  showMeasurements: boolean;
```

- [ ] **Step 2: Include the toggle in `handleSave`**

In the `snapshot: ProjectSnapshot` object literal in `FilamentStudio.tsx`, after `boardPadding: s.boardPadding,`:

```ts
      showMeasurements: s.showMeasurements,
```

- [ ] **Step 3: Clamp cm fields in `handleLoad`**

Add a module-level helper next to `styleAxis` in `FilamentStudio.tsx`:

```ts
/** Loader sanitizer: cm dimension → integer within [min, max], else fallback. */
function cmField(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
}
```

In `handleLoad`, replace the `frameGap` and `boardPadding` `Number.isFinite` blocks with:

```ts
    const frameSize = cmField(d.frameSize, 25, 10, 40);
    const frameGap = cmField(d.frameGap, 2, 0, 15);
    const boardPadding = cmField(d.boardPadding, 4, 0, 20);
```

and in the `patch({ ... })` call, replace `frameSize: d.frameSize,` with `frameSize,` and add after `boardPadding,`:

```ts
      showMeasurements: d.showMeasurements === true,
```

- [ ] **Step 4: Verify**

Run: `npm run test` — all pass.
Run: `npm run check` — clean.

Manual check: `npm run dev` — Save a wall with measurements on, reload the page, Load: cm values and the checkbox state round-trip. Hand-check the legacy clamp: in devtools, `localStorage` key `filament.project`, set `"frameSize":236`, Load → frame size slider reads 40 cm, no crash.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/components/filament/FilamentStudio.tsx
git commit -m "feat: persist cm dimensions and measurement toggle in project snapshot"
```
