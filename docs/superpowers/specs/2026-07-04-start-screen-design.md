# Start Screen (Empty-State Preset Card) — Design

Date: 2026-07-04
Status: Draft

## Problem

The current `EmptyState` (`src/components/filament/EmptyState.tsx`) is a
placeholder built before the real start-screen design existed: a plain
heading + subhead + single "Create New Wall" button over a small ambient
showcase frame. The actual design — reworked in the source claude.ai/design
project (`d63fec80-d4a7-4452-92bb-def1b150ad9d` → `Filament Studio.dc.html`,
re-synced into `docs/reference/filament-studio.dc.html` as part of this
spec) — is a glass card offering four one-click configured presets plus a
blank-random-wall fallback, over a larger, dimmer ambient backdrop. Port it
1:1.

## Source of truth

`docs/reference/filament-studio.dc.html`:
- Template: the `<sc-if value="{{ empty }}">` block inside the canvas
  `<section>`.
- Logic: `drawShowcase(ctx)`, the `vgrad()` helper / `presetDefs` /
  `startPresets` block inside `renderVals()`, and `onStart`.

## Decision: presets drop the `density` field

The source `presetDefs` include a `density` (8–24) mapped to a
`fiberDensity` slider. This app's engine (`src/engine/fibers.ts`) replaced
that entirely with a fixed 12-fiber perfect-matching layout — there is no
fiber-count knob to wire it to (spec
`2026-07-04-fiber-perfect-matching-design.md`). Ported presets carry only
`{ gridSize, palette, anim }`. This has no visible effect: none of the four
preset sub-labels ("3×3 · Flowing", "2×2 · Rainbow", "4×4 · Gradient", "2×2 ·
Breathing") reference density.

## 1. `EmptyState.tsx` — full rewrite

Replaces the current centered-column layout with the glass card, using
Tailwind arbitrary values to match the source inline styles exactly (colors,
radii, spacing, hover states). Structure:

- Outer overlay: `absolute inset-0`, centered flex, `padding: 28px`,
  `background: radial-gradient(70% 70% at 50% 45%, rgba(10,11,14,0.05),
  rgba(10,11,14,0.62))`, `z-index: 5`.
- Card: `width: min(548px, 94%)`, `flex flex-col gap-4`,
  `padding: 24px 26px 22px`, `border: 1px solid rgba(255,255,255,0.09)`,
  `border-radius: 20px`, `background: rgba(11,12,16,0.74)`,
  `backdrop-filter: blur(18px)`, `box-shadow: 0 30px 80px rgba(0,0,0,0.55)`.
- Header block (`gap: 9px`):
  - Badge: "NEW PROJECT", mono, 10px, `letter-spacing: .16em`,
    `color: #c1b6ff`, pill border `1px solid rgba(155,140,255,0.35)`,
    `padding: 5px 11px`, `border-radius: 999px`, `align-self: flex-start`.
  - Heading: "Design light that flows." — 25px / 600 / `-0.01em` /
    `line-height: 1.12`.
  - Subhead (12.5px, `rgba(233,234,240,0.55)`, `line-height: 1.55`,
    `max-width: 440px`): "Hidden LEDs around each frame inject colour into
    passive side-glow fibres. Pick a starting point below — you can reshape
    the wall anytime."
- Preset grid: `grid grid-cols-2 gap-[10px]`. Four preset buttons, each:
  `flex items-stretch gap-[11px]`, `min-height: 56px`,
  `padding: 11px 12px`, border `1px solid rgba(255,255,255,0.08)`,
  `background: rgba(255,255,255,0.02)`, `border-radius: 13px`; hover →
  `border-color: rgba(155,140,255,0.5)`, `background: rgba(155,140,255,0.08)`.
  - Left bar: `width: 6px`, full height, `border-radius: 6px`,
    `background:` a vertical gradient of the preset's palette stops (see
    `vgrad()` below), `box-shadow: 0 0 14px rgba(155,140,255,0.25)`.
  - Right column: name (13px / 600 / white) over sub-label (10.5px, mono,
    `rgba(233,234,240,0.45)`, `letter-spacing: .02em`).
- Dashed button (full width, below the grid): `height: 40px`,
  `border: 1px dashed rgba(255,255,255,0.16)`, transparent background,
  `color: rgba(233,234,240,0.72)`, `border-radius: 11px`; hover →
  `background: rgba(255,255,255,0.04)`, `color: #fff`. Label:
  "✦ Start from a blank random wall".

