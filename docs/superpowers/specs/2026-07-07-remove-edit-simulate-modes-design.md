# Remove Edit/Simulate modes — 3D-only app — design

## Goal

Drop the Edit and Simulate tabs. They don't add anything the 3D view
doesn't already cover (frame selection, re-seed, colour, board art,
animation/palette controls all already work in 3D — see
`2026-07-07-clickable-frames-3d-design.md`). The app becomes 3D-only: no
mode switcher, no 2D canvas.

Because Edit and Simulate are the only consumers of the entire 2D canvas
stack, removing them turns that stack into dead code. This is a cleanup
pass, not just a UI tweak: delete what's unreachable, trim what's shared,
leave what 3D still needs.

## Non-goals (YAGNI)

- No new 3D features to "make up for" losing Edit/Simulate. If something
  turns out to be missing later (e.g. a measurements overlay), that's a
  future spec.
- No changes to the engine layer (`src/engine/`) beyond the
  `ProjectSnapshot` type — geometry/light generation is untouched.
- No data migration for old saves. Removed `ProjectSnapshot` fields are
  simply no longer read; existing localStorage JSON with `mode` /
  `showMeasurements` keys loads fine, those keys are just ignored.

## Constraints (from CLAUDE.md)

- **Layering:** engine → renderer → UI, imports point left only. This
  touches `renderer/`, `renderer3d/` (import path only, no logic changes),
  and `components/glowbraid/`. No engine changes.
- **Determinism / persistence contract:** removing `ProjectSnapshot` fields
  must not break loading legacy saves. The existing loader in
  `GlowbraidStudio.tsx` already sanitizes every field with a fallback —
  we're removing fields from that allowlist, not changing how surviving
  fields are read.
- **3D stays lazy-loaded:** `renderer3d/wall3d.ts` (and anything that
  statically imports it) must not enter the initial bundle. `ensure3D()`'s
  dynamic `import("@/renderer3d/wall3d")` stays a dynamic import — only its
  *trigger* moves from "user clicks 3D" to "on mount."

## Behaviour changes

| Before | After |
|---|---|
| Header shows Edit / Simulate / 3D pill, click to switch | No pill. App always renders 3D. |
| 3D renderer lazy-loads on first switch to 3D | 3D renderer lazy-loads on mount |
| Bottom-right chip: "EDIT · LEDS VISIBLE" / "SIMULATE · INSTALLATION VIEW" / "3D · INSTALLATION VIEW" | Chip removed |
| Bottom-left hint chips vary by mode | Always the 3D set: drag·orbit, right-drag·pan, scroll·dolly |
| Zoom in/out/fit branch on mode (2D zoom vs. 3D dolly/reset) | Always dolly/reset (3D) |
| LeftPanel has a "Show measurements" toggle | Toggle removed (2D-only blueprint overlay, no 3D equivalent) |
| 3D load failure falls back to Simulate mode + notice | 3D load failure shows the notice; canvas stays blank (no fallback view exists) |

## Components & changes

### `src/components/glowbraid/Header.tsx`

Remove `mode` / `onModeChange` props and the `ModeButton` sub-component
entirely. Drop the now-unused `PencilRuler`/`Play`/`Box` icon imports
(keep `Minus`/`Plus` for zoom). Header renders brand, wall label, and zoom
controls only.

### `src/components/glowbraid/GlowbraidStudio.tsx`

- Remove `mode` and `showMeasurements` from `StudioState`, `INITIAL_STATE`,
  the loader (`buildInitialProject`), and the autosave snapshot.
- Remove the 2D `<canvas ref={canvasRef}>` element; the GL canvas
  (`glCanvasRef`) is the only canvas, always visible (no more
  `mode3dActive` hidden-class ternary).
- Remove `useCanvasInteraction` usage (the hook itself is deleted — see
  below) and the `computeWallLayout`/`pickFrame` 2D click handler.
- `draw()`: drop the `if (s.mode === "3d") { ... } else { drawWall(...) }`
  branch — always call `wall3dRef.current?.render(...)`. Drop the
  `drawWall` import.
- `ensure3D()`: called once on mount (replaces the
  `if (uiRef.current.mode === "3d") void ensure3D()` effect keyed on
  mode). On failure, keep setting the "3D view unavailable" notice; drop
  the `setUi(prev => prev.mode === "3d" ? {...} : prev)` fallback since
  there's no other mode to fall back to.
- Remove `handleMode`, the `mode3dActive` variable, and the bottom-right
  status chip block. Hint chips collapse to the single 3D set
  (unconditional, no ternary).
- Header render call drops `mode`/`onModeChange`; `zoomPct` always shows
  the 3D "3D" label (or keep computing it the way 3D already does today —
  no behaviour change there, just drop the 2D branch).
- LeftPanel render call drops `showMeasurements`/`onShowMeasurements`.

### `src/components/glowbraid/LeftPanel.tsx`

Remove the `showMeasurements`/`onShowMeasurements` props, the "Show
measurements" row (`Switch` usage), and the local `Switch` component
definition (it has no other caller in this file).

### `src/engine/types.ts`

