# Chord-Proportional Control Arms — Design

**Date:** 2026-07-05
**Status:** Approved

## Problem

Fibres connecting two LEDs that sit close together — typically on adjacent
edges near a shared corner — render as knots. The curve leaves one hole,
overshoots far past the other hole, and hooks back on itself. A real
side-glow fibre tube has a minimum bend radius and cannot do this; a
same-corner connection is physically just a shorter tube making a short arc.

Root cause: `generateFrame` in `src/engine/fibers.ts` draws each control arm
(`dA`, `dB`) from a curviness-derived range of roughly 0.3–0.85 frame units,
independent of how far apart the fibre's two LEDs are. The closest legal
pair is only ~0.26 apart, so the arms can be 1.5–3× the chord and the cubic
Bézier self-intersects.

## Fix

Scale both control arms of a fibre by a shared factor proportional to the
fibre's chord, applied to **all** fibres (not just corner pairs):

1. After drawing `dA`/`dB` and computing the stub tips (`stubA`, `stubB`),
   measure `chord` = the distance between the two **stub tips** — the span
   the Bézier actually covers, so deep sockets are handled correctly.
2. Compute one shared scale and apply it to both arms:

   ```
   maxArm = (controlMin + controlRange) * armScale   // largest arm the current style can produce
   scale  = min(1, ARM_CHORD_FACTOR * chord / maxArm)
   dA *= scale
   dB *= scale
   ```

   `ARM_CHORD_FACTOR = 1.0`, a new named exported constant in `fibers.ts`.
3. Everything else — matching, stubs, perpendicular exits, control-point
   direction along the LED normals, `clampAxis` — is unchanged.

### Why k = 1.0 (measured, 2026-07-05)

An empirical sweep (seeds 1–1000 × 18 style combinations ≈ 216k fibres,
strict segment self-intersection test on the sampled paths) found:

| k | self-intersections | default-style fibres reshaped (seeds 1–200) |
|---|---|---|
| 0.5 | 0 | 100% |
| 1.0 | 0 | ~15% |
| 1.3 | 0 | — |
| 1.4 | 19 (first: seed 154, curviness 1, socketDepth 1) | — |

So k = 1.0 — "a control arm never exceeds the fibre's span" — eliminates
every observed knot with a 40% margin to the first failure, while ~85% of
existing default-style fibres stay pixel-identical. k = 0.5 (the original
draft value) would have silently reshaped the entire wall. Corner arcs at
k = 1.0 come out at 1–2× the circular-arc ideal: a slightly fuller arc than
the minimal tube, still physically plausible and clearly knot-free.

### Why this shape of fix

- Fibres where `k·chord ≥ maxArm` get `scale = 1` and are **pixel-identical
  to today** (`x * 1 === x` in IEEE arithmetic) — at the default style that
  is every pair with chord ≥ 0.635, ~85% of fibres. Only pairs short enough
  to physically overshoot are reshaped.
- Both arms shrink by the same proportional factor rather than clamping to
  a ceiling, so short fibres keep their per-fibre random variation instead
  of all collapsing to one identical arc.
- The curviness and socketDepth sliders keep working at every chord length:
  both feed `maxArm`, so the limit adapts to the style.

### Alternatives considered

- **Hard cap per arm** (`dA = min(dA, k·chord)`): simpler to state, but every
  short fibre saturates at the cap and all corner arcs become identical.
- **k = 0.5**: approved in the first draft of this spec, then rejected after
  measurement showed it reshapes 100% of default-style fibres (see table
  above) for no additional knot protection.
- **True bend-radius model** (sample curvature, retry until under a minimum
  radius): most faithful, but adds an iteration loop to a hot deterministic
  path for a visual result the rescale already achieves.
- **Forbid short pairs at matching time**: changes which LEDs connect and
  shrinks matcher freedom; short corner fibres are physically fine — the
  drawing was the problem, not the pairing.

## Determinism and saved projects

- RNG draw count and order are untouched: the rescale is pure arithmetic on
  values already drawn. Pairings, thicknesses, and every downstream draw are
  identical for every seed.
- Fibres whose arms rescale change silhouette, so existing saves regenerate
  with new (correct) shapes for those fibres. Accepted: the old knotted
  shapes are the bug being fixed, and long fibres are unchanged.
- No `ProjectSnapshot` change and no shape-version gate.

## Edge cases

- Degenerate chords cannot occur: the matcher never pairs a LED with itself,
  and the closest possible fallback pairing (same-edge neighbours, 0.085
  apart) still yields a tiny valid arc. No epsilon guard needed.
- The frame-containment argument in the `MARGIN` comment still holds: arms
  only ever get shorter, and the convex-hull bound already covered the
  longer ones.

## Testing

New cases in `src/engine/__tests__/fibers.test.ts`:

1. **No self-intersection**: across seeds 1–200 at style extremes
   (curviness 0/1 × socketDepth 0/1), no fibre's sampled path intersects
   itself (strict segment-pair orientation test on a single path, skipping
   adjacent segments). Pre-fix this fails hard: 1001 self-intersecting
   fibre instances across that sweep, including at the default style for
   seeds 2, 3, 4, 5 — genuine TDD red.
2. **Arms respect the chord limit**: every sampled path point lies within
   `stub + ARM_CHORD_FACTOR · chord` of the chord segment between the two
   stub tips (follows from the Bézier convex-hull property; small numeric
   tolerance). This is what makes knots impossible, so it runs across the
   same seed/style sweep as test 1.
3. All existing determinism, matching, perpendicular-exit, and containment
   tests pass unchanged.

Implementation-time verification (one-off, not a permanent test): before
landing, generate frames for a handful of seeds on `main` and on the branch
and confirm fibres with `k·chord ≥ maxArm` produce identical paths — guards
the "long fibres are pixel-identical" claim.
