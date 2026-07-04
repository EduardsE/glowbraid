# Fiber Style Sliders (Curviness + Randomness) — Design

Date: 2026-07-04
Status: Approved (pending implementation)
Extends: `2026-07-04-fiber-perfect-matching-design.md`. The perfect-matching
invariants (12 fibers, every LED used exactly once, different-edge endpoints,
no straight fibers) remain in force at every slider setting.

## Problem

1. **No artistic control.** Fiber shape and routing chaos are hard-coded;
   the only lever is re-rolling the seed.
2. **Sharp bends.** The two control-point bows (`sA`, `sB`) draw signs
   independently. Large opposing signs produce aggressive S-curves with
   visually harsh kinks.
3. **Fibers exit the frame.** Control points are offset by
   `normal·d + tangent·s` with no bounds check. Near an edge, a large
   tangential bow (worst case ~0.6 with the collinear multiplier) pushes the
   control point outside the unit square, and the curve follows.

## Decisions (made with the user)

- **Two separate sliders:** *Curviness* (per-fiber shape) and *Randomness*
  (routing/pairing chaos). Both 0–1, both default 0.5.
- **Containment is unconditional.** Fibers never leave the frame at any
  slider value — matches the physical reality of fibers mounted inside a
  frame. No "artistic spill" mode.
- **Sliders reshape in place.** Moving a slider regenerates the wall from the
  *existing* seeds; it does not re-roll them.

## 1. API — `FiberStyle` (`src/engine/fibers.ts`, `src/engine/types.ts`)

```ts
interface FiberStyle {
  curviness: number;  // 0–1
  randomness: number; // 0–1
}
export const DEFAULT_FIBER_STYLE: FiberStyle = { curviness: 0.5, randomness: 0.5 };
```

- `generateFrame(seed, style?)` — `style` defaults to `DEFAULT_FIBER_STYLE`.
  Both inputs together are the deterministic key: same `(seed, style)` →
  identical frame. Changing style with a fixed seed changes the output
  deterministically (no compatibility requirement across style values).
- `generateWall` accepts and forwards `style`.
- Style values are clamped to [0, 1] on entry to `generateFrame`, so
  hand-edited snapshots cannot produce out-of-range constants.

## 2. Curviness — fiber shape

Curviness `c ∈ [0,1]` replaces the fixed shape constants with interpolated
ranges (exact numbers tuned visually during implementation; the acceptance
bars are the tests in §6):

- **Bow magnitude.** The `BOW_MIN`/`BOW_VAR` pair scales with `c`: at `c = 0`
  small (taut, gentle arcs, roughly bow ≈ 0.04–0.08); at `c = 1` large
  (≈ 0.12–0.45 before the collinear multiplier). The current look corresponds
  to roughly `c ≈ 0.7`.
- **Control distance.** The `CONTROL_MIN`/`CONTROL_RANGE` window shrinks
  toward tauter values at low `c` and stretches at high `c`.
- **S-curve suppression — the sharp-bend fix.** At low `c`, `sB`'s sign is
  forced equal to `sA`'s (clean C-arcs). The probability that `sB` may oppose
  `sA` grows with `c` (0 at `c = 0`, ~1 at `c = 1`), so S-curves — and their
  sharp bends — become an opt-in at the high end, not an accident. The RNG
  draw count per fiber is unchanged (the sign draw is always consumed; low
  `c` merely overrides its interpretation).
- **No-straight guarantee retained.** The perpendicular floor (`PERP_FLOOR`)
  applies at all `c`, with magnitude scaling modestly with `c` but never
  below an absolute minimum that keeps every fiber visibly curved (the
  existing 0.01 straightness-test floor stays the bar).

## 3. Randomness — routing chaos

Randomness `r ∈ [0,1]` sharpens or flattens the matcher's weighted pick.
Candidate weights become `pairScore^k` where `k` is a decreasing function of
`r`:

- `r = 0` → large exponent: the walk almost always takes the best-scoring
  partner — orderly, long, gallery-like chords.
- `r = 0.5` → `k = 1`: exactly today's behavior.
- `r = 1` → `k ≈ 0`: near-uniform pick — chaotic routing including short
  corner hops.

Unchanged at every `r`: the different-edge hard constraint, the perfect
matching, the restart/fallback termination guarantee, and the RNG draw order
(one shuffle per attempt, one weighted pick per pair).

## 4. Containment — the out-of-frame fix (unconditional)

After computing each control point, clamp it componentwise into
`[MARGIN, 1 − MARGIN]` (MARGIN ≈ 0.02). A cubic Bézier is contained in the
convex hull of its four defining points; endpoints sit on the frame edges, so
clamping the two control points guarantees the whole curve stays inside — no
sampling, retries, or extra RNG draws.

If clamping squashes a control point's perpendicular-to-chord component below
the floor (§2), the floor is re-applied with its push direction chosen toward
the frame's interior (the sign whose floored control point survives the clamp;
resolve ties toward the square's center). Clamped fibers therefore stay
visibly curved. Clamping runs after all RNG draws, so determinism per
`(seed, style)` is unaffected.

## 5. UI and persistence

- **LeftPanel:** two new `SliderRow`s in the FIBRES & LEDS section, above the
  Re-route/Generate buttons — "Curviness" and "Randomness", displayed as
  0–100 %, `step` 0.01 on a 0–1 range.
- **FilamentStudio:** `curviness` and `randomness` join `StudioState`
  (defaults 0.5). Slider changes call `rebuild` with the *current*
  `seedsRef.current` (wall reshapes in place, selection preserved; the
  selected-frame inspector re-reads the regenerated frame automatically).
  `handleReseed`'s single-frame regeneration also passes the current style.
- **EmptyState showcase:** seed 2024 rendered at `DEFAULT_FIBER_STYLE`; the
  cached showcase frame is invalidated when style changes (or simply
  regenerated with the live style — implementer's choice, but the showcase
  must not go stale).
- **ProjectSnapshot / storage:** `curviness` and `randomness` fields added.
  The loader falls back to 0.5 for missing (legacy) or non-numeric values and
  clamps to [0, 1].

## 6. Testing (`src/engine/__tests__/fibers.test.ts`)

Across a sample of seeds × style extremes (`{0,0}`, `{0,1}`, `{1,0}`,
`{1,1}`) plus the default:

- **Containment:** every sampled path point lies within
  `[−ε, 1 + ε]` in both axes (ε tiny float slack). This is the regression
  test for the out-of-frame bug.
- **No straight fibers at `c = 0`:** max deviation from the endpoint chord
  exceeds the existing 0.01 floor for every fiber.
- **No S-curves at `c = 0`:** each fiber's path stays on one side of its
  chord (signed perpendicular deviation does not change sign beyond ε).
- **Determinism:** same `(seed, style)` → deep-equal frames; different
  `style` with same seed → different paths (sanity, one seed).
- **Matching invariants at `r` extremes:** perfect matching and
  different-edge endpoints hold at `r = 0` and `r = 1`.
- **Style clamping:** out-of-range style values (e.g. `−1`, `2`) behave as
  the clamped extremes rather than producing NaN/exploding geometry.
- Retained: all existing perfect-matching, fiber-count, determinism, and
  straightness tests, updated to the new signature (default style).

## Error handling

No new failure modes: style is clamped on entry, clamping is pure math, and
the matcher's termination guarantee is untouched. No UI error states.

## Out of scope

Renderer, animations, light model, palettes, wall layout, LED placement, and
the crossing heuristic are untouched. No changes to fiber thickness or hue
derivation.
