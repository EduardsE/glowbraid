# Board padding design

## Context

The real fibre-optic wall has a physical backing board underneath the frames — frames are fixed to it, and the board is visible in the gaps between frames and around their outer edge. The simulator currently has no board at all; frames float on the canvas background. This adds a board behind the frame grid with a user-controlled padding (margin) around the frames' outer edge.

Builds on the in-flight `frameGap` feature (uncommitted at design time): a per-frame spacing slider that replaced the old fixed `frameSize * 0.09` gap. Board padding follows the same pattern — a new axis threaded through state, viewport math, the renderer, and persistence.

## Requirements

- A board renders behind the frame grid, filling the entire area behind the frames including the inter-frame gaps.
- Board size = tight frame-grid outline + uniform padding on all four sides. Padding is a single value, not per-side.
- Padding is user-adjustable via a slider, range 0–120px, step 2, default 40px. At padding = 0 the board is exactly the frame outline (this is the enforced minimum — the UI simply doesn't allow negative values).
- Appearance: flat dark neutral fill (distinct tone from the frame bezels), square corners, thin subtle stroke for edge definition. No shadow/gradient.
- The 82%-of-canvas "fit to viewport" behavior applies to the *board*, not just the frame grid — increasing padding shrinks frames slightly to keep the whole board in view, rather than letting the board overflow the canvas.
- Persisted per-project like `frameGap`: legacy saves without the field load with the default (40).

## Non-goals

- Per-side padding (e.g. wider bottom margin for cable routing) — uniform only for now.
- Board material/texture variety (wood grain, color picker) — flat dark neutral only.
- Rounded board corners — square only, per explicit choice (contrasts with the frames' rounded corners, reads as a cut panel).

## Data model

`ProjectSnapshot` (`src/engine/types.ts`) gains:

```ts
/** Pixel padding between the frame grid's outer edge and the board edge. Absent in legacy saves → loader defaults to 40. */
boardPadding: number;
```

`StudioState` (`src/components/filament/FilamentStudio.tsx`) gains `boardPadding: number`, initialized to `40` in `INITIAL_STATE`.

## Layout math (`src/renderer/viewport.ts`)

`ViewportInput` gains `boardPadding: number`. `computeWallLayout` changes:

- `wall` keeps its current meaning: the tight frame-grid extent, `gridSize * frameSize + (gridSize - 1) * frameGap`.
- New `boardExtent = wall + 2 * boardPadding` (unscaled).
- The 82% fit (`base`) is computed against `boardExtent` instead of `wall`.
- `scale = base * zoom` (unchanged formula, new input).
- Board origin: `boardX/boardY = canvasWidth/2 + pan.x - (scale * boardExtent) / 2` (and the height equivalent for Y).
- Frame-grid origin `tx/ty` becomes the board origin inset by the scaled padding: `tx = boardX + scale * boardPadding`, `ty = boardY + scale * boardPadding`.
- `frameRect` is unchanged — it already only depends on `tx`/`ty`/`scale`/`gap`, which still correctly place frames since `tx`/`ty` now account for the padding inset.

`WallLayout` gains `boardX`, `boardY`, `boardSize` (= `scale * boardExtent`), all in canvas px, for the renderer to draw the panel.

At `boardPadding = 0`, `boardExtent === wall`, `boardX/Y === tx/ty` computed the old way — behavior is bit-for-bit identical to pre-feature layout.

## Rendering (`src/renderer/wallRenderer.ts`)

`WallDrawState` gains `boardPadding: number`, threaded into the `computeWallLayout` call inside `drawWall`.

Before the per-frame draw loop, `drawWall` fills one rect using the layout's `boardX/boardY/boardSize`:

- Fill: flat dark neutral, e.g. `#101114` (distinct from bezel `#141519`/`#181a20`, dark enough to read as a separate structural layer behind the frames).
- Square corners (plain `ctx.fillRect`, no `roundRect`).
- Stroke: `rgba(255,255,255,0.06)`, 1px, for edge definition against the canvas background.
- No shadow, no gradient — kept cheap since it draws once per frame regardless of grid size.

`drawShowcaseFrame` (empty-state single demo frame) is untouched — it has no grid/board concept.

## UI (`src/components/filament/LeftPanel.tsx`)

New `SliderRow` "Board padding" (`min=0 max=120 step=2`, value `${boardPadding}px`), placed directly under the existing "Frame spacing" row in the WALL section. New props `boardPadding: number` / `onBoardPadding: (n: number) => void` on `LeftPanelProps`.

`FilamentStudio` wires `boardPadding` through:
- `StudioState` + `INITIAL_STATE` (default 40)
- the `WallDrawState` object passed to `drawWall`
- the `computeWallLayout` call used for resize/viewport recompute
- `LeftPanel` props (`boardPadding` / `onBoardPadding={(n) => patch({ boardPadding: n })}`)
- save: include in the `ProjectSnapshot` written on save
- load: `Number.isFinite(Number(d.boardPadding)) ? Number(d.boardPadding) : 40`, mirroring the existing `frameGap` load fallback

## Testing

Add `src/renderer/__tests__/viewport.test.ts` (no existing renderer tests; follows the `src/engine/__tests__` convention):

- `boardPadding = 0` produces the same `scale`/`tx`/`ty` as calling `computeWallLayout` would have without padding — locks in the no-regression case.
- A positive `boardPadding` (all other inputs fixed) produces a smaller `scale` than `boardPadding = 0` — locks in "board fits viewport, frames shrink" behavior.
- `frameRect` output at a given index is still consistent with `tx`/`ty`/`scale`/`gap` regardless of `boardPadding` (i.e., frame placement math itself didn't change).
