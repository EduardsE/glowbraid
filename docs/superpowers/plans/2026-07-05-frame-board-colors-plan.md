# Frame & Board Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a global board color and an independent color per frame bezel, both persisted with the project and rendered live on the canvas.

**Architecture:** Thread two new pieces of state (`boardColor: string`, `frameColors: (string | null)[]`) from `ProjectSnapshot`/`StudioState` through `wallRenderer.ts`'s draw functions, replacing three hardcoded hex literals (board fill, frame bezel fill, and the frame's inner panel fill — which is just the board color showing through, not a separate layer). A shared `ColorSwatchPicker` component (presets + native custom-color input) drives both the board picker (in `LeftPanel`) and the per-frame picker (in `InspectorPanel`).

**Tech Stack:** React + TypeScript, Canvas2D, Vitest.

## Global Constraints

- Shared preset color list for both board and frame pickers: Black `#181a20`, Graphite `#4a4a4a`, White `#e8e4d8`, Walnut `#6b4a32`, Oak `#c9a066`.
- No "reset to default" control anywhere in the UI — picking the "Black" preset is close enough visually.
- Flat single-fill colors only — no gradients, textures, or per-side variation.
- Legacy saves missing `boardColor`/`frameColors` must render pixel-identical to current (pre-feature) behavior: default board color `#101114`, default frame bezel pair `#181a20` (edit) / `#141519` (sim).
- Any action that regenerates the whole wall (grid-size change, Reroute, Generate new wall, a preset pick, Load) resets every frame's color to default (`null`). Re-seeding a single frame does **not** touch that frame's color.

---

### Task 1: `shadeForSim` color helper

**Files:**
- Modify: `src/renderer/wallRenderer.ts` (insert after line 89, before `export interface WallDrawState`)
- Test: `src/renderer/__tests__/wallRenderer.test.ts` (new)

**Interfaces:**
- Produces: `export function shadeForSim(hex: string): string` — takes a `"#rrggbb"` string, returns a `"#rrggbb"` string with each channel scaled to ~80%. `export const DEFAULT_BOARD_COLOR = "#101114"`.
- Consumes: nothing (foundational, standalone pure function).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/wallRenderer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shadeForSim } from "../wallRenderer";

