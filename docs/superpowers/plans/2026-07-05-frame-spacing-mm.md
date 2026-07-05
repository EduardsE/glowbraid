# Frame Spacing in Millimetres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the "Frame spacing" control from whole centimetres (0–15) to whole millimetres (0–30), converting to the centimetre-space wall/dimension math at the point of consumption instead of changing that math's units.

**Architecture:** `frameGap` keeps its field name and `number` type everywhere (`ProjectSnapshot`, `StudioState`, `ViewportInput`, `DimensionCm`) — only its meaning changes, from cm to mm. `viewport.ts`'s `computeWallLayout` stays unit-agnostic cm math, untouched. The three call sites that currently pass `state.frameGap`/`s.frameGap` straight into that cm math divide by 10 first. The blueprint overlay's frame-gap segment gets a second, mm-flavored input (`frameGapMm`) so its own label reads in mm while the total-width sum stays in cm.

**Tech Stack:** TypeScript, Vitest, React (no new dependencies).

## Global Constraints

- Frame spacing slider: range 0–30, step 1, default 20, label format `` `${v} mm` ``.
- Frame size and board padding sliders/units are unchanged (cm).
- No legacy-save migration: an old snapshot's `frameGap` number is reinterpreted as mm as-is, then clamped into 0–30 by the existing `cmField` loader helper.
- `viewport.ts` (`ViewportInput`, `computeWallLayout`) and its test file are not modified — they keep taking a plain cm-space number.

---

### Task 1: `computeDimensionSegments` — mm label for the gap segment

**Files:**
- Modify: `src/renderer/dimensions.ts:14-18` (interface), `src/renderer/dimensions.ts:80-89` (gap segment)
- Test: `src/renderer/__tests__/dimensions.test.ts`

**Interfaces:**
- Consumes: existing `WallLayout` (from `src/renderer/viewport.ts`, unchanged), existing `frameRect` (unchanged).
- Produces: `DimensionCm` interface now requires a fourth field `frameGapMm: number`. `computeDimensionSegments(layout: WallLayout, cm: DimensionCm): DimSegment[]` — same signature, gap segment's `label` now reads from `cm.frameGapMm` formatted as `` `${n} mm` `` instead of `` `${n} cm` ``. This is what Task 2 (wallRenderer.ts) will call.

- [ ] **Step 1: Update the test fixture and gap-segment assertions to expect mm**

In `src/renderer/__tests__/dimensions.test.ts`, change the `CM` fixture (line 9) to include the new field, keeping `frameGapCm` as the cm-equivalent of the same physical gap used in the total-width sum:

```ts
const CM = { frameSizeCm: 25, frameGapCm: 2, frameGapMm: 20, boardPaddingCm: 4 };
```

Change the gap-segment assertion (currently `expect(gap.label).toBe("2 cm");` around line 69) to:

```ts
expect(gap.label).toBe("20 mm");
```

Change the "skips zero-valued gap and padding segments" fixture (currently `const cm = { frameSizeCm: 25, frameGapCm: 0, boardPaddingCm: 0 };` around line 84) to:

```ts
const cm = { frameSizeCm: 25, frameGapCm: 0, frameGapMm: 0, boardPaddingCm: 0 };
```

And the label check on the same test (currently `expect(segments.map((s) => s.label)).not.toContain("2 cm");` around line 80) to:

```ts
expect(segments.map((s) => s.label)).not.toContain("20 mm");
```

- [ ] **Step 2: Run the tests to see the new/changed assertions fail**

Run: `npx vitest run src/renderer/__tests__/dimensions.test.ts`
Expected: FAIL — `gap.label` is still `"2 cm"`, and `DimensionCm` literals in the test are missing/mismatched against the not-yet-updated interface (TypeScript will also flag the object literals once the interface changes in Step 3, so run this before Step 3 to confirm the *label* assertion fails against current behavior).

- [ ] **Step 3: Update `DimensionCm` and the gap segment label**

In `src/renderer/dimensions.ts`, change the interface (lines 14-18):

```ts
export interface DimensionCm {
  frameSizeCm: number;
  frameGapCm: number;
  frameGapMm: number;
  boardPaddingCm: number;
}
```

