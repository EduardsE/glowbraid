# Autostart + Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the empty-state gate screen so the studio always opens on a real wall (the previously-saved one, or a fixed 3×3 default), and replace the manual Save/Load buttons with silent, debounced autosave.

**Architecture:** `GlowbraidStudio.tsx` computes its initial `ui` state and geometry (`framesRef`/`seedsRef`) synchronously on first render via a ref-guarded lazy init (`buildInitialProject()`), instead of starting `empty: true` and waiting for a user click. A single debounced `useEffect` watches every persisted `ui` field plus a new `geometryVersion` counter (bumped whenever geometry changes without an accompanying `ui` field change, i.e. single-frame reseed) and writes to `localStorage` ~400ms after the last change. The `EmptyState` component, the `empty`/`saved` state fields, and the manual Save/Load buttons are deleted.

**Tech Stack:** React 18 (TanStack Start), TypeScript, Vitest, Biome.

## Global Constraints

- Engine (`src/engine/`) stays framework-free — this feature touches only `src/components/glowbraid/` and one `src/renderer/` function; do not add React/DOM imports to `src/engine/`.
- Follow the existing loader-sanitizer pattern in `src/engine/types.ts`'s `ProjectSnapshot` doc comments (every field tolerates absence) — no new `ProjectSnapshot` fields are introduced by this plan, so no new sanitizer branches are needed beyond what's reused from today's `handleLoad`.
- Before every commit: `npm run check` (Biome lint + format) and `npm run test` (Vitest) must both pass. Run `npm run build` at least once at the end of the plan to catch type errors the dev server tolerates.
- No new `.test.ts` files are added by this plan — `vitest.config.ts` only picks up `src/**/*.test.ts` and none of the touched files (`GlowbraidStudio.tsx`, `LeftPanel.tsx`, `InspectorPanel.tsx`, `EmptyState.tsx`) have `.tsx`/jsdom coverage today. Verification is manual (dev server + browser), per each task's test steps.

---

### Task 1: Extract shared geometry-derivation helper