Remove `mode` and `showMeasurements` from `ProjectSnapshot`. Update the
`frameColors` doc comment, which currently says "null = use the default
edit/sim pair" — reword to just "default bezel color" since there's no
edit/sim distinction left.

### `src/renderer/viewport.ts`

Trim to just `frameGradientPos` (still used by
`renderer3d/fiberColors.ts`). Delete `ViewportInput`, `WallLayout`,
`computeWallLayout`, `FrameRect`, `frameRect`, `pickFrame` — these
supported the 2D canvas's pixel layout and hit-testing only; nothing in
`renderer3d/` uses them (3D has its own `WorldLayout`/`frameOrigin`).

### `src/renderer/wallRenderer.ts` → renamed `src/renderer/wallDefaults.ts`

Trim to the two exports `renderer3d/wall3d.ts` actually imports:
`DEFAULT_BOARD_COLOR` and `shadeForSim`. Delete `drawWall`, the LED
glow-sprite cache (`ledGlowSprite`, `glowSpriteCache`, `GLOW_SPRITE_SIZE`),
`frameGeometry`, `frameCornerRadii`, `FRAME_BEZEL_RATIO`, and their
imports from `dimensions.ts`/`lightMapping.ts`/`pourTexture.ts`/
`pourField.ts`/`viewport.ts`/`engine/animation`/`engine/light` (all
2D-drawing-only). Rename because a file called "wallRenderer" that
renders nothing is misleading — it's now just shared board-color
constants used by engine-level defaults and the 3D renderer.

Update the two import sites: `renderer3d/wall3d.ts` and
`components/glowbraid/GlowbraidStudio.tsx`.

`shadeForSim`'s doc comment currently says "Approximates the app's
existing edit→sim bezel darkening" — reword to drop the now-defunct
"edit mode" reference (it's just "the darkened installation-view bezel
tone" now).

### Deleted files

- `src/components/glowbraid/useCanvasInteraction.ts` — 2D-only pan/zoom/click
  hook, no other caller.
- `src/renderer/dimensions.ts` — measurement-overlay math, only consumer
  was `drawWall`'s `showMeasurements` branch.
- `src/renderer/lightMapping.ts` — light/saturation shaping, only consumer
  was `wallRenderer.ts`'s deleted `drawFrame` path.
- `src/renderer/__tests__/dimensions.test.ts`
- `src/renderer/__tests__/lightMapping.test.ts`
- `src/renderer/__tests__/viewport.test.ts` — every test in it exercises
  `computeWallLayout`/`frameRect`, both deleted.

### Trimmed/renamed test file

`src/renderer/__tests__/wallRenderer.test.ts` →
`src/renderer/__tests__/wallDefaults.test.ts`, keeping only the
`describe("shadeForSim", ...)` block (3 cases) and dropping the
`frameGeometry`/`frameCornerRadii` describes and the
`computeWallLayout`/`frameRect` import.

### `CLAUDE.md`

Update the `src/renderer/` architecture bullet. Currently: "Canvas2D
drawing: `wallRenderer.ts` (wall + showcase frame), `mapRenderer.ts`
(inspector connection map), `viewport.ts` (layout/zoom/pan math + hit
testing)." Replace with a description matching the post-cleanup contents:
`mapRenderer.ts` (inspector connection map, unchanged), `viewport.ts`
(now just `frameGradientPos`, shared with 3D), `pourField.ts`/
`pourTexture.ts` (board-art generation, shared with 3D), `wallDefaults.ts`
(board-color constants/shading shared with 3D). Note that 2D wall
rendering no longer exists — the app is 3D-only.

## Testing

- Existing Vitest suite must pass after the deletions/trims — in
  particular `renderer3d/__tests__/fiberColors.test.ts` (depends on
  `frameGradientPos`, which survives unchanged) and the new
  `wallDefaults.test.ts` (`shadeForSim`, unchanged behaviour, just
  relocated).
- `npm run check` (Biome) must pass — catches now-unused imports left
  behind by the trims (e.g. in `GlowbraidStudio.tsx`, `Header.tsx`).
- **Manual:** `npm run dev` — app opens straight into 3D with no mode
  switcher, orbit/pan/dolly/click-to-select/outline all still work
  (unchanged from the current 3D feature set), zoom buttons dolly the 3D
  camera, LeftPanel has no measurements toggle, a fresh grid-size change
  still rebuilds correctly. Load a save created before this change (with
  `mode`/`showMeasurements` keys in localStorage) and confirm it loads
  without error.

## Risks / edge cases

- **Legacy saves with `mode: "edit"` or `"sim"`:** irrelevant now — the
  field is never read, so whatever value is stored is inert.
- **3D load failure with no fallback view:** previously a failed
  `ensure3D()` dropped the user back to Simulate with a notice; now the
  notice fires but the canvas has nothing to show. This is a real (if
  rare) UX regression, accepted per the design — there is no 2D view left
  to fall back to.
- **Import churn from the `wallRenderer.ts` → `wallDefaults.ts` rename:**
  two call sites, both known and enumerated above; Biome/tsc will catch
  any missed reference.
