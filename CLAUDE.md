# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Glowbraid — a canvas simulator for a fibre-optic wall: a grid of square frames, each ringed by 24 hidden edge LEDs (two 3-LED strips per edge) injecting light into 12 passive side-glow fibres. Fibres carry no LEDs; light enters from both ends and decays exponentially (`src/engine/light.ts`). Everything is generated deterministically from seeds so a saved project regenerates pixel-for-pixel.

## Commands

```bash
npm run dev        # Vite dev server on port 3000 (TanStack Start)
npm run test       # Vitest suite (engine + viewport unit tests)
npx vitest run src/engine/__tests__/fibers.test.ts   # single test file
npm run check      # Biome lint + format check (also: format, lint)
npm run build      # production build
npm run generate-routes  # tsr generate (TanStack Router route tree)
```

Vitest only picks up `src/**/*.test.ts` (see `vitest.config.ts`) — plain `.ts`, no `.tsx`/jsdom component tests today.

Add shadcn components with `pnpm dlx shadcn@latest add <component>` (aliases in `components.json`).

Path aliases: both `#/*` and `@/*` resolve to `./src/*`; existing code uses `@/`.

## Architecture

Strictly layered **engine → renderer → UI**; imports only point left.

- `src/engine/` — pure, deterministic, React/DOM-free simulation: seeded RNG (`random.ts`), LED layout (`leds.ts`), fibre generation via perfect matching of the 24 LEDs into 12 fibres (`fibers.ts`), wall/seed derivation (`wall.ts`), light propagation (`light.ts`), animations and palettes. Kept framework-free on purpose — the same logic is meant to later drive real ESP32 LED hardware. Don't import React or DOM types here.
- `src/renderer/` — shared rendering support, no 2D canvas drawing (the app is 3D-only): `mapRenderer.ts` (inspector connection map), `viewport.ts` (`frameGradientPos`, the diagonal gradient position used by 3D fibre coloring), `pourField.ts`/`pourTexture.ts` (procedural board-art generation), `wallDefaults.ts` (board-color default + bezel shading, shared with the 3D renderer), `wallLayout.ts` (world-space layout math in cm, deliberately three-free so the React shell can read sizes without pulling three.js out of the lazy 3D chunk; `fiberGeometry.ts` re-exports it), `dimensions.ts` (where each schedule dimension is drawn on the wall, pure and tested).
- `src/renderer3d/` — three.js 3D installation view, the only view: `wall3d.ts` (stateful scene renderer, lazy-loaded on first mount), `fiberGeometry.ts`/`fiberColors.ts` (pure, GPU-free helpers with Vitest coverage). Consumes the same engine output and the `fiberSegmentLights` light pipeline. Frame picking via invisible per-frame pick-planes (`frameSquarePlane` + a Raycaster in `wall3d.ts`) drives `selectedFrame`; camera state is session-only. `Wall3D.project()` maps world cm to canvas CSS pixels for the dimension overlay.
- `src/components/glowbraid/` — React shell, laid out as a shop drawing (see `DESIGN.md`). `GlowbraidStudio.tsx` owns all state and wires everything; the other files are presentational: `SchedulePanel` (board, frames, fibres), `SpecsPanel` (light + selected-frame detail), `TitleBlock`, `TransportBar`, `DimensionOverlay` (SVG dimension lines over the 3D view), shared `controls.tsx`, and one hook (`useAnimationLoop`).

### Determinism is a persistence contract

Saved projects store only seeds + settings (`ProjectSnapshot` in `src/engine/types.ts`, localStorage key `glowbraid.project`) and regenerate geometry on load. Consequences:

- **RNG draw order in `fibers.ts` is load-bearing.** Reordering or adding `rng()` calls silently changes every saved wall. New randomness must come from new derived RNG streams or draw after existing calls.
- New `ProjectSnapshot` fields must tolerate absence: the loader in `GlowbraidStudio.tsx` (`handleLoad`) sanitizes every field with a fallback for legacy/hand-edited saves. Follow that pattern when adding fields.

### Render loop lives outside React state

`GlowbraidStudio.tsx` keeps per-frame mutable data in refs (`tRef`, `framesRef`, `seedsRef`…) and redraws imperatively via `useAnimationLoop`; React state (`ui`) only holds things that change UI chrome. Scrub position, time readout, and the dimension overlay's line positions are written directly to DOM nodes each tick — don't move animation-frequency data into `useState`.

Canvas and WebGL can't read CSS variables, so `mapRenderer.ts` (ink, redline) and `wall3d.ts` (`SELECT_COLOR`) mirror the tokens in `src/styles.css`; change them together.

## Docs

- `docs/reference/glowbraid-studio.dc.html` — visual design reference imported from claude.ai/design; the local copy can go stale, so re-fetch before porting "new" design work from it. The engine intentionally diverges from it in one place: fibre count is fixed at 12/frame (perfect matching), not the design's `fiberDensity` slider.