describe("shadeForSim", () => {
  it("scales each RGB channel to ~80%, approximating the app's edit→sim darkening", () => {
    expect(shadeForSim("#181a20")).toBe("#13151a");
  });

  it("scales white down without any channel overflowing", () => {
    expect(shadeForSim("#ffffff")).toBe("#cccccc");
  });

  it("leaves black unchanged", () => {
    expect(shadeForSim("#000000")).toBe("#000000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/wallRenderer.test.ts`
Expected: FAIL — `shadeForSim` is not exported from `../wallRenderer` (no such export exists yet).

- [ ] **Step 3: Implement `shadeForSim` and `DEFAULT_BOARD_COLOR`**

In `src/renderer/wallRenderer.ts`, insert immediately after the `ledGlowSprite` function closes (line 89) and before `export interface WallDrawState` (line 91):

```ts
/** Default backing-board / fibre-backdrop fill, used when no boardColor is set. */
export const DEFAULT_BOARD_COLOR = "#101114";

/**
 * Approximates the app's existing edit→sim bezel darkening (the hardcoded
 * #181a20 → #141519 pair) for an arbitrary base color, so custom/preset frame
 * colors get the same relative dimming in sim mode. The original pair's
 * per-channel ratios aren't perfectly uniform (0.83/0.81/0.78) — this uses a
 * single 0.8 ratio as a close approximation rather than reproducing them exactly.
 */
export function shadeForSim(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * 0.8)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/wallRenderer.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wallRenderer.ts src/renderer/__tests__/wallRenderer.test.ts
git commit -m "feat(renderer): add shadeForSim color helper for custom frame colors"
```

---

### Task 2: Data model + renderer plumbing (no visible change yet)

**Files:**
- Modify: `src/engine/types.ts:80-103` (`ProjectSnapshot`)
- Modify: `src/renderer/wallRenderer.ts` (`WallDrawState`, `FrameDrawOptions`, `drawWall`, `drawFrame`, `drawShowcaseFrame`)
- Modify: `src/components/filament/FilamentStudio.tsx` (`StudioState`, `INITIAL_STATE`, `draw()`)

**Interfaces:**
- Consumes: `shadeForSim`, `DEFAULT_BOARD_COLOR` (Task 1).
- Produces: `WallDrawState.boardColor: string`, `WallDrawState.frameColors: (string | null)[]`; `FrameDrawOptions.color: string | null`, `FrameDrawOptions.boardColor: string`; `StudioState.boardColor: string`, `StudioState.frameColors: (string | null)[]` — all consumed by Tasks 3 & 4.

This task is pure plumbing (matches the existing codebase convention that canvas draw functions have no unit tests — only `dimensions.ts`/`viewport.ts`'s pure geometry functions do). Verification is the full test suite plus a manual no-regression check.

- [ ] **Step 1: Add `ProjectSnapshot` fields**

In `src/engine/types.ts`, inside `ProjectSnapshot` (after the `boardPadding` field, line 88):

```ts
  /** Backing board / fibre-backdrop fill (hex). Absent in legacy saves → loader defaults to "#101114". */
  boardColor?: string;
```

And after the `seeds: number[];` field (line 92):

```ts
  /** Per-frame bezel color (hex), parallel to `seeds`; null = use the default edit/sim pair. Absent or length-mismatched → loader defaults to all null. */
  frameColors?: (string | null)[];
```

- [ ] **Step 2: Thread `boardColor`/`frameColors` through `WallDrawState`**

In `src/renderer/wallRenderer.ts`, `WallDrawState` (currently lines 91-109), add after `boardPadding: number;`:

```ts
  boardColor: string;
  frameColors: (string | null)[];
```

- [ ] **Step 3: Use `boardColor` for the board fill**

In `drawWall`, replace (around line 160):

```ts
  ctx.fillStyle = "#101114";
```

with:

```ts
  ctx.fillStyle = state.boardColor;
```

- [ ] **Step 4: Pass per-frame color + board color into the per-frame draw loop**

In `drawWall`'s frame loop (currently lines 178-192), add two fields to the options object passed to `drawFrame`:

```ts
    drawFrame(ctx, rect.x, rect.y, rect.size, state.frames[index], {
      selected,
      selectedFiber: selected ? state.selectedFiber : null,
      edit,
      color: state.frameColors[index] ?? null,
      boardColor: state.boardColor,
      gpos: frameGradientPos(index, state.gridSize),
      time: state.time,
      anim: state.anim,
      speed: state.speed,
      brightness: state.brightness,
      palette: state.palette,
    });
```

- [ ] **Step 5: Add `color`/`boardColor` to `FrameDrawOptions`**

In `FrameDrawOptions` (currently lines 111-121), add:

```ts
  color: string | null;
  boardColor: string;
```

- [ ] **Step 6: Pass defaults from `drawShowcaseFrame`**

`drawShowcaseFrame` (currently lines 216-236) has no wall/board concept — it draws one static demo frame. Update its call to `drawFrame` to supply defaults:

```ts
  drawFrame(ctx, x, y, sz, frame, {
    selected: false,
    selectedFiber: null,
    edit: false,
    color: null,
    boardColor: DEFAULT_BOARD_COLOR,
    gpos: 0.5,
    ...opts,
  });
```

- [ ] **Step 7: Destructure the new options in `drawFrame`**

In `drawFrame` (currently lines 238-256), add `color` and `boardColor` to the destructured options:

```ts
  const {
    selected,
    selectedFiber,
    edit,
    color,
    boardColor,
    gpos,
    time,
    anim,
    speed,
    brightness,
    palette,
  } = opts;
```

- [ ] **Step 8: Use `color` (with `shadeForSim`) for the bezel fill**

Replace (currently line 262):

```ts
  ctx.fillStyle = edit ? "#181a20" : "#141519";
```

with:

```ts
  ctx.fillStyle =
    color == null
      ? edit
        ? "#181a20"
        : "#141519"
      : edit
        ? color
        : shadeForSim(color);
```

- [ ] **Step 9: Use `boardColor` for the inner panel fill**

Replace (currently line 273):

```ts
  ctx.fillStyle = "#07080b";
```

with:

```ts
  ctx.fillStyle = boardColor;
```

- [ ] **Step 10: Wire `StudioState` and `INITIAL_STATE`**

In `src/components/filament/FilamentStudio.tsx`, update the import (line 18):

```ts
import { DEFAULT_BOARD_COLOR, drawShowcaseFrame, drawWall } from "@/renderer/wallRenderer";
```

In `StudioState` (currently lines 30-52), add after `boardPadding: number;`:

```ts
  boardColor: string;
  frameColors: (string | null)[];
```

In `INITIAL_STATE` (currently lines 54-76), add after `boardPadding: 4,`:

```ts
  boardColor: DEFAULT_BOARD_COLOR,
  frameColors: [],
```

- [ ] **Step 11: Pass `boardColor`/`frameColors` into the `drawWall` call**

In `draw()` (currently lines 184-201), add after `boardPadding: s.boardPadding,`:

```ts
      boardColor: s.boardColor,
      frameColors: s.frameColors,
```

- [ ] **Step 12: Run the full test suite**

Run: `npm run test`
Expected: PASS — all existing tests (engine + renderer) still pass; no test touches the new fields yet.

- [ ] **Step 13: Run lint/typecheck**

Run: `npm run check`
Expected: no errors. (`frameColors: []` combined with `state.frameColors[index] ?? null` is valid — indexing past an empty array yields `undefined`, which the `?? null` coalesces to `null`, i.e. today's default look.)

- [ ] **Step 14: Manual no-regression check**

Run: `npm run dev`. Open the app, click "Generate new wall" from the empty state. Confirm the board and every frame bezel look exactly as they did before this change (same dark tones) — this task adds no UI, so nothing should look different yet.

- [ ] **Step 15: Commit**

```bash
git add src/engine/types.ts src/renderer/wallRenderer.ts src/components/filament/FilamentStudio.tsx
git commit -m "feat: thread board/frame color state through the renderer"
```

---

### Task 3: `ColorSwatchPicker` component + Board color UI

**Files:**
- Create: `src/components/filament/ColorSwatchPicker.tsx`
- Modify: `src/components/filament/LeftPanel.tsx`
- Modify: `src/components/filament/FilamentStudio.tsx`

**Interfaces:**
- Consumes: `DEFAULT_BOARD_COLOR` (Task 1, from `wallRenderer.ts`); `StudioState.boardColor` (Task 2).
- Produces: `export function ColorSwatchPicker(props: ColorSwatchPickerProps)` and `export const PRESET_COLORS` — both consumed again by Task 4. `LeftPanelProps.boardColor: string` / `onBoardColor: (c: string) => void`.

This repo has no jsdom/component test harness (`vitest.config.ts` only picks up `src/**/*.test.ts`, no `.tsx`) — presentational components aren't unit tested here. Verification is `npm run check` plus manual browser use once wired in (this task is the first real usage).

- [ ] **Step 1: Create the shared color picker component**

Create `src/components/filament/ColorSwatchPicker.tsx`:

```tsx
export interface ColorSwatchPickerProps {
  value: string | null;
  onChange: (color: string) => void;
  ariaLabel: string;
}

export const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#181a20" },
  { name: "Graphite", hex: "#4a4a4a" },
  { name: "White", hex: "#e8e4d8" },
  { name: "Walnut", hex: "#6b4a32" },
  { name: "Oak", hex: "#c9a066" },
];

export function ColorSwatchPicker(props: ColorSwatchPickerProps) {
  const { value, onChange, ariaLabel } = props;
  const isPreset = PRESET_COLORS.some((p) => p.hex === value);
  const isCustom = value != null && !isPreset;

  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((p) => (
        <button
          key={p.hex}
          type="button"
          title={p.name}
          aria-label={`${ariaLabel}: ${p.name}`}
          onClick={() => onChange(p.hex)}
          style={{ background: p.hex }}
          className={
            value === p.hex
              ? "h-[30px] w-[30px] cursor-pointer rounded-[7px] border border-white/15 outline outline-2 outline-offset-2 outline-[rgba(155,140,255,0.8)]"
              : "h-[30px] w-[30px] cursor-pointer rounded-[7px] border border-white/15"
          }
        />
      ))}
      <label
        title="Custom"
        aria-label={`${ariaLabel}: custom`}
        style={isCustom ? { background: value } : undefined}
        className={
          isCustom
            ? "relative flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-white/15 outline outline-2 outline-offset-2 outline-[rgba(155,140,255,0.8)]"
            : "relative flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-white/15 bg-[repeating-conic-gradient(#2a2a2e_0%_25%,#1c1c1f_0%_50%)] bg-[length:10px_10px]"
        }
      >
        {isCustom ? null : (
          <span className="pointer-events-none text-[15px] text-white/60">
            +
          </span>
        )}
        <input
          type="color"
          aria-label={`${ariaLabel} custom color`}
          value={isCustom ? (value as string) : "#9b8cff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Add the board color row to `LeftPanel`**

In `src/components/filament/LeftPanel.tsx`, add the import at the top:

```ts
import { ColorSwatchPicker } from "./ColorSwatchPicker";
```

Add to `LeftPanelProps` (after `showMeasurements: boolean; onShowMeasurements: (v: boolean) => void;`, currently lines 15-16):

```ts
  boardColor: string;
  onBoardColor: (c: string) => void;
```

Insert this row right after the "Show measurements" `<label>` block closes (currently line 105) and before `<Divider />` (currently line 107):

```tsx
      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-[rgba(233,234,240,0.7)]">
          Board color
        </div>
        <ColorSwatchPicker
          value={props.boardColor}
          onChange={props.onBoardColor}
          ariaLabel="Board color"
        />
      </div>
```

- [ ] **Step 3: Wire `boardColor` through `FilamentStudio`**

In `src/components/filament/FilamentStudio.tsx`, add these two props to the `<LeftPanel>` call (currently lines 449-475), after `onShowMeasurements={(v) => patch({ showMeasurements: v })}`:

```tsx
          boardColor={ui.boardColor}
          onBoardColor={(c) => patch({ boardColor: c })}
```

In `handleSave` (currently lines 340-360), add to the `snapshot` object after `boardPadding: s.boardPadding,`:

```ts
      boardColor: s.boardColor,
```

In `handleLoad` (currently lines 361-411), add this sanitizer after the `boardPadding` line (currently line 379):

```ts
    const boardColor =
      typeof d.boardColor === "string" ? d.boardColor : DEFAULT_BOARD_COLOR;
```

And add `boardColor,` to the final `patch({...})` call in `handleLoad` (after `boardPadding,`, currently around line 396).

- [ ] **Step 4: Run lint/typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`. Generate a wall. In the WALL section, click each board color preset and confirm the backing board *and* the dark backdrop behind every frame's fibres recolor together live. Open the browser's native color input via the "+" swatch, pick a custom hue, confirm it becomes the active (outlined) swatch. Click Save, reload the page, click Load, confirm the board color you picked is restored. Open devtools, edit `localStorage["filament.project"]` to delete the `boardColor` key, click Load again, confirm it falls back to the original dark default with no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/filament/ColorSwatchPicker.tsx src/components/filament/LeftPanel.tsx src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): add board color picker"
```

---

### Task 4: Frame color UI

**Files:**
- Modify: `src/components/filament/InspectorPanel.tsx`
- Modify: `src/components/filament/FilamentStudio.tsx`

**Interfaces:**
- Consumes: `ColorSwatchPicker` (Task 3); `StudioState.frameColors` (Task 2).
- Produces: `InspectorPanelProps.frameColor: string | null` / `onFrameColor: (c: string) => void`.

- [ ] **Step 1: Add the frame color row to `InspectorPanel`**

In `src/components/filament/InspectorPanel.tsx`, add the import at the top:

```ts
import { ColorSwatchPicker } from "./ColorSwatchPicker";
```

Add to `InspectorPanelProps` (after `onReseed: () => void;`, currently line 14):

```ts
  frameColor: string | null;
  onFrameColor: (c: string) => void;
```

In `SelectedFrame`, insert this block right after the header `<div className="flex items-center justify-between">...</div>` closes (currently lines 64-81) and before the stat cards `<div className="grid grid-cols-2 gap-2">` (currently line 83):

```tsx
      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-[rgba(233,234,240,0.7)]">
          Frame color
        </div>
        <ColorSwatchPicker
          value={props.frameColor}
          onChange={props.onFrameColor}
          ariaLabel="Frame color"
        />
      </div>
```

- [ ] **Step 2: Add a `handleFrameColor` handler in `FilamentStudio`**

Add this function near `handleReseed` (currently lines 323-330) in `src/components/filament/FilamentStudio.tsx`:

```ts
  const handleFrameColor = (color: string) => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const frameColors = [...s.frameColors];
    frameColors[s.selectedFrame] = color;
    patch({ frameColors });
  };
```

- [ ] **Step 3: Pass `frameColor`/`onFrameColor` to `InspectorPanel`**

In the `<InspectorPanel>` call (currently lines 495-511), add:

```tsx
          frameColor={
            ui.selectedFrame != null
              ? (ui.frameColors[ui.selectedFrame] ?? null)
              : null
          }
          onFrameColor={handleFrameColor}
```

- [ ] **Step 4: Reset `frameColors` wherever the whole wall regenerates**

In `handleGridSize` (currently lines 291-294), change:

```ts
  const handleGridSize = (n: number) => {
    rebuild(n, ui.masterSeed, styleOf(ui));
    patch({ gridSize: n, selectedFrame: null, selectedFiber: null });
  };
```

to:

```ts
  const handleGridSize = (n: number) => {
    rebuild(n, ui.masterSeed, styleOf(ui));
    patch({
      gridSize: n,
      selectedFrame: null,
      selectedFiber: null,
      frameColors: Array(n * n).fill(null),
    });
  };
```

In `handleReroute` (currently lines 295-299), change:

```ts
  const handleReroute = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({ masterSeed: seed });
  };
```

to:

```ts
  const handleReroute = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
      frameColors: Array(ui.gridSize * ui.gridSize).fill(null),
    });
  };
```

In `handleGenerate` (currently lines 300-309), change:

```ts
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
```

to:

```ts
  const handleGenerate = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
      empty: false,
      selectedFrame: null,
      selectedFiber: null,
      frameColors: Array(ui.gridSize * ui.gridSize).fill(null),
    });
  };
