# 3D View Mode — Design

**Date:** 2026-07-05
**Status:** Approved

## Goal

A third studio mode, **3D**, alongside Edit and Simulate, that renders the wall
as a physical installation: board and frame bezels as shaded solids, fibres as
glowing tubes lifted slightly off the board, with orbit/pan/zoom camera
controls. The 3D view consumes the same engine output and the same
animation/palette/light pipeline as the 2D renderer, so a given wall at a given
time `t` shows the same colors in both views.

## Decisions (from brainstorm)

- **Interaction:** view-only. Camera controls only; no frame/fibre picking in
  3D. Selection remains a 2D feature. The inspector panel stays available for
  playback controls (animation, palette, speed, brightness) and retains any
  existing frame selection.
- **Fibre depth:** gentle deterministic z-bulge, render-side only. Engine data
  and 2D view untouched.
- **Environment:** dark studio void — subtle gradient background in the app's
  `#0a0b0e` family, soft ambient + one directional light for form shading on
  board and bezels. No floor or room geometry.
- **Integration:** plain three.js (no react-three-fiber), imperative renderer
  module driven by the existing `useAnimationLoop`, lazy-loaded on first use.
- **No visible LEDs in 3D** — physically hidden inside frames; 3D is a
  sim-look mode. The edit-mode LED view stays 2D-only.

## Dependency

