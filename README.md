# Fiber Optic LED Grid Generator

A browser-based simulator for a fibre-optic wall: a grid of square frames, each ringed by 24 hidden edge LEDs (6 per edge) that inject light into passive side-glow fibres arcing across the panel. The LEDs themselves are never seen — only the light bleeding through the fibres is. Every frame's fibre layout is generated deterministically from a seed, so a saved project regenerates pixel-for-pixel. Switch between **edit** mode (LEDs and strip backings visible for wiring) and **simulate** mode (the finished installation view), and drive the whole wall with animated LED patterns and colour palettes.

This project is a digital companion to a real physical build: [Fiber Optic and LEDs: A Wall Decoration](https://www.instructables.com/Fiber-Optic-and-LEDs-a-Wall-Decoration/) by the original author on Instructables. It lets you design and preview a wall of this kind — grid size, fibre routing, colours, animations — entirely virtually before cutting a single fibre or wiring a single LED in the real world.

## Video showcase

_Coming soon._

## Development

```bash
pnpm install
pnpm dev      # dev server on port 3000
pnpm test     # run the Vitest suite (deterministic engine tests)
pnpm build    # production build
pnpm check    # Biome lint + format check
```

## Architecture

The code is layered **engine → renderer → UI**:

- `src/engine/` — pure, deterministic, React/DOM-free simulation: seeded RNG, LED layout, fibre generation (perfect matching of 24 LEDs into 12 fibres per frame), wall/seed derivation, light propagation, animations and palettes. Kept framework-free so the same logic can later drive real hardware output (e.g. ESP32 LED strips).
- `src/renderer/` — Canvas2D drawing that turns engine state into pixels: the wall and showcase frame, the inspector connection map, and viewport (layout/zoom/pan/hit-testing) math.
- `src/components/filament/` — the React shell: `FilamentStudio.tsx` owns all state; panels, transport bar, canvas interaction, and the animation loop live alongside it.

Saved projects (`localStorage`, key `filament.project`) store only seeds and settings — geometry is regenerated deterministically on load, not persisted directly.