```

In `handlePreset` (currently lines 310-322), change:

```ts
  const handlePreset = (preset: EmptyStatePreset) => {
    const seed = randomSeed();
    rebuild(preset.gridSize, seed, styleOf(ui));
    patch({
      gridSize: preset.gridSize,
      palette: preset.palette,
      anim: preset.anim,
      masterSeed: seed,
      empty: false,
      selectedFrame: null,
      selectedFiber: null,
    });
  };
```

to:

```ts
  const handlePreset = (preset: EmptyStatePreset) => {
    const seed = randomSeed();
    rebuild(preset.gridSize, seed, styleOf(ui));
    patch({
      gridSize: preset.gridSize,
      palette: preset.palette,
      anim: preset.anim,
      masterSeed: seed,
      empty: false,
      selectedFrame: null,
      selectedFiber: null,
      frameColors: Array(preset.gridSize * preset.gridSize).fill(null),
    });
  };
```

Note `handleReseed` (currently lines 323-330) is intentionally left unchanged — re-seeding a single frame's fibre routing must not touch `frameColors`.

- [ ] **Step 5: Persist `frameColors` on save/load**

In `handleSave`, add to the `snapshot` object after `boardColor: s.boardColor,` (added in Task 3):

```ts
      frameColors: s.frameColors,
