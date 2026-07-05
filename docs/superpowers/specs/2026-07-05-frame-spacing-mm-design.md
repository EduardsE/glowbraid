# Frame spacing in millimetres design

## Context

Frame spacing (`frameGap`) is currently a whole-number centimetre value, 0–15, defaulting to 2, set alongside frame size and board padding (both cm, see [2026-07-05-real-measurements-design.md](2026-07-05-real-measurements-design.md)). The gaps a real fibre-wall needs between frames are small — a handful of millimetres — so a 1cm-granularity slider is too coarse. This changes frame spacing's unit to millimetres with a 0–30mm range, while frame size and board padding stay in centimetres.

## Requirements

- The frame spacing slider (`LeftPanel.tsx`) ranges 0–30, step 1, labeled `${v} mm`, default 20 (same visual gap as today's 2cm default, just relabeled).
- Frame size and board padding are untouched — still cm, same ranges/defaults.
- The wall layout (`computeWallLayout`) and the blueprint total-width calculation (`computeDimensionSegments`) both currently add `frameGap` directly into cm arithmetic. Since frame spacing is now stored in mm, every call site that feeds `frameGap` into that cm math converts it (`/ 10`) first. `viewport.ts` and its existing tests are unit-agnostic and stay untouched — callers own the conversion.
- The blueprint dimension overlay's frame-gap segment displays its own value in millimetres (e.g. `"20 mm"`), while total width/height, frame size, and padding segments stay in centimetres, matching each field's own unit.
- No legacy-save migration: an old snapshot's `frameGap: 2` (previously meaning 2cm) now loads and clamps as `2` mm. Accepted semantic change, per explicit decision — consistent with the precedent in the real-measurements design.

## Non-goals

- Sub-integer (decimal mm) precision.
- Changing frame size or board padding units.
- Any engine change — this is UI/renderer only, `frameGap` never touches `src/engine/`.

## Data model

`ProjectSnapshot.frameGap` (`src/engine/types.ts`) keeps its type (`number`) and field name; only its doc comment/meaning changes from centimetres to millimetres. `StudioState.frameGap` / `INITIAL_STATE.frameGap` likewise stay `number`, default changes `2` → `20`.

`handleLoad`'s `cmField(d.frameGap, 2, 0, 15)` call becomes `cmField(d.frameGap, 20, 0, 30)` (same clamp-and-default helper, new default/bounds).

## Conversion boundary

`frameGap` is read directly as a cm-equivalent number in three places today; each divides by 10 before use, converting mm → cm at the point of consumption:

1. `src/renderer/wallRenderer.ts` — `drawWall`'s call to `computeWallLayout({ ..., frameGap: state.frameGap, ... })` becomes `frameGap: state.frameGap / 10`.
2. `src/renderer/wallRenderer.ts` — the dimension-overlay call's `frameGapCm: state.frameGap` becomes `frameGapCm: state.frameGap / 10`, plus a new `frameGapMm: state.frameGap` passed through for the segment label (see below).
3. `src/components/filament/FilamentStudio.tsx` — the click-hit-test call to `computeWallLayout({ ..., frameGap: s.frameGap, ... })` becomes `frameGap: s.frameGap / 10`.

`viewport.ts`'s `ViewportInput.frameGap` field keeps meaning "gap in the same unit as `frameSize`" (cm) — no change to its type or math, so `viewport.test.ts` is unaffected.

## Dimension overlay label (`src/renderer/dimensions.ts`)

`DimensionCm` gains a fourth field used only for the gap segment's label, so the total-width sum stays in cm while the gap's own label reads in mm:

```ts
export interface DimensionCm {
  frameSizeCm: number;
  frameGapCm: number;   // used in total-width math, e.g. 2 (cm)
  frameGapMm: number;   // used only for this segment's own label, e.g. 20 (mm)
  boardPaddingCm: number;
}
```

In `computeDimensionSegments`, the existing gap segment:

```ts
label: `${cm.frameGapCm} cm`,
```

becomes:

```ts
label: `${cm.frameGapMm} mm`,
```

The zero-check gating the segment (`cm.frameGapCm > 0`) stays keyed on the cm value (equivalent to checking mm > 0, since both are zero or both non-zero together).

## UI (`src/components/filament/LeftPanel.tsx`)

The frame-spacing `SliderRow`:

```tsx
<SliderRow label="Frame spacing" value={`${props.frameGap} mm`}>
  <input type="range" aria-label="Frame spacing" min={0} max={30} step={1} ... />
</SliderRow>
```

Frame size and board padding rows are unchanged.

## Testing

Update `src/renderer/__tests__/dimensions.test.ts`: the `CM` fixture gains `frameGapMm: 20` (with `frameGapCm: 2` unchanged, matching the mm/cm pair a real caller would pass), and the gap-segment assertion changes from `"2 cm"` to `"20 mm"`. The zero-gap test's fixture similarly gains `frameGapMm: 0`.

`viewport.test.ts` is unaffected — its `frameGap: 20` fixture already represents a raw cm-space number passed straight to `computeWallLayout`, which doesn't change.
