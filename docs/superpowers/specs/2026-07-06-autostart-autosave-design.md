# Autostart + Autosave

## Problem

The studio currently opens on an `EmptyState` overlay: a gate that requires
picking a preset or clicking "Start from a blank random wall" before any wall
is visible or usable. Saving is manual (a "Save" button writing to a single
`localStorage` slot) and there's a matching "Load" button to explicitly pull
that slot back in. This adds friction: every visit starts with an extra click,
and forgetting to hit Save loses work on reload.

## Goal

- On load, skip straight to a real, usable wall — no gate screen.
  - If a project was previously saved, restore it.
  - Otherwise, show a fixed default 3×3 wall.
- Persist changes automatically in the background. No Save/Load buttons.

## Design

### 1. Startup: always a wall, no gate

`GlowbraidStudio`'s initial state is computed once, synchronously, before
first paint, via a one-time lazy-init guarded by a ref (the same pattern used
for `useState(() => ...)`, applied across the `ui` state and the geometry
refs together since they must agree on the same wall):

```
const initialRef = useRef<{ state: StudioState; seeds: number[]; frames: Frame[] } | null>(null);
if (initialRef.current === null) {
  initialRef.current = buildInitialProject();
}
```

`buildInitialProject()`:
1. Calls `loadProject()`.
2. If it returns a snapshot, sanitize every field using the same logic
   `handleLoad` uses today (palette/anim fallback, `cmField`/`styleAxis`
   clamping, etc.) and derive seeds/frames from it via `deriveFrameSeeds` /
   `generateWall`.
3. If it returns `null` (nothing saved yet), use a fixed default: 3×3 grid,
   `masterSeed: 7431`, `sunset` palette, `flow` animation — i.e. today's
   `INITIAL_STATE` values, minus `empty`. Seeds/frames are derived the same
   way.

`framesRef` and `seedsRef` are initialized directly from this result, so the
very first `draw()` call already has real geometry — no empty first frame.

### 2. Remove the empty-state concept

Delete `EmptyState.tsx`. Remove the `empty` and `saved` fields from
`StudioState`, and every branch that exists only to serve the gated state:

- The `showcaseRef` "draw a lone demo frame" path in `draw()`.
- The `if (s.empty) return;` guard in `onClickAt`.
- `mode3dActive`'s `&& !ui.empty` clause.
- `handlePreset` and the `EmptyStatePreset` type/import (the 4 presets —
  Aurora Loft, Neon Booth, Sunset Hall, Ember Nook — are dropped entirely,
  not relocated; `handleGenerate`'s "Generate new wall" button and the
  palette/animation pickers already cover exploring looks).

`handleGenerate` and `handleReroute` are otherwise unchanged — they already
just re-roll geometry via `rebuild`. They stop setting `empty: false` since
that field no longer exists.

### 3. Autosave

Add `geometryVersion: number` to `StudioState` (starts at whatever
`buildInitialProject()` used, e.g. `0`). It is incremented via `patch(...)`
anywhere geometry is mutated through the refs without an accompanying
`ui` field change — today that's only `handleReseed` (single-frame reseed
mutates `seedsRef`/`framesRef` directly). `handleGridSize`, `handleReroute`,
`handleGenerate`, and load-on-startup all already change `masterSeed` and/or
`gridSize`, so they don't need it.

A single effect (debounced ~400ms) watches the full persisted slice of `ui`:

```
gridSize, frameSize, frameGap, boardPadding, boardColor, frameColors,
showMeasurements, masterSeed, geometryVersion, anim, speed, brightness,
palette, curviness, randomness, socketDepth, mode
```

On change, after the debounce window, it builds the same snapshot shape
`handleSave` builds today (reading `seedsRef.current` for the `seeds` field)
and calls `saveProject(...)`. This is the only place `saveProject` is called
— no per-handler save calls to keep in sync. No visible confirmation of a
successful save (silent autosave, per user preference).

`handleSave`/`handleLoad` (the manual handlers) are deleted; `storage.ts`
(`saveProject`/`loadProject`) is unchanged and reused by both the startup
loader and the autosave effect.

### 4. UI cleanup

- `LeftPanel`: remove the `PROJECT` section (Save/Load buttons + hint text)
  and the `onSave`/`onLoad`/`saveHint` props.
- `GlowbraidStudio`: stop threading `onSave`/`onLoad`/`saveHint` through to
  `LeftPanel`.

## Out of scope

- Any visible "saved" indicator (explicitly declined).
- Multiple save slots / named projects — still a single `localStorage` key.
- Relocating the dropped presets anywhere else in the UI.

## Testing

- Existing Vitest suite should be unaffected (no engine changes).
- Manual verification: fresh `localStorage` → app opens on the fixed 3×3
  default; make a change → reload → change persisted; use "Generate new
  wall" / "Re-route fibres" / single-frame reseed → reload → each persists.