Change the gap segment block (lines 80-89):

```ts
  if (gridSize > 1 && cm.frameGapCm > 0) {
    const second = frameRect(layout, 1);
    segments.push({
      a: { x: first.x + first.size, y: nearY },
      b: { x: second.x, y: nearY },
      orientation: "horizontal",
      label: `${cm.frameGapMm} mm`,
      edge: boardY,
    });
  }
```

(Only the `label` line changes — from `` `${cm.frameGapCm} cm` `` to `` `${cm.frameGapMm} mm` ``. The gating condition stays on `frameGapCm` since a caller always passes both fields as zero or non-zero together.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/dimensions.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/dimensions.ts src/renderer/__tests__/dimensions.test.ts
git commit -m "feat(dimensions): label frame-gap segment in mm"
```

---

### Task 2: `wallRenderer.ts` — convert mm to cm at the layout and dimension-overlay call sites

**Files:**
- Modify: `src/renderer/wallRenderer.ts:139-203` (`drawWall`)

**Interfaces:**
- Consumes: `computeWallLayout` (`src/renderer/viewport.ts`, unchanged — expects `frameGap` in cm-equivalent units), `computeDimensionSegments`/`DimensionCm` from Task 1 (now requires `frameGapMm`).
- Produces: `WallDrawState.frameGap` (existing field, `src/renderer/wallRenderer.ts:95`) is now documented as millimetres — this is what Task 3 will populate from `StudioState.frameGap`.

No unit tests exist for `wallRenderer.ts` today (it's canvas-drawing code, not covered by the `src/**/*.test.ts` Vitest glob) — this task is verified by Task 5's manual check plus the type checker, since `DimensionCm` now requires `frameGapMm`.

- [ ] **Step 1: Convert the layout call**

In `src/renderer/wallRenderer.ts`, inside `drawWall` (around line 145-154), change:

```ts
  const layout = computeWallLayout({
    gridSize: state.gridSize,
    frameSize: state.frameSize,
    frameGap: state.frameGap,
    boardPadding: state.boardPadding,
    zoom: state.zoom,
    pan: state.pan,
    canvasWidth: width,
    canvasHeight: height,
  });
```

to:

```ts
  const layout = computeWallLayout({
    gridSize: state.gridSize,
    frameSize: state.frameSize,
    frameGap: state.frameGap / 10,
    boardPadding: state.boardPadding,
    zoom: state.zoom,
    pan: state.pan,
    canvasWidth: width,
    canvasHeight: height,
  });
```

- [ ] **Step 2: Convert the dimension-overlay call**

In the same function, change (around line 193-202):

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

to:

```ts
  if (state.showMeasurements) {
    drawDimensions(
      ctx,
      computeDimensionSegments(layout, {
        frameSizeCm: state.frameSize,
        frameGapCm: state.frameGap / 10,
        frameGapMm: state.frameGap,
        boardPaddingCm: state.boardPadding,
      }),
    );
  }
```

- [ ] **Step 3: Update the `WallDrawState.frameGap` doc**

In `src/renderer/wallRenderer.ts` around line 91-108, add a one-line doc comment above `frameGap: number;` (line 95) noting the unit, since every other numeric field here is a raw canvas/layout value with no unit ambiguity:

```ts
  /** Millimetres. */
  frameGap: number;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this will fail if Task 1's `frameGapMm` field is missing from this call, or if it was misspelled)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wallRenderer.ts
git commit -m "feat(wallRenderer): treat frameGap as millimetres, convert to cm for layout math"
```

---

### Task 3: `FilamentStudio.tsx` — mm default/bounds and the hit-test call site

**Files:**
- Modify: `src/engine/types.ts:85` (doc comment), `src/components/filament/FilamentStudio.tsx:59` (`INITIAL_STATE`), `src/components/filament/FilamentStudio.tsx:273-282` (click hit-test), `src/components/filament/FilamentStudio.tsx:378` (`handleLoad`)

**Interfaces:**
- Consumes: `computeWallLayout` (unchanged, cm-space `frameGap` input), `cmField` (existing helper in this file — clamp-and-default number sanitizer, signature `cmField(raw: unknown, fallback: number, min: number, max: number): number`, unchanged).
- Produces: `StudioState.frameGap` (existing field) now holds mm, default `20`, valid range `0–30` — this is what Task 4's `LeftPanel` props consume.

No unit tests exist for this file today (React component, outside the `src/**/*.test.ts` Vitest glob). Verified via Task 5's manual check plus `tsc`.

- [ ] **Step 1: Update the `ProjectSnapshot` doc comment**

In `src/engine/types.ts`, change the doc comment above `frameGap` (line 85):

```ts
  /** Gap between adjacent frames in centimetres (0–15). Absent in legacy saves → loader defaults to 2. */
```

to:

```ts
  /** Gap between adjacent frames in millimetres (0–30). Absent in legacy saves → loader defaults to 20. */
```

- [ ] **Step 2: Change the default**

In `src/components/filament/FilamentStudio.tsx`, change `INITIAL_STATE` (line 59):

```ts
  frameGap: 2,
```

to:

```ts
  frameGap: 20,
```

- [ ] **Step 3: Convert the click hit-test call**

Around lines 273-282, change:

```ts
      const layout = computeWallLayout({
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap,
        boardPadding: s.boardPadding,
        zoom: s.zoom,
        pan: panRef.current,
```

to:

```ts
      const layout = computeWallLayout({
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap / 10,
        boardPadding: s.boardPadding,
        zoom: s.zoom,
        pan: panRef.current,
```

(Check the following lines for `canvasWidth`/`canvasHeight` closing the call — leave those untouched, only the `frameGap` line changes.)

- [ ] **Step 4: Widen the load-time clamp range**

Around line 378, change:

```ts
    const frameGap = cmField(d.frameGap, 2, 0, 15);
```

to:

```ts
    const frameGap = cmField(d.frameGap, 20, 0, 30);
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/components/filament/FilamentStudio.tsx
git commit -m "feat(studio): default frame spacing to 20mm, clamp loads to 0-30mm"
```

---

### Task 4: `LeftPanel.tsx` — slider range and label

**Files:**
- Modify: `src/components/filament/LeftPanel.tsx:68-79`

**Interfaces:**
- Consumes: `props.frameGap` / `props.onFrameGap` (existing `LeftPanelProps` fields, unchanged types) — now populated with mm values by `FilamentStudio.tsx` per Task 3.
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Update the slider**

In `src/components/filament/LeftPanel.tsx`, change the "Frame spacing" `SliderRow` (lines 68-79):

```tsx
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
```

to:

```tsx
      <SliderRow label="Frame spacing" value={`${props.frameGap} mm`}>
        <input
          type="range"
          aria-label="Frame spacing"
          min={0}
          max={30}
          step={1}
          value={props.frameGap}
          onChange={(e) => props.onFrameGap(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/filament/LeftPanel.tsx
git commit -m "feat(ui): frame spacing slider in millimetres, 0-30 range"
```

---

### Task 5: Manual verification

**Files:** none (no code changes — this task drives the running app)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the updated `dimensions.test.ts` from Task 1.

- [ ] **Step 2: Run lint/format check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Start the dev server and exercise the feature**

Run: `npm run dev`, open the app in a browser.

- Confirm the "Frame spacing" slider reads "0 mm"–"30 mm" and defaults to "20 mm" on a fresh/empty project.
- Drag it across its range; confirm the visual gap between frames changes smoothly and proportionally to frame size (no sudden jump or a gap that looks 10x too large/small).
- Toggle "Show measurements" on; confirm the blueprint overlay's frame-gap annotation reads e.g. "20 mm" (not "2 cm" or "0.2 cm"), while total width/height, frame size, and padding annotations still read in cm.
- Click a frame to select it (hit-testing depends on the converted `computeWallLayout` call in Task 3) — confirm clicks land on the correct frame at a few different spacing values, not offset.
- Save the project, reload the page, load it back; confirm the spacing slider and overlay both still read the same mm value.

- [ ] **Step 4: Stop the dev server**

No commit for this task — it's verification only.
