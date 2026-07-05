# Board Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backing board behind the frame grid, with a user-controlled uniform padding (0–120px, default 40) between the frame grid's outer edge and the board's edge.

**Architecture:** `computeWallLayout` (`src/renderer/viewport.ts`) fits the *board* (frame grid + padding) into the existing 82%-of-canvas viewport box, instead of fitting the tight frame grid. It returns extra `boardX`/`boardY`/`boardSize` fields the renderer uses to fill a flat rect behind the frames before the existing per-frame draw loop. `boardPadding` is threaded through `StudioState`, `WallDrawState`, and `ProjectSnapshot` the same way the existing `frameGap` axis is.

**Tech Stack:** TypeScript, React, Canvas2D, Vitest.

## Global Constraints

- Padding range 0–120px, step 2, default 40 (spec: "Padding range").
- At `boardPadding = 0` the board equals the frame grid's tight outline, bit-for-bit identical layout to pre-feature behavior (spec: "Data model" / "Layout math").
- Board fill is flat dark neutral `#101114`, square corners, `rgba(255,255,255,0.06)` 1px stroke, no shadow/gradient (spec: "Rendering").
- Legacy saves without `boardPadding` load with default 40 (spec: "Data model").
- Uniform padding only — no per-side values (spec: "Non-goals").

---

### Task 1: `boardPadding` in `ProjectSnapshot` type

**Files:**
- Modify: `src/engine/types.ts:80-98` (the `ProjectSnapshot` interface)

**Interfaces:**
- Produces: `ProjectSnapshot.boardPadding: number` — consumed by Task 4 (save/load) and by any future snapshot readers.

This is a type-only change; there's no runtime behavior to test in isolation, so it's verified by the type-checker in Task 4's step instead of its own test. Fold it into the type edit directly:

- [ ] **Step 1: Add the field**

In `src/engine/types.ts`, inside `ProjectSnapshot`, add a field after `frameGap`:

```ts
  /** Pixel gap between adjacent frames. Absent in legacy saves → loader defaults to 20. */
  frameGap: number;
  /** Pixel padding between the frame grid's outer edge and the board edge. Absent in legacy saves → loader defaults to 40. */
  boardPadding: number;
```

- [ ] **Step 2: Typecheck (expect a new error, not a clean pass)**

Run: `npx tsc --noEmit`
Expected: New errors appear at every call site that builds a `ProjectSnapshot` object literal without `boardPadding` (currently only `handleSave` in `src/components/filament/FilamentStudio.tsx`). This confirms the type is wired correctly; Task 4 fixes the call site.

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat(engine): add boardPadding to ProjectSnapshot"
```

---

### Task 2: Board-aware layout math in `computeWallLayout`

**Files:**
- Modify: `src/renderer/viewport.ts` (whole file — it's 85 lines, shown in full below for exact context)
- Test: `src/renderer/__tests__/viewport.test.ts` (new file — no renderer tests exist yet, following the `src/engine/__tests__` convention)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `ViewportInput.boardPadding: number`, `WallLayout.boardX/boardY/boardSize: number` — consumed by Task 3 (`drawWall`) and Task 5 (`FilamentStudio` call sites).

Current file for reference:

```ts
import type { Point } from "@/engine/types";

export interface ViewportInput {
  gridSize: number;
  frameSize: number;
  frameGap: number;
  zoom: number;
  pan: Point;
  canvasWidth: number;
  canvasHeight: number;
}

export interface WallLayout {
  gap: number;
  scale: number;
  tx: number;
  ty: number;
  frameSize: number;
  gridSize: number;
}

