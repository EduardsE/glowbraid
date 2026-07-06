# Poured-Acrylic Board Art — Design

**Date:** 2026-07-07
**Status:** Approved for planning

## Summary

Replace the backing board's flat color fill with an optional, seeded, procedurally
generated acrylic-pour painting. The artwork is a static image — the board is a
physically painted surface in the real installation — generated once per settings
change and drawn behind the frames in both the 2D views and the 3D installation
view. LEDs, fibres, and the animation engine are untouched.

## Goals

- A "Pour" board-art mode that produces marbled flow lines and cellular
  lacing structures characteristic of acrylic pouring (domain-warped noise +
  Worley cells).
- Deterministic from a seed: a saved project regenerates the identical painting.
- Independent pour palettes with whites and near-blacks (the LED palettes
  deliberately lack both).
- Zero per-frame rendering cost beyond a `drawImage` blit.

## Non-goals (YAGNI)

- Animating the pour.
- Custom user-defined palettes.
- Per-frame (per-tile) artworks.
- Exporting the generated image.
- Any engine (`src/engine/`) changes — the board art is simulator-visual only
  and will never run on the ESP32 hardware.

## Architecture

Two new renderer-layer modules; imports still point strictly left
(renderer → engine).

### `src/renderer/pourField.ts` — pure math, DOM-free

Built on the engine's existing `hash` (`src/engine/random.ts`). Contains:

- Seeded 2D value noise and fBm helpers.
- A domain-warp step: sample coordinates are displaced through 2–3 octaves of
  warped noise before the final field lookup. This produces the marbled,
  curling flow lines of a pour.
- Worley (cellular) noise returning F1 and F2 distances. The F2−F1 edge
  channel drives thin bright "lacing" along cell borders and darkened cell
  rims; cell interiors map to palette colors.
- `POUR_PALETTES: Record<PourPaletteId, PourPalette>` where
  `PourPalette = { id, name, stops: RGB[] }` (same shape as engine palettes,
  separate type). Four palettes modeled on the reference images:
  - **tidal** — teal / ink / white
  - **magma** — red / orange / blue / white
  - **bubblegum** — pink / blue / mint
  - **iris** — purple / gold / black / white
- The single entry point:

  ```ts
  renderPourRGBA(
    seed: number,
    palette: PourPalette,
    width: number,
    height: number,
  ): { pixels: Uint8ClampedArray; averageLuminance: number }
  ```

  `pixels` is RGBA (length `width * height * 4`, alpha always 255).
  `averageLuminance` is the mean relative luminance in [0, 1], used by the
  2D renderer's additive↔graphic crossfade.

Returning a raw buffer keeps the module fully unit-testable under the
project's plain-`.ts` Vitest setup (no jsdom, no canvas).

### `src/renderer/pourTexture.ts` — canvas cache

- `getPourTexture(seed, paletteId, size)` → `{ canvas, averageLuminance }`.
- Writes the RGBA buffer into an offscreen canvas via `putImageData`.
- Memoized by `(seed, paletteId, size)` following the `glowSpriteCache`
  pattern in `wallRenderer.ts` (keep the last entry; regenerate on key
  change).
- Fixed generation size **768×768** (board is square; the field is smooth, so
  upscaling at draw time is visually lossless). Generation is synchronous,
  one-time per settings change.

## Persistence

Three new optional `ProjectSnapshot` fields (`src/engine/types.ts`), sanitized
in `handleLoad` (`GlowbraidStudio.tsx`) per the existing legacy-tolerance
pattern:

| Field | Type | Absent/invalid → |
|---|---|---|
| `boardArt` | `"none" \| "pour"` | `"none"` (today's flat `boardColor` fill) |
| `boardArtSeed` | `number` | `Math.floor(hash(masterSeed) * 2 ** 31)` |
| `boardArtPalette` | `PourPaletteId` | `"tidal"` |

The pour uses its own seed and `hash` streams only — it never touches the
fibre-generation RNG, so RNG draw order in `fibers.ts` is unaffected.

## UI

In the settings panel section where `boardColor` lives:

- **Board art** selector: None / Pour.
- When Pour is active: pour-palette swatch picker (4 swatches) and a
  **Reroll** button that assigns a new random `boardArtSeed`.
- The board color picker remains and applies when art is None.

State lives in `GlowbraidStudio.tsx` alongside the other project settings and
flows into save/load.

## Renderer wiring

### 2D (`wallRenderer.ts`)

- `RenderState` gains `boardArt`, `boardArtSeed`, `boardArtPalette`.
- Where the board rect is currently filled with `state.boardColor`
  (`wallRenderer.ts` board fill), Pour mode instead `drawImage`s the memoized
  texture stretched to `boardX/boardY/boardSize`.
- The additive↔graphic crossfade currently keyed off
  `lightBoardFactor(boardColor)` uses the texture's `averageLuminance` when
  Pour is active, so fibre glow composites correctly over dark and light
  pours alike.

### 3D (`wall3d.ts`)

- The generated canvas becomes a `THREE.CanvasTexture` assigned as `map` on
  the existing board `MeshStandardMaterial` (material color reset to white so
  the map is not tinted).
- Rebuilt/invalidated whenever `(boardArtSeed, boardArtPalette, boardArt)`
  changes, following the renderer's existing state-change handling. When art
  is None, the material reverts to `boardColor` with no map.

## Testing

Vitest units in `src/renderer/__tests__/pourField.test.ts` (matching the
existing renderer test layout):

- **Determinism:** same `(seed, palette, size)` → byte-identical buffer.
- **Seed sensitivity:** different seeds → different buffers.
- **Validity:** buffer length `w*h*4`, alpha 255 everywhere, RGB in [0, 255].
- **Luminance:** `averageLuminance` in [0, 1]; a dark palette (tidal) yields a
  lower value than a light-dominated render.
- **Noise/Worley helpers:** continuity (nearby samples differ by a small
  bound), Worley F2 ≥ F1 ≥ 0.

## Error handling

Minimal by construction: generation is pure math with no I/O. Loader
fallbacks cover bad/legacy saves; `boardArt: "none"` is always a safe state.

## Performance

- Generation: one 768×768 pass (~0.6 M pixel evaluations), synchronous,
  triggered only on seed/palette/mode change — an acceptable one-off pause,
  cached afterwards.
- Per frame: a single `drawImage` (2D) / static texture (3D). No change to
  the 60fps budget.
