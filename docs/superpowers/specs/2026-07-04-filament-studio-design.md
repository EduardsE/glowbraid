# Filament Studio — Fibre Optic Wall Simulator: Design Spec

**Date:** 2026-07-04
**Status:** Approved by user (brainstorming session)
**Design reference:** `docs/reference/filament-studio.dc.html` — the imported Claude Design file. It is the visual and behavioural source of truth: keep its layout, colors, typography, and interactions exactly. Its embedded `DCLogic` class contains working reference implementations of all generation, animation, and rendering math; port that math rather than re-deriving it.

## 1. Purpose

A simulator for a real-world fibre-optic wall decoration. The physical installation is a grid of square frames. Each frame hides exactly 24 RGB LEDs in its border (6 per edge). Passive side-glow fibre optic cables run across the frame interior; each cable connects two LEDs, which inject light into it from both ends. The cables contain no LEDs — they glow only from transported light. The simulator lets the user generate walls, inspect and tune frames, and preview LED-driven animations, and must eventually be able to drive real ESP32 hardware from the same engine.

## 2. Hard requirements

- Keep the existing design (layout, colors, fonts, interactions) from the design reference file.
- Fibers are passive light guides: LEDs inject light at the two endpoints; brightness decays with distance; colors from the two ends blend smoothly (red end + blue end → red→purple→blue). Never render LED dots along a cable.
- Deterministic procedural generation: a given seed always produces the same layout.
- Simulation engine separated from React UI (no simulation logic inside components).
- 60 FPS target up to a 5×5 grid (met: 59–61fps measured in both modes). **Accepted decision (2026-07-04, user sign-off):** 6×6 runs at ~44fps in both modes — smooth, no lag spikes — and is accepted as-is; the original requirements targeted 60fps only up to 5×5, and the 6×6 line was a spec extension. A future optimization pass (segment LOD / per-frame LED color memoization) is optional, not required.
- Animations modify LED colors only; fibers follow automatically.

## 3. Decisions made during brainstorming

