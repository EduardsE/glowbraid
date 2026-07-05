# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Filament Studio — a canvas simulator for a fibre-optic wall: a grid of square frames, each ringed by 24 hidden edge LEDs (two 3-LED strips per edge) injecting light into 12 passive side-glow fibres. Fibres carry no LEDs; light enters from both ends and decays exponentially (`src/engine/light.ts`). Everything is generated deterministically from seeds so a saved project regenerates pixel-for-pixel.

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
- `src/renderer/` — Canvas2D drawing: `wallRenderer.ts` (wall + showcase frame), `mapRenderer.ts` (inspector connection map), `viewport.ts` (layout/zoom/pan math + hit testing).
- `src/components/filament/` — React shell. `FilamentStudio.tsx` owns all state and wires everything; the other files are presentational panels and two hooks (`useAnimationLoop`, `useCanvasInteraction`).

### Determinism is a persistence contract

Saved projects store only seeds + settings (`ProjectSnapshot` in `src/engine/types.ts`, localStorage key `filament.project`) and regenerate geometry on load. Consequences:

- **RNG draw order in `fibers.ts` is load-bearing.** Reordering or adding `rng()` calls silently changes every saved wall. New randomness must come from new derived RNG streams or draw after existing calls.
- New `ProjectSnapshot` fields must tolerate absence: the loader in `FilamentStudio.tsx` (`handleLoad`) sanitizes every field with a fallback for legacy/hand-edited saves. Follow that pattern when adding fields.

### Render loop lives outside React state

`FilamentStudio.tsx` keeps per-frame mutable data in refs (`tRef`, `panRef`, `framesRef`, `sizeRef`…) and redraws imperatively via `useAnimationLoop`; React state (`ui`) only holds things that change UI chrome. Scrub position and time readout are written directly to DOM nodes each tick — don't move animation-frequency data into `useState`.

### Canvas performance

Per-LED `ctx.shadowBlur` was the historical perf killer; `wallRenderer.ts` replaced it with a cached offscreen glow-sprite (`glowSpriteCache`). Do not reintroduce `shadowBlur` (or other per-LED filter effects) in hot draw paths. Accepted budget: 60fps up to 5×5 grid; 6×6 at ~44fps is signed off.

## Docs

- `docs/superpowers/specs/` and `docs/superpowers/plans/` — dated design specs and implementation plans for each feature.
- `docs/reference/filament-studio.dc.html` — visual design reference imported from claude.ai/design; the local copy can go stale, so re-fetch before porting "new" design work from it. The engine intentionally diverges from it in one place: fibre count is fixed at 12/frame (perfect matching), not the design's `fiberDensity` slider.
