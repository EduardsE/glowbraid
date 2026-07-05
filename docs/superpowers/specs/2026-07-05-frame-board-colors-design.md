# Frame & board colors design

## Context

Frame bezels and the backing board currently render with hardcoded colors in `wallRenderer.ts`: the board (and the area behind the fibres inside each frame, which is just the board showing through — there is no separate inner-panel layer) is `#101114`, and the frame bezel is `#181a20` in edit mode / `#141519` in sim mode. This adds user control over both: board color is one global choice for the whole wall, frame color is chosen independently per frame.

## Requirements

- User can set a global board color, applied to the backing board and to the area behind the fibres in every frame (both are the same fill today; they stay the same fill, just user-controlled).
- User can set a color per individual frame, independent of every other frame's color.
- Picker offers 5 presets (Black `#181a20`, Graphite `#4a4a4a`, White `#e8e4d8`, Walnut `#6b4a32`, Oak `#c9a066`) plus a custom swatch that opens the native `<input type="color">`; the custom swatch shows the currently-picked custom hue once set. Same shared preset list and component for both board and frame pickers.
- The edit-mode/sim-mode brightness difference that exists today for the default frame bezel (`#181a20` vs `#141519`) is preserved for any chosen frame color — a shading function derives the sim-mode tone from the edit-mode (base) tone, rather than only the two hardcoded literals.
- Persisted per-project, following the existing tolerant-loader pattern: absent fields fall back to today's hardcoded look, so old saves are visually unchanged.

## Non-goals

- Explicit "reset to default" control — selecting the "Black" preset is close enough visually; not worth dedicated UI.
- Per-side or gradient board/frame coloring — flat single fill only, matching current rendering.
- Changing the recessed-panel concept — confirmed there isn't one; it's the board color showing through, not a third layer.

## Data model

`src/engine/types.ts` — `ProjectSnapshot` gains:

```ts
/** Backing board / fibre-backdrop fill. Absent in legacy saves → loader defaults to "#101114". */
boardColor?: string;
/** Per-frame bezel color, parallel to `seeds` (null = use default edit/sim pair). Absent or length-mismatched → loader defaults to all null. */
frameColors?: (string | null)[];
```

`StudioState` (`FilamentStudio.tsx`) gains:

```ts
boardColor: string;         // default "#101114"
frameColors: (string | null)[]; // default: array of `gridSize * gridSize` nulls
```

## Data lifecycle

- `rebuild()` (called by grid-size change, Reroute, Generate new wall, and Load) resets `frameColors` to an all-null array sized to the new frame count — these actions already discard every frame's seed/fibre identity, so their color resets too.
- `handleReseed` (single-frame ⟳ button) does not touch `frameColors` — a frame's color is a property of its slot, independent of its fibre routing.
- `boardColor` is untouched by any of the above; it only changes via direct user action.

## Rendering (`src/renderer/wallRenderer.ts`)

- `WallDrawState` gains `boardColor: string` and threads it into both:
  - the board `fillStyle` (replacing the `"#101114"` literal)
  - the frame panel's `fillStyle` (replacing the `"#07080b"` literal at the top of `drawFrame`'s clipped panel fill) — confirmed this is the board color showing through, not an independent tone.
- `FrameDrawOptions` gains `color: string | null` (the resolved per-frame color, or `null` for default) passed down from `drawWall`'s per-frame loop (`state.frameColors[index] ?? null`).
- `drawFrame`'s bezel fill becomes:
  - `color == null`: keep today's literals (`edit ? "#181a20" : "#141519"`).
  - `color` set: `edit ? color : shadeForSim(color)`, where `shadeForSim` is a small new pure helper that multiplies each RGB channel by a fixed ratio (`0.8`, the rounded average of the per-channel ratios implied by the two current literals — they aren't perfectly uniform, so this is an approximation, not an exact reproduction), clamped to `[0, 255]`.
- `drawShowcaseFrame` (empty-state demo frame) passes `color: null` — it has no per-frame color concept, keeps today's literal look.

## UI

New shared component `src/components/filament/ColorSwatchPicker.tsx`:

```ts
interface ColorSwatchPickerProps {
  value: string | null;       // null = default/unset
  onChange: (color: string) => void;
  ariaLabel: string;
}
```

Renders the 5 preset swatches (shared `PRESET_COLORS` const exported from the same file) plus one custom swatch (checkerboard background when unset, else shows the picked hue) wrapping a transparent `<input type="color">`, matching the approved "custom swatch inline" mockup layout. Highlights whichever swatch matches `value` (preset hex or custom); no highlight when `value` is `null`.

- `LeftPanel.tsx`: new `ColorSwatchPicker` row labeled "Board color" in the `WALL` section, directly under "Show measurements". New props `boardColor: string` / `onBoardColor: (c: string) => void`.
- `InspectorPanel.tsx`: new `ColorSwatchPicker` row labeled "Frame color" in `SelectedFrame`, directly under the Frame-number/reseed header row, above the stat cards. New props `frameColor: string | null` / `onFrameColor: (c: string) => void`.
- `FilamentStudio.tsx` wiring:
  - `INITIAL_STATE.boardColor = "#101114"`, `INITIAL_STATE.frameColors = []` (populated on first `rebuild`).
  - `rebuild()` also resets `frameColors` to `Array(count).fill(null)`.
  - `onFrameColor` handler sets `frameColors[selectedFrame]` via `patch` (new array, since it's React state — not a ref, matching how `selectedFrame`/`selectedFiber` are state for the same "infrequent, UI-driven change" reason).
  - `handleSave` includes `boardColor` and `frameColors` in the `ProjectSnapshot`.
  - `handleLoad` sanitizes: `typeof d.boardColor === "string" ? d.boardColor : "#101114"`; `frameColors` valid only if it's an array of the correct length (`gridSize * gridSize`) with each entry `string | null`, else falls back to all-null.

## Testing

- `src/renderer/__tests__/wallRenderer.test.ts` (new, or added to an existing renderer test file if one now exists): unit test for the `shadeForSim` helper — verify it reproduces the current `#181a20` → `#141519`-equivalent ratio, and that it clamps channels at 0/255 for extreme input colors (e.g. pure white/black presets).
- `FilamentStudio.tsx`'s `handleLoad` sanitization has no existing unit test coverage (it's exercised via the UI, not a pure function) — no new test added here, consistent with the rest of that function's fields (e.g. `boardPadding`, `curviness`) which are also untested at the unit level.