```

In `handleLoad`, add this sanitizer after the `boardColor` sanitizer (added in Task 3), using the already-computed `gridSize`:

```ts
    const frameCount = gridSize * gridSize;
    const frameColors: (string | null)[] =
      Array.isArray(d.frameColors) &&
      d.frameColors.length === frameCount &&
      d.frameColors.every((c) => c === null || typeof c === "string")
        ? d.frameColors
        : Array(frameCount).fill(null);
```

And add `frameColors,` to the final `patch({...})` call in `handleLoad`.

- [ ] **Step 6: Run lint/typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Manual browser verification**

Run: `npm run dev`. Generate a 3×3 wall. Select frame 1, set it to "Walnut". Select frame 2, set a custom color. Confirm both keep their distinct colors and the rest stay default. Click frame 1's ⟳ reseed button — confirm its color (Walnut) survives (only its fibre routing changes). Click "Re-route fibres" — confirm every frame's color resets to default. Re-assign a couple of colors, then change the grid size slider — confirm colors reset and no console errors appear at both a larger and a smaller grid size. Save, reload the page, click Load, confirm the colors you had set before reload are restored.

- [ ] **Step 9: Commit**

```bash
git add src/components/filament/InspectorPanel.tsx src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): add per-frame color picker"
```

---

### Task 5: Final verification pass

**Files:** none (verification only)

**Interfaces:** none — this task exercises the combined feature built in Tasks 1-4.

- [ ] **Step 1: Full automated check**

Run: `npm run check && npm run test && npm run build`
Expected: all pass with no errors.

- [ ] **Step 2: Golden path in the browser**

Run: `npm run dev`. From the empty state, generate a wall. Set a board color. Select several frames and give each a different color (mix of presets and custom). Toggle between Edit and Simulate mode and confirm frame bezels darken consistently in sim mode for both default and custom-colored frames (same relative dimming). Save, reload, Load — confirm the whole configuration (board color, every frame's color) is restored exactly.

- [ ] **Step 3: Edge cases**

- Legacy save: in devtools, edit `localStorage["filament.project"]` to remove both `boardColor` and `frameColors` entirely, click Load — confirm it renders with today's original defaults and no console errors.
- Grid resize with colors set: with several frame colors assigned, drag the grid size from 3 to 6 and back to 2 — confirm no runtime errors and colors are cleanly reset each time (not stale/misindexed).
- Perf: at a 6×6 grid, confirm animation still runs smoothly (per `CLAUDE.md`'s documented ~44fps budget at 6×6) — these changes only replace `fillStyle` string values, so no new per-LED work should be introduced.

- [ ] **Step 4: Report**

No commit for this task — if any issue surfaces, fix it as a new small commit against the task where it was introduced, then re-run this task's steps.