| Question | Decision |
|---|---|
| LED placement (design file's grouped strips vs spec's even spacing) | **Two strips of 3 per edge** (design file layout: group centers at 0.27/0.73, offsets ±0.085), with strip backings drawn in edit mode |
| Grid sizes | **1×1 through 6×6** (design file's 2–6 buttons plus a new 1 button, same styling) |
| Testing | **Engine unit tests only** (Vitest); UI verified manually in browser |
| Architecture | **Approach A: pure TS engine + canvas renderer module + thin React shell** |
| Styling | Convert inline styles to Tailwind 4 arbitrary-value utilities preserving exact values; computed/dynamic styles stay inline |
| Persistence | localStorage save/load exactly as in the design file (`filament.project` key); JSON file export/import is future work |
| Animations | The design file's six patterns: Flowing, Rainbow, Pulse, Breathing, Sparkle, Gradient |

## 4. Architecture

Three layers; dependencies point strictly downward. The engine imports nothing from React or the DOM.

```
src/engine/            pure TS, deterministic, no React/DOM
  types.ts             Point, RGB, Led, Fiber, Frame, WallConfig, ProjectSnapshot
  random.ts            seeded PRNG (port the design file's rng()) + stateless hash()
  geometry.ts          cubic Bézier sampling (38 pts), polyline length, proximity/crossing count
  leds.ts              buildLeds(): fixed 24-LED frame layout
  fibers.ts            generateFrame(seed, density): constrained fiber routing
  wall.ts              deriveFrameSeeds(masterSeed, n), generateWall(config)
  palettes.ts          5 palettes + sample(palette, u) piecewise-linear color sampling
  animation.ts         ledColor(led, gpos, time, anim, speed, palette) → { rgb, brightness }
  light.ts             fiberSegmentLight(): two-ended injection with travel delay + exponential decay
src/renderer/          canvas drawing, no React
  viewport.ts          wall layout math, zoom/pan transform, fit, frame hit-test, map fiber hit-test
  wallRenderer.ts      bezel, panel, ambient wash, passive guides, injected light passes, edit-mode LEDs/strips, selection highlights, showcase frame for empty state
  mapRenderer.ts       inspector connection map
src/components/filament/
  FilamentStudio.tsx   top-level state + composition
  Header.tsx           logo, Edit/Simulate toggle, wall stats chip, zoom controls
  LeftPanel.tsx        grid size, frame size, LED info card, fibre density, generate/re-route, save/load
  InspectorPanel.tsx   frame stats, connection map canvas, pattern grid, speed/brightness, palettes; empty-selection state
  TransportBar.tsx     play/pause/stop/loop, time, scrubber, speed presets
  EmptyState.tsx       hero overlay with Create New Wall
  useSimulationLoop.ts rAF clock + hidden-tab interval fallback; writes time/scrub to DOM refs directly
  useCanvasInteraction.ts pointer pan/click-select (4px move threshold), wheel zoom, ResizeObserver
src/routes/index.tsx   renders FilamentStudio full-screen
src/styles.css         Space Grotesk + Space Mono fonts, dark background, scrollbar, range accent-color #9b8cff, fil-float keyframes
```

Engine public API is pure functions. This is the seam for future ESP32 output: the hardware driver would call the same `ledColor` per LED per tick.

## 5. Data model

```ts
type Point = { x: number; y: number };           // normalized 0–1 within frame
type RGB = [number, number, number];

interface Led {
  id: string;              // e.g. "T1".."T6", "R1".."R6", "B...", "L..."
  index: number;           // 0–23 global within frame
  position: Point;
  normal: Point;           // inward edge normal
  side: 'top' | 'right' | 'bottom' | 'left';
  edgeIndex: number;       // 0–5 within edge
  strip: 0 | 1;            // which 3-LED strip segment on the edge
  u: number;               // perimeter position 0–1 (drives animation phase)
}

interface Fiber {
  id: string;
  startLedIndex: number;   // always exactly two endpoint LEDs; no floating fibers
  endLedIndex: number;
  path: Point[];           // 38 samples of a cubic Bézier
  length: number;          // polyline length in frame units
  thickness: number;       // 0.85–1.35
  hueBase: number;         // (startLed.u + endLed.u) / 2
}

interface Frame { seed: number; leds: Led[]; fibers: Fiber[]; crossings: number; }

interface WallConfig { gridSize: number; fiberDensity: number; masterSeed: number; frameSeeds: number[]; }

interface ProjectSnapshot {                       // localStorage "filament.project"
  gridSize: number; frameSize: number; fiberDensity: number; masterSeed: number;
  seeds: number[]; anim: string; speed: number; brightness: number;
  palette: string; mode: 'edit' | 'sim';
}
```

## 6. Procedural generation (port from reference, plus one spec addition)

- **PRNG:** the design file's `rng(seed)` (mulberry32-style) and `hash(n)`. Deterministic: same seed → same wall.
- **Frame seeds:** `((masterSeed * 2654435761 + i * 40503) >>> 0) % 100000` per frame index. Per-frame reseed replaces one entry only.
- **LED layout:** 4 edges × 6 LEDs; per edge two groups of 3 at group centers 0.27 and 0.73 with within-group offsets −0.085/0/+0.085; each LED carries its inward normal and perimeter coordinate `u = (edgeIdx + t) / 4`.
- **Fiber routing per fiber:** pick endpoint LED A uniformly; re-pick B (≤14 tries) while B is on the same edge as A or endpoint distance < 0.42. Control points `P1 = A + normalA·dA`, `P2 = B + normalB·dB` with `d ∈ [0.34, 0.76)`. Sample the cubic Bézier at 38 points; compute polyline length; thickness `0.85 + rnd()·0.5`.
- **Spec addition — no duplicate connections:** reject a candidate (A,B) pair (unordered) already used in this frame, within the same retry budget; if the budget is exhausted, accept the last candidate rather than loop forever (keeps determinism and total count = density).
- **Crossings count:** pairwise proximity test on coarse samples (step 4, threshold 0.028), as in the reference.
- Density comes from the existing slider: 8–24, default 16.

## 7. Light simulation & animation (port exactly)

- **Constants:** `TRAVEL = 1.15` (seconds of color delay per unit fibre length), `DECAY = 1.95` (exponential falloff), loop `duration = 12` s.
- **Per fiber segment midpoint `um`:** sample each end LED's animated color at delayed time `t − um·len·TRAVEL` (and `t − (1−um)·len·TRAVEL` for the far end); intensities `iA = brightnessA·exp(−um·DECAY)`, `iB = brightnessB·exp(−(1−um)·DECAY)`; blend colors weighted by intensity; skip segments with total < 0.05.
- **Animations** (`ledColor`): flow, rainbow, pulse, breathe, sparkle, gradient — exact formulas from the reference, driven by `u`, wall-position `gpos`, time, and speed. Palettes: Sunset, Neon, Aurora, Ember, Spectrum with the reference's RGB stops; piecewise-linear wrap-around sampling.
- User controls: animation speed 0.1–3 (slider) with presets 0.5/1/1.5/2, LED brightness 0.2–1, palette selection. Global `glow` multiplier fixed at 1 (the design prop's default).

## 8. Rendering (port exactly)

- Canvas 2D, DPR capped at 1.75 (main canvas) / 2 (map canvas). `lighter` composite for all light; round caps.
- Per frame: dark bezel (`#181a20` edit / `#141519` sim), clipped panel `#07080b`, animated ambient radial wash, then per fiber: faint tinted passive guide (two strokes: palette-tinted 0.07 alpha, neutral 0.05 alpha), then per-segment injected light (wide soft glow stroke at `intensity·0.16` alpha + narrow bright core at full intensity with +70 RGB lift).
- Edit mode additionally draws: 3-LED strip backings (line between strip's first and last LED, inset 0.03 toward frame interior), LED dots (dark socket + glowing colored core with shadowBlur), white endpoint rings for the selected fiber, dashed white highlight over the selected fiber.
- Selected frame: violet border `rgba(155,140,255,0.9)` with glow; otherwise faint white border.
- Empty state renders a single centered showcase frame (seed 2024, density 18, sim mode) behind the hero overlay.
- Wall layout: gap = frameSize·0.09; wall fits 82% of canvas at zoom 1, centered plus pan offset.
- Connection map: frame outline, all fibers tinted by hueBase (selected fiber white/thicker), LED dots (endpoints of selected fiber enlarged white). Click picks nearest fiber within 0.05 normalized distance.
- Time/scrubber/clock DOM updates happen imperatively via refs inside the tick (no React re-render per frame). React re-renders only on control interaction.

## 9. UI behaviour

All interactions exactly as the reference implements them:

- **Modes:** Edit (LEDs visible) / Simulate (installation view); mode tag bottom-right of canvas.
- **Canvas:** wheel zoom ×1.12/÷1.12 clamped 0.3–4; drag pan (4px threshold distinguishes click); click selects frame, click empty space deselects; zoom buttons ×1.15; Fit resets pan and zoom to 1. Zoom % chip shows current zoom.
- **Left panel:** grid buttons **1–6** (design file styling; changing grid clears selection and regenerates seeds); frame size slider 150–340 px (layout only, no regeneration); density slider 8–24 (regenerates fibers, keeps seeds); "Re-route fibres" (new master seed, regenerate); "Generate new wall" (new master seed, clears selection, exits the empty state if active); Save/Load via localStorage with the hint text switching to "Saved to this browser ✓".
- **Inspector:** appears when a frame is selected; stats (fiber count, 24 LEDs, crossings, avg length ×100), per-frame reseed button, connection map with fiber inspect line ("Fibre N: LED T3 → LED B5 (fed from both ends)"), pattern grid, sliders, palettes. Placeholder panel when nothing selected.
- **Transport:** play/pause (icon and style swap), stop (t=0, pause), loop toggle, scrubber (drives t directly; auto-updates while playing unless focused), time display `m:ss / m:ss`, speed presets.
- **Empty state:** shown on first load; "Create New Wall" generates with a fresh random master seed.
- **Wall label:** `N × N · N² frames · N²·24 LEDs`.

## 10. State management

React `useState` in `FilamentStudio` for control state (mode, gridSize, frameSize, fiberDensity, masterSeed, selection, playing, anim, speed, brightness, palette, loop, zoom, empty, savedFlag). Mutable refs for per-tick values that must not re-render React: clock `t`, pan, generated `Frame[]`, frame seeds, canvas size/DPR. Frames regenerate only when gridSize/density/seeds change. No state library.

## 11. Testing (Vitest, engine only)

- `random.test.ts` — same seed → identical sequence; different seeds differ.
- `leds.test.ts` — 24 LEDs; 6 per side; two strips of 3 per side; positions on the border; normals point inward; `u` strictly increasing around the perimeter.
- `fibers.test.ts` — fiber count = density; determinism (same seed+density → deep-equal output); endpoints on different edges (when retry budget permits); endpoint distance ≥ 0.42 (same caveat); no duplicate unordered LED pairs; every fiber references two valid LEDs (no floating fibers); path has 38 points starting/ending at the endpoint LEDs.
- `wall.test.ts` — frame-seed derivation matches formula; reseeding one frame changes only that frame.
- `palettes.test.ts` — sampling at stop positions returns the stops; u wraps.
- `light.test.ts` — midpoint of a red↔blue fiber blends toward purple (r>0, b>0, r≈b); intensity at an endpoint exceeds midpoint; single-lit-end fiber fades monotonically toward the dark end; segments below 0.05 total report as skippable.

Run with `npm run test`. UI/canvas verified manually in the browser at the end (grid sizes, both modes, all animations/palettes, save/load, transport, zoom/pan/selection).

## 12. Out of scope (future, architecture leaves seams)

Custom fibre drawing, dragging LED positions, >2 LEDs per fibre, JSON project export/import, keyframe timeline, ESP32 live preview, DMX, animation layers, per-fibre attenuation/material properties. The footer's "SOON" text stays as designed.