### Preset data (`vgrad` + `presetDefs` port)

```ts
const PRESET_DEFS: Array<{
  name: string;
  sub: string;
  gridSize: number;
  palette: PaletteId;
  anim: AnimationId;
}> = [
  { name: "Aurora Loft", gridSize: 3, palette: "aurora", anim: "flow",     sub: "3×3 · Flowing" },
  { name: "Neon Booth",  gridSize: 2, palette: "neon",   anim: "rainbow", sub: "2×2 · Rainbow" },
  { name: "Sunset Hall", gridSize: 4, palette: "sunset", anim: "gradient",sub: "4×4 · Gradient" },
  { name: "Ember Nook",  gridSize: 2, palette: "ember",  anim: "breathe", sub: "2×2 · Breathing" },
];
```

`vgrad(paletteId)` ports directly: build a CSS
`linear-gradient(180deg, rgb(r,g,b) p%, ...)` string from
`PALETTES[paletteId].stops`, same percentage spacing as the source
(`i / (stops.length - 1) * 100`). Used only for the preset bar background —
a local helper in `EmptyState.tsx`, not a new engine export.

### Props

```ts
interface EmptyStateProps {
  onPreset: (preset: { gridSize: number; palette: PaletteId; anim: AnimationId }) => void;
  onStart: () => void; // blank random wall — unchanged prop, new visual position
}
```

## 2. `FilamentStudio.tsx` — one new handler

`handlePreset`, sibling to `handleGenerate`/`handleGridSize`, mirrors the
source preset `onClick`:

```ts
const handlePreset = (preset: { gridSize: number; palette: PaletteId; anim: AnimationId }) => {
  const seed = randomSeed();
  rebuild(preset.gridSize, seed, styleOf(ui));
  patch({
    gridSize: preset.gridSize,
    palette: preset.palette,
    anim: preset.anim,
    masterSeed: seed,
    empty: false,
    selectedFrame: null,
    selectedFiber: null,
  });
};
```

Passed to `<EmptyState onPreset={handlePreset} onStart={handleGenerate} />`.
`handleGenerate` is unchanged and already matches the source's `onStart`
(reseed + `empty: false`, keeping the current grid/palette/anim) — it just
moves from being the sole CTA to the dashed fallback button.

## 3. Ambient showcase backdrop

`drawShowcaseFrame` (`src/renderer/wallRenderer.ts`) ports `drawShowcase`:

- Size: `Math.min(width, height) * 0.72` (was `0.44`).
- Position: `x = width/2 - sz/2`, `y = height/2 - sz/2` (drop the current
  `- 10` y-offset).
- Wrap the `drawFrame` call in `ctx.save(); ctx.globalAlpha = 0.85; …
  ctx.restore();`.

`FilamentStudio.tsx`: showcase seed `2024 → 51840`
(`showcaseRef.current = generateFrame(51840, styleOf(s))`), matching the
source's `genFrame(51840, 12)` (density argument dropped per the decision
above — the current engine signature is `(seed, style)`).

## 4. Cleanup

`src/styles.css`: remove the `fil-float` `@keyframes` rule — its only
consumer was the current `EmptyState`, and the new card design has no
floating animation. Confirmed no other references
(`grep -rn "fil-float" src`).

## Testing / verification

No engine logic changes — this is rendering plus one new state-setting
handler that mirrors existing ones. No new unit tests needed beyond
type-checking (`PRESET_DEFS` against `PaletteId`/`AnimationId`). Verify by
running the dev server and driving the UI:

- Empty state shows the glass card with badge, heading, 2×2 preset grid,
  dashed button, over the larger/dimmer ambient frame.
- Each of the 4 presets: click → enters editor with that preset's grid size,
  palette, and animation, fresh random seed, no frame/fiber selected.
- Dashed button: click → enters editor keeping the current (default)
  3×3/sunset/flow config, fresh seed — same as today's single button.
- Hover states on preset cards and the dashed button match the source
  (border/background transitions).

## Out of scope

Engine (`fibers.ts`, `palettes.ts`, `animation.ts`), other panels (Header,
LeftPanel, InspectorPanel, TransportBar), persistence (`storage.ts`), and
the non-empty wall rendering path are untouched.
