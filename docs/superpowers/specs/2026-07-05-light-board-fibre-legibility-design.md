# Light-board fibre legibility ("legibility floor") design

## Context

Fibre light is drawn with `globalCompositeOperation = "lighter"` (`src/renderer/wallRenderer.ts`, fibre segment loop). Additive blending cannot brighten a near-white backdrop, so on light board colours the entire light show washes out to ghosts — the wall only "works" on dark boards.

Three strategies were compared visually (brainstorm session, live canvas demo): pure additive (status quo), a physical-daylight look (multiply "dye" + contact shadows), and a graphic-legible look (opaque saturated strokes). The graphic-legible direction won, and of its four flavours the **legibility floor** variant was selected: dim stretches of fibre never fade below a pale tint, so the whole fibre path stays visible on light boards and the animation reads as brightness travelling along an always-visible strand — incidentally closest to how a real side-glow fibre looks in a lit room. Approved tuning defaults: saturation boost 0.8, stroke-weight multiplier 1.0 (i.e. existing widths).

The rendering adapts **continuously** with board luminance: dark boards keep today's additive glow pixel-for-pixel feel, light boards get the graphic pass, mid tones crossfade.

## Requirements

- On a white board, every fibre's full path is clearly visible and the light animation reads with roughly the same legibility as on the default dark board.
- On the default dark board (`#101114`), rendering is visually unchanged (crossfade factor 0 → graphic pass off, additive pass at full strength).
- The transition between the two regimes is a continuous function of board luminance — no pop when dragging the board colour picker.
- Fibre-panel backdrop is always `boardColor` (frame colour only affects the bezel), so a single per-wall factor derived from `boardColor` is correct for every frame.
- Deterministic: no engine changes, no new RNG draws, no `ProjectSnapshot` changes.
- Performance: 5×5 grid on a white board holds 60fps (same budget as dark). No `shadowBlur`, no per-pixel offscreen compositing.

## Non-goals

- Engine (`src/engine/`) changes of any kind — this is a screen-compositing concern; the engine also feeds future ESP32 hardware, which has no background-colour problem.
- Edit-mode LED dot/halo adaptation (explicitly descoped; dark LED cores keep them visible).
- Inspector map (`mapRenderer.ts`) — stays dark-themed.
- Physical daylight look (multiply dye, contact shadows) and offscreen tone mapping — rejected in brainstorm.
- User-facing controls for the new constants; they are code constants, tuned once.

## New module: `src/renderer/lightMapping.ts`

Pure, DOM-free helpers so Vitest covers them (`src/renderer/__tests__/lightMapping.test.ts`).

```ts
/** Crossfade begins at this relative luminance… */
export const CROSSFADE_START = 0.22;
/** …and completes CROSSFADE_RANGE above it. */
export const CROSSFADE_RANGE = 0.4;
/** How much of the additive pass is faded out at full light-board factor. */
export const ADDITIVE_FADE = 0.85;
/** Minimum displayed intensity on light boards (the "floor"). */
export const INTENSITY_FLOOR = 0.22;
/** Saturation push applied to graphic-pass colours (approved default). */
export const SATURATION_BOOST = 0.8;

/** Rec.709-weighted luminance of a #rrggbb colour, 0–1 (no gamma linearization — matches the approved demo). */
export function relativeLuminance(hex: string): number;

/** 0 on dark boards → 1 on light boards: clamp((L − CROSSFADE_START) / CROSSFADE_RANGE, 0, 1). */
export function lightBoardFactor(hex: string): number;

/** Push channels away from their mean by `amount`, clamped 0–255. */
export function boostSaturation(color: RGB, amount: number): RGB;

/** Remap displayed intensity so it never drops below the floor: INTENSITY_FLOOR + (1 − INTENSITY_FLOOR) · min(1, i). */
export function floorIntensity(i: number): number;
```

`relativeLuminance` must tolerate the 3-digit hex the colour inputs can't produce today but hand-edited saves could (`#fff`); anything unparsable → treat as 0 (dark), which fails safe to current behaviour.

## Renderer changes (`src/renderer/wallRenderer.ts`)

`drawWall` computes `const lightFactor = lightBoardFactor(state.boardColor)` once and passes it to every `drawFrame` via a new `FrameDrawOptions.lightFactor: number`. `drawShowcaseFrame` passes `lightBoardFactor(DEFAULT_BOARD_COLOR)` (≈0, unchanged look).

Inside `drawFrame`, with `f = lightFactor`:

1. **Ambient radial wash**: centre alpha `0.14` → `0.14 · (1 − f)` (the dark-room ambience makes no sense in a "lit room").
2. **Passive body strokes**: palette-tinted body alpha `0.07` → `0.07 + 0.10·f`; grey inner stroke alpha `0.05` → `0.05 + 0.10·f`. Widths unchanged.
3. **Additive pass** (existing `lighter` loop): both strokes' alphas scale by `(1 − ADDITIVE_FADE·f)`. Skip the whole pass when the scale is ≤ 0.02.
4. **Graphic pass** (new, `source-over`, only when `f > 0.01`), per segment:
   - Displayed intensity `i = seg.intensity · brightness` (same product the additive pass uses), remapped `i′ = floorIntensity(i)`. Segments the engine culls (`seg.visible === false`) still draw, with `i = 0` → `i′ = INTENSITY_FLOOR` and colour `samplePalette(palette, fiber.hueBase)` (the fibre's body hue) instead of the blend colour.
   - `sat = boostSaturation(colour, SATURATION_BOOST)`.
   - Wide soft stroke: colour `sat`, alpha `0.45 · i′ · f`, width `fiber.thickness · sz · 0.05`, butt caps (same bead-avoidance reasoning as the additive pass).
   - Core stroke: colour `sat · 0.82` per channel, alpha `min(1, i′) · f`, width `fiber.thickness · sz · 0.016`.

Everything else in `drawFrame` (bezel, panel border, selection highlight, edit-mode LEDs) is untouched.

## Performance

Stroke count per segment: 2 today; up to 4 during the mid-luminance crossfade (both passes active); ~2–3 at full white (additive at 15% strength — still drawn). The floor also un-culls previously skipped dim segments on light boards. No `shadowBlur`, no gradients per segment, no offscreen work.

Acceptance: 5×5 grid, white board, sim mode ≥ 60fps on the reference machine (same methodology as the glow-sprite sign-off). Fallback if it misses: raise `ADDITIVE_FADE` to 1.0 with a steeper ramp so the additive pass is fully skipped at high `f` (visually negligible at that point), restoring ~2 strokes/segment on white.

## Testing

- Unit (Vitest, plain `.ts`): `relativeLuminance` endpoints (`#000000` → 0, `#ffffff` → 1, `#101114` ≈ 0.066, 3-digit and garbage inputs); `lightBoardFactor` clamping at both ends and mid-ramp value; `floorIntensity` (0 → floor, 1 → 1, monotonic; continuity: remapped intensity at the engine cull threshold `MIN_SEGMENT_INTENSITY` differs from the floor by < 0.04, so culled vs. near-culled segments don't visibly jump); `boostSaturation` clamps to 0–255 and is identity at amount 0.
- Manual visual: dark / mid-grey / white board sweep in edit and sim modes; confirm dark board is pixel-identical to before (factor 0 short-circuits both new passes and all alpha changes).