**Files:**
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx:126-198`

**Interfaces:**
- Produces: `deriveGeometry(gridSize: number, masterSeed: number, style: FiberStyle, seeds?: number[]): { seeds: number[]; frames: Frame[] }` — a module-scope function (not a hook), usable both inside and outside the component. Task 3's `buildInitialProject()` calls this.

- [ ] **Step 1: Add `deriveGeometry` above the component, and refactor `rebuild` to use it**

In `src/components/glowbraid/GlowbraidStudio.tsx`, insert this new function immediately after the existing `cmField` function (after line 126, before `export function GlowbraidStudio() {` on line 128):

```ts
function deriveGeometry(
  gridSize: number,
  masterSeed: number,
  style: FiberStyle,
  seeds?: number[],
): { seeds: number[]; frames: Frame[] } {
  const count = gridSize * gridSize;
  const resolvedSeeds =
    seeds && seeds.length === count
      ? seeds
      : deriveFrameSeeds(masterSeed, count);
  return {
    seeds: resolvedSeeds,
    frames: generateWall({ gridSize, frameSeeds: resolvedSeeds, style }),
  };
}
```

Then replace the existing `rebuild` callback (lines 179-198):

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

with:

```ts
  const rebuild = useCallback(
    (
      gridSize: number,
      masterSeed: number,
      style: FiberStyle,
      seeds?: number[],
    ) => {
      const geometry = deriveGeometry(gridSize, masterSeed, style, seeds);
      seedsRef.current = geometry.seeds;
      framesRef.current = geometry.frames;
    },
    [],
  );
```

This is a pure refactor — behavior is unchanged.

- [ ] **Step 2: Verify lint, format, and existing tests still pass**

Run: `npm run check`
Expected: no errors (no unused vars, formatting clean).

Run: `npm run test`
Expected: all existing tests pass (this refactor touches no engine code, so the suite result should be identical to before the change).

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`, open the app in a browser.
- Click "Start from a blank random wall" on the empty-state screen (still present at this point — Task 3 removes it).
- Click "Re-route fibres" — wall regenerates.
- Click "Generate new wall" — wall regenerates.
- Change the grid size buttons (1–6) — wall regenerates at each size.

Expected: all four actions behave exactly as before this change (no visual or functional regression).

- [ ] **Step 4: Commit**

```bash
git add src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "refactor: extract deriveGeometry helper from rebuild"
```

---

### Task 2: Add `geometryVersion` and debounced autosave

**Files:**
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (this task only adds state + an effect).
- Produces: `StudioState.geometryVersion: number` field (bumped by `handleReseed`), and a debounced autosave `useEffect` that calls `saveProject` from `./storage`. Task 3's `buildInitialProject()` relies on `geometryVersion` already existing on `StudioState`/`INITIAL_STATE`.

- [ ] **Step 1: Add `geometryVersion` to `StudioState` and `INITIAL_STATE`**

In the `StudioState` interface, add the field right after `masterSeed: number;` (line 48):

```ts
  masterSeed: number;
  geometryVersion: number;
```

In `INITIAL_STATE`, add the matching default right after `masterSeed: 7431,` (line 74):

```ts
  masterSeed: 7431,
  geometryVersion: 0,
```

- [ ] **Step 2: Bump `geometryVersion` in `handleReseed`**

`handleReseed` is the only handler that mutates `framesRef`/`seedsRef` directly without also changing `masterSeed` or `gridSize` in `ui` — so it's the only one that needs to manually signal "geometry changed" to the autosave effect. Replace its final line:

```ts
    patch({ selectedFiber: null });
```

with:

```ts
    patch({ selectedFiber: null, geometryVersion: s.geometryVersion + 1 });
```

- [ ] **Step 3: Add a `saveTimerRef` and the debounced autosave effect**

Add a new ref next to `noticeTimerRef` (after line 137, `const noticeTimerRef = useRef(0);`):

```ts
  const saveTimerRef = useRef(0);
```

Add a new effect after the existing unmount-cleanup effect (after the block ending at line 356, i.e. right before `const handleGridSize = (n: number) => {`):

```ts
  useEffect(() => {
    if (uiRef.current.empty) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const s = uiRef.current;
      const snapshot: ProjectSnapshot = {
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap,
        boardPadding: s.boardPadding,
        boardColor: s.boardColor,
        frameColors: s.frameColors,
        showMeasurements: s.showMeasurements,
        masterSeed: s.masterSeed,
        seeds: seedsRef.current,
        anim: s.anim,
        speed: s.speed,
        brightness: s.brightness,
        palette: s.palette,
        curviness: s.curviness,
        randomness: s.randomness,
        socketDepth: s.socketDepth,
        mode: s.mode,
      };
      saveProject(snapshot);
    }, 400);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [
    ui.gridSize,
    ui.frameSize,
    ui.frameGap,
    ui.boardPadding,
    ui.boardColor,
    ui.frameColors,
    ui.showMeasurements,
    ui.masterSeed,
    ui.geometryVersion,
    ui.anim,
    ui.speed,
    ui.brightness,
    ui.palette,
    ui.curviness,
    ui.randomness,
    ui.socketDepth,
    ui.mode,
  ]);
```

The `if (uiRef.current.empty) return;` guard matters because `GlowbraidStudio` mounts with `INITIAL_STATE` (`empty: true`, `seeds: []`) regardless of what's already saved — without the guard, this effect would fire ~400ms after every page load and silently overwrite any real previously-saved project with that blank placeholder, before the user has done anything. `empty` isn't in the dependency array on purpose: every path that flips `empty` to `false` (`handleGenerate`, `handlePreset`, `handleLoad`) also changes at least one field that _is_ already in the array in the same `patch({...})` call, so the effect still re-runs at the right moment and the guard reads the fresh value. (This guard is temporary: Task 3 deletes the `empty` field entirely and replaces `INITIAL_STATE` as the unconditional mount value with `buildInitialProject()`'s result, which is never a placeholder that shouldn't be saved — so Task 3 Step 1 also deletes this guard line.)

- [ ] **Step 4: Verify lint, format, and existing tests still pass**

Run: `npm run check`
Expected: no errors.

Run: `npm run test`
Expected: all existing tests pass.

- [ ] **Step 5: Manual verification that autosave writes without clicking Save**

Run: `npm run dev`, open the app, click "Start from a blank random wall".
- Drag the "Frame size" slider to a distinctive value (e.g. 32 cm).
- Wait about 1 second (past the 400ms debounce).
- Without clicking the "Save" button, click "Load".

Expected: the Frame size slider shows 32 cm — proving the debounced effect wrote to `localStorage` on its own.

Then verify the guard: reload the page (back on the empty-state gate screen, `localStorage` still holds the 32cm project from above). Wait about 1 second **without** clicking "Start" or "Load" or anything else. Then click "Load".

Expected: the Frame size slider still shows 32 cm — proving the autosave effect did *not* fire while still on the gate screen and overwrite the saved project with the blank default.

- [ ] **Step 6: Commit**

```bash
git add src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: debounced autosave of studio state"
```

---

### Task 3: Auto-load-or-default on startup; remove the empty-state gate

**Files:**
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx`
- Modify: `src/renderer/wallRenderer.ts:276-308`
- Modify: `src/components/glowbraid/InspectorPanel.tsx:11,35`
- Delete: `src/components/glowbraid/EmptyState.tsx`

**Interfaces:**
- Consumes: `deriveGeometry` (Task 1), `StudioState.geometryVersion` / `INITIAL_STATE.geometryVersion` (Task 2).
- Produces: `buildInitialProject(): { state: StudioState; seeds: number[]; frames: Frame[] }` — a module-scope function. Nothing later depends on new exports from this task; it's the terminal step for the gating behavior.

- [ ] **Step 1: Remove `empty` from `StudioState` and `INITIAL_STATE`**

Remove `empty: boolean;` from the `StudioState` interface (line 36) and `empty: true,` from `INITIAL_STATE` (line 62).

Also remove the `if (uiRef.current.empty) return;` guard line at the top of the debounced autosave effect (added in Task 2) — it no longer compiles once `empty` is gone, and it's no longer needed: after Step 3 below, the component always mounts with either a loaded project or the fixed default, never a blank placeholder that shouldn't be saved.

- [ ] **Step 2: Add `buildInitialProject()`**

Insert this after `deriveGeometry` (added in Task 1) and before `export function GlowbraidStudio() {`:

```ts
interface InitialProject {
  state: StudioState;
  seeds: number[];
  frames: Frame[];
}

function buildInitialProject(): InitialProject {
  const d = loadProject();
  if (!d) {
    const { seeds, frames } = deriveGeometry(
      INITIAL_STATE.gridSize,
      INITIAL_STATE.masterSeed,
      styleOf(INITIAL_STATE),
    );
    return { state: INITIAL_STATE, seeds, frames };
  }
  // Sanitize fields that would brick the render loop if a hand-edited or
  // legacy snapshot carries an unknown value (PALETTES[bad] → undefined →
  // drawWall throws every frame). Kept minimal, not a full schema check.
  const palette: PaletteId = Object.hasOwn(PALETTES, d.palette)
    ? d.palette
    : "sunset";
  const anim: AnimationId = ANIMATIONS.some((a) => a.id === d.anim)
    ? d.anim
    : "flow";
  const gridSize = Math.min(
    6,
    Math.max(1, Math.round(Number(d.gridSize) || 3)),
  );
  const frameSize = cmField(d.frameSize, 25, 10, 40);
  const frameGap = cmField(d.frameGap, 20, 0, 30);
  const boardPadding = cmField(d.boardPadding, 4, 0, 20);
  const boardColor =
    typeof d.boardColor === "string" ? d.boardColor : DEFAULT_BOARD_COLOR;
  const frameCount = gridSize * gridSize;
  const frameColors: (string | null)[] =
    Array.isArray(d.frameColors) &&
    d.frameColors.length === frameCount &&
    d.frameColors.every((c) => c === null || typeof c === "string")
      ? d.frameColors
      : Array(frameCount).fill(null);
  const curviness = styleAxis(d.curviness, DEFAULT_FIBER_STYLE.curviness);
  const randomness = styleAxis(d.randomness, DEFAULT_FIBER_STYLE.randomness);
  const socketDepth = styleAxis(
    d.socketDepth,
    DEFAULT_FIBER_STYLE.socketDepth,
  );
  const mode: StudioState["mode"] =
    d.mode === "edit" || d.mode === "3d" ? d.mode : "sim";
  const { seeds, frames } = deriveGeometry(
    gridSize,
    d.masterSeed,
    { curviness, randomness, socketDepth },
    d.seeds,
  );
  return {
    state: {
      ...INITIAL_STATE,
      gridSize,
      frameSize,
      frameGap,
      boardPadding,
      boardColor,
      frameColors,
      showMeasurements: d.showMeasurements === true,
      masterSeed: d.masterSeed,
      curviness,
      randomness,
      socketDepth,
      anim,
      speed: d.speed,
      brightness: d.brightness,
      palette,
      mode,
    },
    seeds,
    frames,
  };
}
```

- [ ] **Step 3: Wire the lazy init into the component**

Replace the top of `GlowbraidStudio` (lines 128-149):

```ts
export function GlowbraidStudio() {
  const [ui, setUi] = useState<StudioState>(INITIAL_STATE);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wall3dRef = useRef<Wall3D | null>(null);
  const disposedRef = useRef(false);
  const noticeTimerRef = useRef(0);
  const saveTimerRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrubRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  const tRef = useRef(0);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const framesRef = useRef<Frame[]>([]);
  const seedsRef = useRef<number[]>([]);
  const showcaseRef = useRef<Frame | null>(null);
  const mapGeoRef = useRef<MapGeometry | null>(null);
```

with:

```ts
export function GlowbraidStudio() {
  const initialRef = useRef<InitialProject | null>(null);
  if (initialRef.current === null) {
    initialRef.current = buildInitialProject();
  }
  const initial = initialRef.current;

  const [ui, setUi] = useState<StudioState>(initial.state);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wall3dRef = useRef<Wall3D | null>(null);
  const disposedRef = useRef(false);
  const noticeTimerRef = useRef(0);
  const saveTimerRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrubRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  const tRef = useRef(0);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const framesRef = useRef<Frame[]>(initial.frames);
  const seedsRef = useRef<number[]>(initial.seeds);
  const mapGeoRef = useRef<MapGeometry | null>(null);
```

(Note `showcaseRef` is dropped here — it's removed entirely in Step 5.)

- [ ] **Step 4: Restore 3D mode on an auto-loaded snapshot**

`handleLoad` (still present until Task 4) calls `ensure3D()` after a manual load if the loaded `mode` is `"3d"`. The new startup path needs the same behavior, since `wall3dRef`/`glCanvasRef` aren't ready until after mount. Add this effect immediately after the unmount-cleanup `useEffect` and immediately before the debounced autosave `useEffect` added in Task 2 (exact placement relative to the autosave effect doesn't matter — both just need to sit between the unmount-cleanup effect and `handleGridSize`):

```ts
  useEffect(() => {
    if (uiRef.current.mode === "3d") void ensure3D();
  }, []);
```

(The project lints with Biome, not the `react-hooks` ESLint plugin — confirmed no `exhaustive-deps` rule or `eslint-disable` precedent exists in `src/` — so no suppression comment is needed for the empty dependency array.)

- [ ] **Step 5: Remove the empty-state draw branch**

In `draw()`, delete the `if (s.empty) { ... }` block (the block immediately after `const palette = PALETTES[s.palette];` that calls `generateFrame(51840, ...)` and `drawShowcaseFrame(...)` and then `return;`). After deletion, `draw()` should flow straight from computing `palette` into the `if (s.mode === "3d")` branch.

- [ ] **Step 6: Remove the empty guard in `onClickAt`, and drop `empty` from `handleGenerate`/`handleStyle`, delete `handlePreset`**

In `onClickAt` (inside `useCanvasInteraction`), remove this line:

```ts
      if (s.empty) return;
```

In `handleStyle`, replace:

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

with:

```ts
  const handleStyle = (partial: Partial<FiberStyle>) => {
    const s = uiRef.current;
    const style = { ...styleOf(s), ...partial };
    rebuild(s.gridSize, s.masterSeed, style, seedsRef.current);
    patch(partial);
  };
```

In `handleGenerate`, remove the `empty: false,` line from its `patch({...})` call.

Delete the entire `handlePreset` function (it has no callers once `EmptyState` is removed in Step 9).

In `handleLoad`, remove the `empty: false,` line from its `patch({...})` call (the field no longer exists on `StudioState`; `handleLoad` itself is deleted in Task 4, but must still typecheck until then).

- [ ] **Step 7: Update `mode3dActive` and the `<InspectorPanel>`/`<LeftPanel>` JSX**

Replace:

```ts
  const mode3dActive = ui.mode === "3d" && !ui.empty;
```

with:

```ts
  const mode3dActive = ui.mode === "3d";
```

Remove the empty-state overlay render block:

```tsx
          {ui.empty ? (
            <EmptyState onPreset={handlePreset} onStart={handleGenerate} />
          ) : null}
```

Remove the `empty={ui.empty}` prop passed to `<InspectorPanel>`.

- [ ] **Step 8: Update imports**

Remove this line:

```ts
import { EmptyState, type EmptyStatePreset } from "./EmptyState";
```

Change:

```ts
import {
  DEFAULT_BOARD_COLOR,
  drawShowcaseFrame,
  drawWall,
} from "@/renderer/wallRenderer";
```

to:

```ts
import { DEFAULT_BOARD_COLOR, drawWall } from "@/renderer/wallRenderer";
```

- [ ] **Step 9: Delete `EmptyState.tsx` and its dead renderer function**

```bash
rm src/components/glowbraid/EmptyState.tsx
```

In `src/renderer/wallRenderer.ts`, delete the now-unused `ShowcaseOptions` interface and `drawShowcaseFrame` function (lines 276-308):

```ts
export interface ShowcaseOptions {
  time: number;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: Palette;
}

/** Single centered demo frame behind the empty-state overlay. */
export function drawShowcaseFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  opts: ShowcaseOptions,
): void {
  const sz = Math.min(width, height) * 0.72;
  const x = width / 2 - sz / 2;
  const y = height / 2 - sz / 2;
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawFrame(ctx, x, y, sz, frame, {
    selected: false,
    selectedFiber: null,
    edit: false,
    color: null,
    boardColor: DEFAULT_BOARD_COLOR,
    lightFactor: lightBoardFactor(DEFAULT_BOARD_COLOR),
    gpos: 0.5,
    ...opts,
  });
  ctx.restore();
}
```

Delete the whole block (do not delete `drawFrame`, which is still used by `drawWall`'s per-frame loop).

- [ ] **Step 10: Update `InspectorPanel.tsx`**

Remove `empty: boolean;` from `InspectorPanelProps` (line 11).

Replace:

```tsx
      {frame && frameNumber != null ? (
        <SelectedFrame {...props} frame={frame} frameNumber={frameNumber} />
      ) : !props.empty ? (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-2.5 p-[30px] text-center">
          <div className="h-[38px] w-[38px] rounded-[10px] border border-dashed border-white/[0.14]" />
          <div className="text-[12.5px] leading-relaxed text-[rgba(233,234,240,0.4)]">
            Select a frame on the wall
            <br />
            to edit its fibres &amp; LED pattern
          </div>
        </div>
      ) : null}
```

with:

```tsx
      {frame && frameNumber != null ? (
        <SelectedFrame {...props} frame={frame} frameNumber={frameNumber} />
      ) : (
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-2.5 p-[30px] text-center">
          <div className="h-[38px] w-[38px] rounded-[10px] border border-dashed border-white/[0.14]" />
          <div className="text-[12.5px] leading-relaxed text-[rgba(233,234,240,0.4)]">
            Select a frame on the wall
            <br />
            to edit its fibres &amp; LED pattern
          </div>
        </div>
      )}
```

- [ ] **Step 11: Verify lint, format, and existing tests still pass**

Run: `npm run check`
Expected: no errors — in particular, no unused-import errors for `EmptyState`, `EmptyStatePreset`, or `drawShowcaseFrame`.

Run: `npm run test`
Expected: all existing tests pass.

Run: `npm run build`
Expected: production build succeeds (this is the first task that could introduce a type error from the `StudioState`/`InitialProject` shape change, so a full build check matters here).

- [ ] **Step 12: Manual verification of auto-load-or-default**

Run: `npm run dev`, open the app in a browser with devtools open.

- In the browser console: `localStorage.removeItem("glowbraid.project")`, then reload the page.
  Expected: the app opens immediately on a real 3×3 wall (sunset palette, flowing animation) — no start-here overlay ever appears.
- Change the grid size to 4 and the palette to "Aurora". Wait ~1 second, then reload the page.
  Expected: the app opens directly on the 4×4 wall with the Aurora palette — the change you made persisted automatically and loaded without any button click.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: auto-load saved project or fixed default on startup, remove empty-state gate"
```

---

### Task 4: Remove manual Save/Load buttons and handlers

**Files:**
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx`
- Modify: `src/components/glowbraid/LeftPanel.tsx:7-31,211-231`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Remove `saved` from `StudioState` and `INITIAL_STATE`**

Remove `saved: boolean;` from the `StudioState` interface and `saved: false,` from `INITIAL_STATE`.

- [ ] **Step 2: Delete `handleSave` and `handleLoad`**

Delete both functions in full from `GlowbraidStudio.tsx`:

```ts
  const handleSave = () => {
    const s = uiRef.current;
    const snapshot: ProjectSnapshot = {
      gridSize: s.gridSize,
      frameSize: s.frameSize,
      frameGap: s.frameGap,
      boardPadding: s.boardPadding,
      boardColor: s.boardColor,
      frameColors: s.frameColors,
      showMeasurements: s.showMeasurements,
      masterSeed: s.masterSeed,
      seeds: seedsRef.current,
      anim: s.anim,
      speed: s.speed,
      brightness: s.brightness,
      palette: s.palette,
      curviness: s.curviness,
      randomness: s.randomness,
      socketDepth: s.socketDepth,
      mode: s.mode,
    };
    if (saveProject(snapshot)) patch({ saved: true });
  };
```

and the entire `handleLoad` function (from `const handleLoad = () => {` through its closing `};`, including the `if (mode === "3d") void ensure3D();` line).

- [ ] **Step 3: Stop passing Save/Load props to `LeftPanel`**

Remove these three lines from the `<LeftPanel ... />` JSX call:

```tsx
          onSave={handleSave}
          onLoad={handleLoad}
          saveHint={
            ui.saved
              ? "Saved to this browser ✓"
              : "Stores the current wall in this browser."
          }
```

- [ ] **Step 4: Update `LeftPanel.tsx` props and remove the PROJECT section**

Remove these three lines from `LeftPanelProps`:

```ts
  onSave: () => void;
  onLoad: () => void;
  saveHint: string;
```

Remove this block (the `Divider`/`SectionLabel("PROJECT")`/button row/hint text, currently lines 211-231):

```tsx
      <Divider />
      <SectionLabel>PROJECT</SectionLabel>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onSave}
          className="h-[34px] flex-1 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-xs text-[#e9eaf0] hover:bg-white/[0.08]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={props.onLoad}
          className="h-[34px] flex-1 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-xs text-[#e9eaf0] hover:bg-white/[0.08]"
        >
          Load
        </button>
      </div>
      <div className="text-[10.5px] leading-normal text-[rgba(233,234,240,0.3)]">
        {props.saveHint}
      </div>
```

(The `<Divider />` right before the "Generate new wall" button block and the final `<div className="flex-1" />` / "SOON ·" footer stay untouched — only the PROJECT section itself is removed.)

- [ ] **Step 5: Verify lint, format, tests, and build**

Run: `npm run check`
Expected: no errors — in particular, no unused-prop or unused-import issues in `LeftPanel.tsx` or `GlowbraidStudio.tsx`.

Run: `npm run test`
Expected: all existing tests pass.

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 6: Full manual walkthrough**

Run: `npm run dev`, open the app in a browser with devtools open.

1. In the console: `localStorage.removeItem("glowbraid.project")`, reload.
   Expected: app opens on the fixed 3×3 default wall immediately; no Save/Load buttons anywhere in the left panel; no start-here overlay.
2. Change "Frame spacing" to a distinctive value. Wait ~1s, reload.
   Expected: the changed value persisted with no button click.
3. Click "Generate new wall". Wait ~1s, reload.
   Expected: the newly generated wall (not the previous one) persisted.
4. Click "Re-route fibres". Wait ~1s, reload.
   Expected: the re-routed wall persisted.
5. Select a frame, click its "⟳" re-seed button. Wait ~1s, reload.
   Expected: that frame's re-seeded fibre layout persisted (confirms `geometryVersion` correctly triggers autosave for the one mutation path that doesn't touch `masterSeed`/`gridSize`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove manual Save/Load buttons, rely on autosave"
```
