# Filament Studio

Filament Studio is a canvas fibre-optic wall simulator. It lays out a grid of frames, each ringed by 24 hidden edge LEDs (6 per edge) that inject light into passive side-glow fibres arcing across the panel — the LEDs are never seen directly; only the light bleeding through the fibres is. Every frame's fibre layout is generated deterministically from a seed, so a saved project regenerates pixel-for-pixel. Switch between **edit** mode (LEDs and strip backings visible for wiring) and **simulate** mode (the finished installation view) and drive the whole wall with animated LED patterns and colour palettes.

## Development

```bash
npm install
npm run dev      # dev server on port 3000
npm run test     # run the Vitest suite (deterministic engine tests)
npm run build    # production build
npm run check    # Biome lint + format check
```

## Architecture

The code is layered **engine → renderer → UI**:

- `src/engine/` — pure, deterministic, React-free simulation: seeded RNG, fibre/LED generation, palettes, and animation. Kept framework-free so the same logic can later drive real hardware output (e.g. ESP32 LED strips).
- `src/renderer/` — Canvas2D drawing that turns engine state into pixels (wall, per-frame, and connection-map renderers plus viewport math).
- `src/components/filament/` — the React shell: panels, transport bar, canvas interaction, and the animation loop.

## Docs

Design spec and implementation plan live under `docs/superpowers/`:

- `docs/superpowers/specs/` — the Filament Studio design spec.
- `docs/superpowers/plans/` — the implementation plan.