/** Wall fills 82% of the canvas at zoom 1, centered plus pan offset. */
export function computeWallLayout(input: ViewportInput): WallLayout {
  const { gridSize, frameSize, frameGap, zoom, pan, canvasWidth, canvasHeight } =
    input;
  const wall = gridSize * frameSize + (gridSize - 1) * frameGap;
  const base = Math.min(
    (canvasWidth * 0.82) / wall,
    (canvasHeight * 0.82) / wall,
  );
  const scale = base * zoom;
  return {
    gap: frameGap,
    scale,
    frameSize,
    gridSize,
    tx: canvasWidth / 2 + pan.x - (scale * wall) / 2,
    ty: canvasHeight / 2 + pan.y - (scale * wall) / 2,
  };
}
```

(`frameRect`, `frameGradientPos`, `pickFrame` below this point are unchanged — they only read `tx`/`ty`/`scale`/`gap`/`frameSize`/`gridSize`, all of which keep their current meaning.)

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/__tests__/viewport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeWallLayout, frameRect } from "../viewport";

const BASE_INPUT = {
  gridSize: 3,
  frameSize: 200,
  frameGap: 20,
  zoom: 1,
  pan: { x: 0, y: 0 },
  canvasWidth: 1000,
  canvasHeight: 800,
};

describe("computeWallLayout", () => {
  it("boardPadding=0 matches the pre-board-feature layout exactly", () => {
    const layout = computeWallLayout({ ...BASE_INPUT, boardPadding: 0 });
    const wall =
      BASE_INPUT.gridSize * BASE_INPUT.frameSize +
      (BASE_INPUT.gridSize - 1) * BASE_INPUT.frameGap;
    const base = Math.min(
      (BASE_INPUT.canvasWidth * 0.82) / wall,
      (BASE_INPUT.canvasHeight * 0.82) / wall,
    );
    expect(layout.scale).toBeCloseTo(base * BASE_INPUT.zoom);
    expect(layout.tx).toBeCloseTo(
      BASE_INPUT.canvasWidth / 2 - (layout.scale * wall) / 2,
    );
    expect(layout.ty).toBeCloseTo(
      BASE_INPUT.canvasHeight / 2 - (layout.scale * wall) / 2,
    );
    expect(layout.boardX).toBeCloseTo(layout.tx);
    expect(layout.boardY).toBeCloseTo(layout.ty);
    expect(layout.boardSize).toBeCloseTo(layout.scale * wall);
  });

  it("positive boardPadding shrinks scale relative to boardPadding=0", () => {
    const flat = computeWallLayout({ ...BASE_INPUT, boardPadding: 0 });
    const padded = computeWallLayout({ ...BASE_INPUT, boardPadding: 40 });
    expect(padded.scale).toBeLessThan(flat.scale);
  });

  it("frame placement is still consistent with tx/ty/scale/gap regardless of boardPadding", () => {
    const layout = computeWallLayout({ ...BASE_INPUT, boardPadding: 40 });
    const rect = frameRect(layout, 4); // center frame of a 3x3 grid
    const gx = 1;
    const gy = 1;
    expect(rect.x).toBeCloseTo(
      layout.tx + gx * (layout.frameSize + layout.gap) * layout.scale,
    );
    expect(rect.y).toBeCloseTo(
      layout.ty + gy * (layout.frameSize + layout.gap) * layout.scale,
    );
    expect(rect.size).toBeCloseTo(layout.frameSize * layout.scale);
  });

  it("board fully encloses the frame grid with the padding inset on all sides", () => {
    const layout = computeWallLayout({ ...BASE_INPUT, boardPadding: 40 });
    expect(layout.tx).toBeCloseTo(layout.boardX + layout.scale * 40);
    expect(layout.ty).toBeCloseTo(layout.boardY + layout.scale * 40);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/viewport.test.ts`
Expected: FAIL — `boardPadding` doesn't exist on `ViewportInput`, `boardX`/`boardY`/`boardSize` don't exist on `WallLayout` (either a type error from `tsc` if your test run type-checks, or `undefined` values failing the `toBeCloseTo` assertions).

- [ ] **Step 3: Implement**

Replace the full contents of `src/renderer/viewport.ts` above the `FrameRect` interface with:

```ts
import type { Point } from "@/engine/types";

export interface ViewportInput {
  gridSize: number;
  frameSize: number;
  frameGap: number;
  boardPadding: number;
  zoom: number;
  pan: Point;
  canvasWidth: number;
  canvasHeight: number;
}

export interface WallLayout {
  gap: number;
  scale: number;
  tx: number;
  ty: number;
  frameSize: number;
  gridSize: number;
  boardX: number;
  boardY: number;
  boardSize: number;
}

/** Board (frame grid + padding) fills 82% of the canvas at zoom 1, centered plus pan offset. */
export function computeWallLayout(input: ViewportInput): WallLayout {
  const {
    gridSize,
    frameSize,
    frameGap,
    boardPadding,
    zoom,
    pan,
    canvasWidth,
    canvasHeight,
  } = input;
  const wall = gridSize * frameSize + (gridSize - 1) * frameGap;
  const boardExtent = wall + 2 * boardPadding;
  const base = Math.min(
    (canvasWidth * 0.82) / boardExtent,
    (canvasHeight * 0.82) / boardExtent,
  );
  const scale = base * zoom;
  const boardX = canvasWidth / 2 + pan.x - (scale * boardExtent) / 2;
  const boardY = canvasHeight / 2 + pan.y - (scale * boardExtent) / 2;
  return {
    gap: frameGap,
    scale,
    frameSize,
    gridSize,
    tx: boardX + scale * boardPadding,
    ty: boardY + scale * boardPadding,
    boardX,
    boardY,
    boardSize: scale * boardExtent,
  };
}
```