`three` (plus `@types/three` if the installed version doesn't bundle types).
Nothing else. The three.js chunk is loaded via dynamic `import()` only when 3D
mode is first entered — zero bundle cost for 2D-only sessions.

## Architecture

New directory `src/renderer3d/` — a sibling of `src/renderer/`, same layer
(may import `src/engine/`, never React/DOM types beyond the canvas element).

### `wall3d.ts` — entry point

`createWall3D(canvas: HTMLCanvasElement): Wall3D`. Stateful (GPU buffers,
scene graph), with a small imperative surface:

```ts
interface Wall3D {
  render(state: Wall3DState): void; // once per tick, mirrors drawWall's options
  resetCamera(): void;              // Header "Fit"
  dollyIn(): void; dollyOut(): void; // Header zoom buttons
  dispose(): void;
}
```

`Wall3DState` carries the same fields the studio already passes to `drawWall`:
`frames, gridSize, frameSize, frameGap, boardPadding, boardColor, frameColors,
time, anim, speed, brightness, palette`.

`render()` internally detects geometry-invalidating changes — `frames` array
identity plus the layout scalars (`gridSize`, `frameSize`, `frameGap`,
`boardPadding`) — and rebuilds meshes when they change. Reroute, reseed, grid
changes, and fibre-style slider changes all produce a new frames array, so the
identity check catches them. `boardColor`/`frameColors` changes only update
material colors (no rebuild).

### `fiberGeometry.ts` — pure geometry helpers

Maps a `Fiber`'s 38-point 2D path (frame units) into world-space 3D points and
tube vertex layouts. Pure functions over plain arrays — testable in Vitest
without a GPU.

### `fiberColors.ts` — pure per-frame color writer

Fills a `Float32Array` vertex-color buffer from per-segment light values.
Pure, testable headlessly.

### Shared light sampling (targeted refactor)

The per-segment sampling loop currently inlined in `wallRenderer.ts`
(~lines 405–425) is extracted into a pure helper in `src/engine/light.ts`:

```ts
fiberSegmentLights(fiber, startLed, endLed, gpos, time, anim, speed, palette): SegmentLight[]
```

Both renderers consume it, so 2D and 3D can never drift on segment colors.
Behavior-preserving extraction; engine-appropriate (pure simulation, useful
for the future hardware path). Golden samples are pinned in tests before the
refactor.

## Studio wiring (`GlowbraidStudio.tsx`)

- `mode` widens to `"edit" | "sim" | "3d"` in `StudioState` and
  `ProjectSnapshot`.
- A **second `<canvas>`** is mounted for WebGL (a canvas that has vended a 2d
  context cannot switch to webgl). CSS toggles visibility; the 3D canvas stays
  mounted once created to avoid GL context churn. `useCanvasInteraction`
  remains bound to the 2D canvas; `OrbitControls` binds to the 3D canvas.
- On first entry to 3D mode: dynamic `import("@/renderer3d/wall3d")`, create
  the instance, store it in a ref. Until ready, `draw()` skips the 3D branch.
- The existing `draw()` callback branches on mode: `"3d"` →
  `wall3d.render(state)`, else the current 2D path. One render loop, same
  `useAnimationLoop`; per-frame data stays in refs, per the house rule.
- Clicking the 3D canvas does nothing (view-only).

## Scene & geometry

**World units are centimetres**, matching the engine's physical settings.

- **Board:** shallow box (~1.5 cm deep) at z=0, size
  `gridSize·frameSize + (gridSize−1)·frameGap/10 + 2·boardPadding` per side,
  colored `boardColor`, `MeshStandardMaterial`.
- **Bezels:** extruded square rings (~2 cm deep, bezel width proportional to
  the 2D look), one mesh per frame (≤36 draw calls at 6×6) so `frameColors`
  map directly to material colors. `MeshStandardMaterial`.
- **Fibres:** each 38-point path maps into world cm within its frame, then
  gets the z-bulge `z(s) = h · sin(π·s)^1.5` where `s` is normalized
  arclength — zero at both socket stubs, smooth arc between. Bulge height `h`
  ∈ ~[0.5, 2.5] cm, derived deterministically via the engine's pure `hash()`
  from the fibre's LED indices. **No engine RNG streams touched** — this is
  render-side and reproducible; the determinism/persistence contract is
  unaffected.
- **Merged tube geometry:** all fibres in one `BufferGeometry` — 6 radial
  segments, one ring per path point, radius ~0.1 cm × the fibre's `thickness`
  multiplier. ~80k vertices at 5×5; one draw call. Per-fibre vertex ranges are
  recorded at build time for the color writer.

## Fibre material & glow

- `MeshBasicMaterial` with `vertexColors` — fibre light is emissive; scene
  lighting must not affect it.
- Per ring: color = **passive fibre base tint** (milky side-glow strand,
  tinted by `hueBase`, so dark/culled segments read as physical fibre rather
  than vanishing) **plus** animated segment light × user brightness.
- Glow: `EffectComposer` with a **half-resolution `UnrealBloomPass`**,
  threshold tuned above board/bezel luminance so only bright fibre cores
  bloom. Tuning note: a near-white `boardColor` may catch slight bloom —
  acceptable (white walls do glow near light sources); if it reads badly,
  raise the threshold as a function of `lightBoardFactor`.
- Documented fallback if bloom blows the frame budget: drop the bloom pass and
  add a second additive-blended halo tube layer (3D analogue of the 2D
  glow-sprite).

## Per-tick data flow

1. **Rebuild check** (identity + scalar comparison, above).
2. **Color pass** — per fibre, call shared `fiberSegmentLights(...)` with the
   same `time`/palette/brightness pipeline as 2D; write passive-tint + light ×
   brightness into the vertex-color `Float32Array`; flag the attribute for
   upload. ~22k `ledColor` evaluations per frame at 5×5 — the same order the
   2D path already sustains.
3. **Present** — `controls.update()` (damped), `composer.render()`.

Scrub, play/pause, speed, animation and palette changes flow through
`time`/state exactly as in 2D — no separate clock.

## Camera & chrome

- `OrbitControls` (three addons): left-drag orbit, right-drag pan, scroll
  dolly, damping on. Target = board center. Home = mild oblique (slightly
  right and above, distance framing the whole board). Min/max dolly limits;
  full orbit allowed. Camera state is session-only, never persisted.
- Header: 3-way segmented mode control (Edit / Simulate / 3D). Zoom −/+ →
  `dollyOut()/dollyIn()` in 3D; Fit → `resetCamera()`. Zoom-% readout hidden
  (or shows "3D") in 3D mode.
- Hint chips in 3D: `drag · orbit`, `right-drag · pan`, `scroll · dolly`.
  Bottom-right mode chip: `3D · INSTALLATION VIEW`.
- Resize: `wall3d.ts` owns a `ResizeObserver` on its canvas (renderer,
  composer, camera aspect) — studio wiring untouched.

## Persistence

- `ProjectSnapshot.mode`: `"edit" | "sim" | "3d"`. Loader sanitizes per the
  established pattern: any unknown value → `"sim"`. Legacy saves load
  unchanged.
- **No other new snapshot fields.** Camera position, bloom tuning, and bulge
  heights are derived or session-only.

## Error handling

- Dynamic import failure or WebGL2 unavailable → revert mode to `"sim"`, show
  a small non-blocking notice chip ("3D view unavailable"). Never hard-fail.
- `webglcontextlost`/`webglcontextrestored` listeners on the 3D canvas;
  rebuild renderer state on restore.
- `dispose()` releases geometry/materials/renderer on studio unmount.

## Performance

Target: 60fps up to 5×5 (same budget as 2D); 6×6 best-effort (~44fps
acceptable, matching the 2D sign-off). Per-frame costs: CPU light loop (same
order as 2D), one ~1 MB vertex-color upload, 1 fibre draw call + ≤36 bezels +
board + half-res bloom.

Fallback levers, in order:
1. Tube radial segments 6 → 4.
2. Compute colors every other ring, interpolate between.
3. Bloom half-res → quarter-res.
4. Replace bloom with additive halo-tube layer.

## Testing

Vitest, plain `.ts`, no GPU/jsdom. Geometry helpers stay pure (arrays in/out)
so tests never need WebGL.

- `fiberGeometry.test.ts` — z-bulge is 0 at both endpoints; bulge height
  deterministic (same fibre → same value across calls); world mapping places
  socket stubs on the correct frame edges; vertex counts match ring layout.
- `fiberColors.test.ts` — written RGB matches `blendSegment` output for
  hand-built `LedLight` inputs; culled segments get the passive tint, not
  black; brightness multiplier applied.
- `light.test.ts` (extended) — `fiberSegmentLights` matches golden samples
  pinned from the pre-refactor inline loop.
- Existing engine/renderer suites stay green (extraction is
  behavior-preserving).
- Manual verification: side-by-side Simulate vs 3D paused at the same `t` —
  segment colors must visibly match; orbit/pan/zoom feel; toggle in/out of 3D
  repeatedly without context leaks.

## Out of scope (v1)

- Frame/fibre picking, hover highlights in 3D.
- Physical droop/slack simulation.
- Room/gallery environment, floor reflections.
- Persisted camera state.
- Visible LED geometry in 3D.
- The blueprint measurement overlay (`showMeasurements`) — 2D-only; the
  toggle has no effect in 3D mode.
