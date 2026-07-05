# Real measurements (cm) + blueprint dimension overlay design

## Context

`frameSize`, `frameGap`, and `boardPadding` are currently abstract numbers labeled "px" in the UI (defaults 236/20/40). They were never screen pixels: `computeWallLayout` (`src/renderer/viewport.ts`) normalizes the whole board to fit 82% of the canvas, so only the *ratios* between the three values matter. This feature re-units those fields to real centimetres — the user describes the physical wall they intend to build — and adds an optional blueprint-style dimension overlay on the canvas showing the measurements.

On-screen size intentionally does **not** reflect real size; the viewport keeps its fit-to-canvas behavior. Relative proportions are what matter.

## Requirements

- Frame size, frame spacing, and board padding are defined in whole centimetres via the existing sliders: frame size 10–40 cm (default 25), spacing 0–15 cm (default 2), padding 0–20 cm (default 4), all step 1. Slider value labels read `25 cm` etc.
- Defaults 25/2/4 preserve the current default wall's proportions (236:20:40 ≈ 25:2.1:4.2), so a fresh wall looks essentially unchanged.
- A "Show measurements" checkbox in the WALL section toggles a blueprint-style dimension overlay on the wall canvas. Display only — no interaction with the dimension graphics.
- The overlay shows: total board width, total board height, one representative frame size, one representative frame gap, one representative board padding. Labels are always integer centimetres formatted `N cm` (no metres).
- The overlay follows pan/zoom (it is derived from the same `WallLayout` as the wall itself) and renders in both edit and sim modes.
- `showMeasurements` persists in the project snapshot; the cm fields persist as plain numbers (now meaning cm).
- No legacy-save migration. The loader clamps whatever numbers it finds into the new cm ranges (an old px-scale save's `frameSize: 236` clamps to 40). Accepted data loss, per explicit decision.

## Non-goals

- Real-size on-screen rendering (px-per-cm calibration).
- Editing measurements by clicking dimension labels.
- Metre formatting, imperial units, or sub-centimetre precision.
- Per-frame or per-side dimensions; one representative annotation per kind is enough.
- Engine changes — fibre/LED geometry stays normalized 0–1 per frame; RNG draw order untouched.

## Data model

Semantics change only — `ProjectSnapshot` (`src/engine/types.ts`) keeps `frameSize` / `frameGap` / `boardPadding` as `number`, with doc comments updated from "pixel" to "centimetres". One new field:

```ts
/** Blueprint dimension overlay toggle. Absent in legacy saves → loader defaults to false. */
showMeasurements: boolean;
```

`StudioState` (`src/components/filament/FilamentStudio.tsx`) gains `showMeasurements: boolean`; `INITIAL_STATE` becomes `frameSize: 25, frameGap: 2, boardPadding: 4, showMeasurements: false`.

`ViewportInput` and `computeWallLayout` are untouched — the math is unit-agnostic.

## Dimension overlay (`src/renderer/dimensions.ts`, new file)

Split pure-computation from drawing so the geometry is unit-testable:

### `computeDimensionSegments(layout: WallLayout, cm: { frameSizeCm, frameGapCm, boardPaddingCm }): DimSegment[]`

```ts
interface DimSegment {
  /** Dimension line endpoints, canvas px */
  a: Point;
  b: Point;
  orientation: "horizontal" | "vertical";
  label: string; // e.g. "25 cm"
}
```

Segments produced (grid size read from `layout.gridSize`):

- **Total width** — horizontal, spanning `boardX → boardX + boardSize`, on the far row above the board. Label: `gridSize·frame + (gridSize−1)·gap + 2·padding` cm.
- **Total height** — vertical, spanning `boardY → boardY + boardSize`, left of the board. Same total (board is square).
- **Near row above the board**, left to right across the first (top-left) frame, using `frameRect(layout, 0)`:
  - board padding: `boardX → firstFrame.x`
  - frame size: `firstFrame.x → firstFrame.x + firstFrame.size`
  - frame gap: `firstFrame.x + firstFrame.size → secondFrame.x` (only when `gridSize > 1`)
- Zero-valued segments are skipped (padding 0, gap 0) — no zero-length lines or overlapping labels.

Row offsets are fixed screen-px distances from the board edge (near row ≈ 18px, far row ≈ 40px, left row ≈ 18px), so label size and line spacing stay readable at any zoom.

### `drawDimensions(ctx: CanvasRenderingContext2D, segments: DimSegment[]): void`

Blueprint conventions, kept subtle against the dark canvas:

- 1px hairline dimension line with short perpendicular end ticks; thin extension lines from the measured edges to the dimension line.
- Stroke `rgba(140, 180, 220, 0.5)` (faint blueprint blue-grey); label text same color at full-ish alpha.
- Label: ~10px monospace (`ui-monospace` stack), centered on the line; horizontal labels sit just above their line, vertical labels are drawn rotated −90° alongside theirs.

No caching or sprites needed — a handful of strokes and `fillText` calls per frame, far below the glow-sprite hot path budget. No `shadowBlur`.

## Rendering integration (`src/renderer/wallRenderer.ts`)

`WallDrawState` gains `showMeasurements: boolean`. At the end of `drawWall` (after frames/fibres are drawn, so lines sit on top), when the flag is set:

```ts
drawDimensions(ctx, computeDimensionSegments(layout, {
  frameSizeCm: state.frameSize,
  frameGapCm: state.frameGap,
  boardPaddingCm: state.boardPadding,
}));
```

`drawWall` already computes `layout` internally, so no layout recomputation in `FilamentStudio`. `drawShowcaseFrame` (empty state) is untouched.

## UI (`src/components/filament/LeftPanel.tsx`)

- The three `SliderRow`s change to `min/max/step` = 10/40/1, 0/15/1, 0/20/1 and value labels `` `${v} cm` ``.
- New "Show measurements" row directly under the board-padding slider: label text plus a checkbox, styled consistently with existing rows (existing checkbox pattern if one exists, else a plain styled `<input type="checkbox">`). New props `showMeasurements: boolean` / `onShowMeasurements: (v: boolean) => void`.

`FilamentStudio` wiring:

- `showMeasurements` in `StudioState`/`INITIAL_STATE`, threaded into the `drawWall` state object and `LeftPanel` props (`patch({ showMeasurements: v })`).
- save: include `showMeasurements` in the written `ProjectSnapshot`.
- load (`handleLoad`), following the existing sanitize pattern:
  - `showMeasurements: d.showMeasurements === true` (defaults false),
  - the three cm fields: `Number.isFinite` fallback to default, then clamp into their slider ranges (`clamp(10, 40, …)` etc.) so out-of-range legacy px values land on a valid cm value.

## Testing

New `src/renderer/__tests__/dimensions.test.ts` covering `computeDimensionSegments` with a hand-built `WallLayout` (via `computeWallLayout` on known inputs):

- Total width/height labels equal `gridSize·frame + (gridSize−1)·gap + 2·padding` cm and span exactly `boardX → boardX + boardSize` / `boardY → boardY + boardSize`.
- Near-row segments align with `frameRect(layout, 0)` edges and carry labels `"{padding} cm"`, `"{frameSize} cm"`, `"{gap} cm"`.
- `gridSize: 1` produces no gap segment; `frameGap: 0` and `boardPadding: 0` skip their segments while the rest remain.

Existing `viewport.test.ts` and engine tests are unaffected (no math or engine changes).