Leave `FrameRect`, `frameRect`, `frameGradientPos`, and `pickFrame` exactly as they are — they don't change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/viewport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/viewport.ts src/renderer/__tests__/viewport.test.ts
git commit -m "feat(renderer): fit board (frame grid + padding) to viewport"
```

---

### Task 3: Draw the board rect in `drawWall`

**Files:**
- Modify: `src/renderer/wallRenderer.ts:90-167` (`WallDrawState` interface and `drawWall` function)

**Interfaces:**
- Consumes: `computeWallLayout` from Task 2, specifically `layout.boardX`, `layout.boardY`, `layout.boardSize`.
- Produces: `WallDrawState.boardPadding: number` — consumed by Task 5 (`FilamentStudio`'s `drawWall` call).

This task has no dedicated unit test — `drawWall` is a Canvas2D side-effecting function with no existing test coverage (confirmed: no `wallRenderer.test.ts` exists), and the spec's testing section scopes automated tests to `viewport.ts` only. Correctness here is verified visually in Task 6.

- [ ] **Step 1: Add `boardPadding` to `WallDrawState`**

In `src/renderer/wallRenderer.ts`, in the `WallDrawState` interface, add the field after `frameGap`:

```ts
export interface WallDrawState {
  frames: Frame[];
  gridSize: number;
  frameSize: number;
  frameGap: number;
  boardPadding: number;
  zoom: number;
  pan: Point;
  mode: "edit" | "sim";
  selectedFrame: number | null;
  selectedFiber: number | null;
  time: number;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: Palette;
}
```

- [ ] **Step 2: Pass it into `computeWallLayout` and draw the board rect**

In `drawWall`, update the `computeWallLayout` call and add the board fill immediately after computing `layout`, before the `edit`/frame loop:

```ts
export function drawWall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: WallDrawState,
): void {
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

  // Backing board — sits behind the frame grid, visible in the inter-frame
  // gaps and around the outer edge per `boardPadding`.
  ctx.save();
  ctx.fillStyle = "#101114";
  ctx.fillRect(layout.boardX, layout.boardY, layout.boardSize, layout.boardSize);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.boardX, layout.boardY, layout.boardSize, layout.boardSize);
  ctx.restore();

  const edit = state.mode === "edit";
  for (let index = 0; index < state.frames.length; index++) {
    const rect = frameRect(layout, index);
    const selected = index === state.selectedFrame;
    drawFrame(ctx, rect.x, rect.y, rect.size, state.frames[index], {
      selected,
      selectedFiber: selected ? state.selectedFiber : null,
      edit,
      gpos: frameGradientPos(index, state.gridSize),
      time: state.time,
      anim: state.anim,
      speed: state.speed,
      brightness: state.brightness,
      palette: state.palette,
    });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: New errors only at `drawWall`'s call site in `src/components/filament/FilamentStudio.tsx` (missing `boardPadding` in the object literal), which Task 5 fixes. No errors inside `wallRenderer.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/wallRenderer.ts
git commit -m "feat(renderer): draw backing board behind frame grid"
```

---

### Task 4: Wire `boardPadding` through `FilamentStudio` state, save, and load

**Files:**
- Modify: `src/components/filament/FilamentStudio.tsx` (multiple locations, listed below)

**Interfaces:**
- Consumes: `ProjectSnapshot.boardPadding` (Task 1), `ViewportInput.boardPadding` / `WallLayout` (Task 2), `WallDrawState.boardPadding` (Task 3).
- Produces: `StudioState.boardPadding: number`, prop `boardPadding`/`onBoardPadding` passed to `LeftPanel` — consumed by Task 5.

- [ ] **Step 1: Add to `StudioState` and `INITIAL_STATE`**

In `src/components/filament/FilamentStudio.tsx`, in the `StudioState` interface (around line 30), add after `frameGap`:

```ts
interface StudioState {
  empty: boolean;
  mode: "edit" | "sim";
  gridSize: number;
  frameSize: number;
  frameGap: number;
  boardPadding: number;
  curviness: number;
  // ...unchanged below
```

In `INITIAL_STATE` (around line 52), add after `frameGap: 20,`:

```ts
  frameGap: 20,
  boardPadding: 40,
  curviness: DEFAULT_FIBER_STYLE.curviness,
```

- [ ] **Step 2: Thread it into the `drawWall` call in `draw`**

In the `draw` callback's `drawWall(...)` call (around line 167-182), add after `frameGap: s.frameGap,`:

```ts
      frameGap: s.frameGap,
      boardPadding: s.boardPadding,
      zoom: s.zoom,
```

- [ ] **Step 3: Thread it into the `computeWallLayout` call in `onClickAt`**

In `useCanvasInteraction`'s `onClickAt` handler (around line 254-262), add after `frameGap: s.frameGap,`:

```ts
      const layout = computeWallLayout({
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap,
        boardPadding: s.boardPadding,
        zoom: s.zoom,
        pan: panRef.current,
        canvasWidth: sizeRef.current.width,
        canvasHeight: sizeRef.current.height,
      });
```

- [ ] **Step 4: Include it in `handleSave`'s snapshot**

In `handleSave` (around line 320-338), add after `frameGap: s.frameGap,`:

```ts
    const snapshot: ProjectSnapshot = {
      gridSize: s.gridSize,
      frameSize: s.frameSize,
      frameGap: s.frameGap,
      boardPadding: s.boardPadding,
      masterSeed: s.masterSeed,
```

- [ ] **Step 5: Sanitize and restore it in `handleLoad`**

In `handleLoad` (around line 339-387), add a sanitizer variable after the existing `frameGap` one:

```ts
    const frameGap = Number.isFinite(Number(d.frameGap))
      ? Number(d.frameGap)
      : 20;
    const boardPadding = Number.isFinite(Number(d.boardPadding))
      ? Number(d.boardPadding)
      : 40;
```

And include it in the `patch({...})` call at the end of `handleLoad`:

```ts
    patch({
      gridSize,
      frameSize: d.frameSize,
      frameGap,
      boardPadding,
      masterSeed: d.masterSeed,
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors related to `ProjectSnapshot`, `WallDrawState`, or `ViewportInput` missing `boardPadding` anymore. Errors may remain at the `<LeftPanel>` JSX call site (missing `boardPadding`/`onBoardPadding` props) — that's expected until Task 5.

- [ ] **Step 7: Commit**

```bash
git add src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): wire boardPadding through studio state, save, and load"
```

---

### Task 5: "Board padding" slider in `LeftPanel`

**Files:**
- Modify: `src/components/filament/LeftPanel.tsx:6-75` (`LeftPanelProps` and the WALL section JSX)
- Modify: `src/components/filament/FilamentStudio.tsx` (the `<LeftPanel>` call site, around line 425-447)

**Interfaces:**
- Consumes: `StudioState.boardPadding` (Task 4).
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Add props to `LeftPanelProps`**

In `src/components/filament/LeftPanel.tsx`, in `LeftPanelProps` (around line 6-24), add after `onFrameGap`:

```ts
export interface LeftPanelProps {
  gridSize: number;
  onGridSize: (n: number) => void;
  frameSize: number;
  onFrameSize: (n: number) => void;
  frameGap: number;
  onFrameGap: (n: number) => void;
  boardPadding: number;
  onBoardPadding: (n: number) => void;
  curviness: number;
  // ...unchanged below
```

- [ ] **Step 2: Add the slider row**

In the WALL section, directly after the "Frame spacing" `SliderRow` (around line 64-75), add:

```tsx
      <SliderRow label="Frame spacing" value={`${props.frameGap}px`}>
        <input
          type="range"
          aria-label="Frame spacing"
          min={0}
          max={80}
          step={2}
          value={props.frameGap}
          onChange={(e) => props.onFrameGap(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Board padding" value={`${props.boardPadding}px`}>
        <input
          type="range"
          aria-label="Board padding"
          min={0}
          max={120}
          step={2}
          value={props.boardPadding}
          onChange={(e) => props.onBoardPadding(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <Divider />
```

(This replaces the existing lone `<Divider />` that follows "Frame spacing" — don't leave two dividers in a row.)

- [ ] **Step 3: Wire the props at the `FilamentStudio` call site**

In `src/components/filament/FilamentStudio.tsx`, in the `<LeftPanel>` JSX (around line 425-447), add after `onFrameGap`:

```tsx
          frameGap={ui.frameGap}
          onFrameGap={(n) => patch({ frameGap: n })}
          boardPadding={ui.boardPadding}
          onBoardPadding={(n) => patch({ boardPadding: n })}
          curviness={ui.curviness}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: Clean — no errors anywhere in the project.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass, including the 4 new tests from Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/components/filament/LeftPanel.tsx src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): add board padding slider"
```

---

### Task 6: Manual visual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or the project's existing dev script — check `package.json` if the name differs)

- [ ] **Step 2: Open the app and generate a wall**

Navigate to the local dev URL, click a start-screen preset (or "Generate new wall") to leave the empty state.

- [ ] **Step 3: Verify board renders and default padding looks right**

Confirm a dark rect is visible behind the frame grid, matching the frames' outer edge with roughly 40px of margin (scaled) on every side, and that it's also visible filling the gaps between individual frames. Corners should be square; a faint white stroke should outline the board edge.

- [ ] **Step 4: Verify the padding slider**

Drag "Board padding" in the LeftPanel WALL section from 0 to 120. Confirm: at 0, the board disappears exactly behind the frame grid's outer edge (no visible margin); as it increases, the margin grows and the frames visibly shrink slightly (the whole board stays within the canvas viewport rather than overflowing).

- [ ] **Step 5: Verify persistence**

Set padding to some non-default value (e.g. 80), click "Save", reload the page, click "Load". Confirm the board padding is restored to 80.

- [ ] **Step 6: Verify frame selection still works**

Click a frame in edit mode with a non-zero board padding set. Confirm the correct frame is still selected (this exercises `pickFrame`/`onClickAt`, which depend on `tx`/`ty` now being padding-inset).

- [ ] **Step 7: Report results**

If any check fails, stop and diagnose before proceeding — do not mark this task complete on a partial pass.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1, 4), layout math (Task 2), rendering appearance (Task 3), UI slider + placement (Task 5), persistence/legacy defaults (Task 4), testing (Task 2). All spec sections have a corresponding task.
- **Type consistency:** `boardPadding` name and `number` type used identically across `ProjectSnapshot` (Task 1), `ViewportInput`/`WallLayout` (Task 2), `WallDrawState` (Task 3), `StudioState`/`LeftPanelProps` (Tasks 4-5) — verified no `boardMargin`/`padding` naming drift.
- **No placeholders:** every step has literal code, not descriptions.
