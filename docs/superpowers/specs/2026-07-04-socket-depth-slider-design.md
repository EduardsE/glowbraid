# Socket Depth Slider (Perpendicular Fiber Exits) — Design

Date: 2026-07-04
Status: Implemented
Extends: `2026-07-04-fiber-style-sliders-design.md`. The perfect-matching
invariants (12 fibers, every LED used exactly once, different-edge endpoints,
no straight fibers) and unconditional containment remain in force at every
slider setting.

## Problem

In the physical frame, each fiber tube seats into a tight hole a few mm deep
at its LED — the hole is the only thing holding the tube, so the first
stretch of fiber leaves the frame almost exactly perpendicular before it can
bend. The generator currently offsets control points by
`normal·d + tangent·s`, so fibers routinely exit at visibly wrong angles.

## Decisions (made with the user)

- **Always physical.** Perpendicular exit is a hard constraint at every
  slider value, not a style axis. The slider controls only the *depth* — how
  long the straight section is. Existing saves will change appearance; that
  is accepted.
- **Stub + cubic geometry (Approach B).** Each fiber is a straight stub of
  slider-controlled length along the LED normal at both ends, plus one cubic
  Bézier between the stub tips with tangent-continuous (kink-free) joints.
  Rejected alternatives: constrained single cubic (no true straight section),
  two-cubic spline (most flexible but restructures the stable RNG draw
  order).
- **Exactly-facing LED pairs are excluded in the matcher.** With
  perpendicular exits at both ends, a directly-facing pair (collinear
  endpoints and normals) is mathematically forced straight by a single
  cubic. Hard-excluding such pairs preserves the no-straight-fibers
  guarantee. They were already score-penalized; this makes it a rule.
- **Slider reshapes in place** from existing seeds, like the other two
  style axes.

## 1. API — `FiberStyle.socketDepth`

```ts
interface FiberStyle {
  curviness: number;   // 0–1
  randomness: number;  // 0–1
  socketDepth: number; // 0–1, NEW
}
export const DEFAULT_FIBER_STYLE: FiberStyle = {
  curviness: 0.5,
  randomness: 0.5,
  socketDepth: 0.4,
};
```

- `socketDepth` is sanitized like the other axes: clamp to [0, 1], NaN/±∞
  fall back to the default.
- Engine mapping: stub length `L = lerp(0.005, 0.12, socketDepth)` in
  normalized frame units (exact endpoints tunable during implementation;
  default 0.4 ≈ a couple of real-world cm on the reference frame).
- `generateFrame(seed, style)` and `generateWall` signatures are unchanged;
  the new field rides along in `FiberStyle`.

## 2. Geometry — stub + tangent-continuous cubic

Per fiber with endpoints `P0`, `P3` and inward normals `n0`, `n1`:

- **Stubs:** `S0 = P0 + n0·L`, `S1 = P3 + n1·L`. Straight segments
  `P0→S0` and `S1→P3` are the socket sections.
- **Cubic between stub tips:** `S0 → C0 → C1 → S1` with control points on
  the normals — `C0 = S0 + n0·dA`, `C1 = S1 + n1·dB`. The curve's end
  tangents are therefore exactly along the normals: perpendicular exit and
  no kink at the stub joints. `dA`/`dB` come from the existing
  curviness-interpolated `controlMin`/`controlRange` draws, so curviness
  keeps its meaning (taut vs. sweeping reach).
- **Path output unchanged in shape:** the composite (stub + sampled cubic +
  stub) is emitted as the same single `path: Point[]` polyline with the
  same total sample count (`FIBER_SAMPLES`), endpoints included, samples
  distributed so the stubs are represented by their endpoints and the cubic
  gets the rest. Renderer, `polylineLength`, and `countCrossings` need no
  changes.
- **Containment:** stubs point inward along axis-aligned normals so they
  cannot leave the frame for any `L ≤ 1 − MARGIN`; `C0`/`C1` get the
  existing componentwise clamp into `[MARGIN, 1 − MARGIN]`; the cubic stays
  in the convex hull of `S0, C0, C1, S1`. Containment remains unconditional
  with no sampling or retries. (Clamping a control point that lies on an
  axis-aligned normal only shortens `d` along that normal; it cannot tilt
  the exit tangent.)

### Removed machinery

Dead under a hard perpendicular constraint, deleted:

- Tangent offsets `sA`/`sB` and the sign draws' tangent interpretation.
- The S-curve gate / `forcedSide` logic (S-vs-C now emerges naturally from
  endpoint geometry: facing-edge offset pairs give S-shapes, adjacent-edge
  pairs give C-arcs).
- `perpFloor` and the perpendicular-push branch of `containControlPoint`
  (the no-straight guarantee moves to the matcher exclusion, §3).
- `BOW_COLLINEAR` boost (bowing collinear pairs is impossible by
  construction; they are now excluded instead).

`bowMin`/`bowVar` shape constants either retire or fold into the `dA`/`dB`
range — implementer's choice, provided curviness 0→1 still visibly moves
taut→sweeping.

## 3. Matching — facing-pair exclusion

`tryMatchOnce` treats an exactly-facing candidate like a same-side one:
skip `j` when the pair is collinear-straight, i.e. opposite parallel edges
and equal cross-axis coordinate within ε (equivalently
`collinearity(a, b) > 1 − ε` with the chord parallel to both normals).
Each LED loses at most one candidate (the grid is symmetric), so
matchability is preserved; the existing restart budget and arbitrary-pairing
fallback still guarantee termination. The fallback may in principle emit a
facing pair; it is the explicitly-arbitrary escape hatch and stays as is.

## 4. RNG stability

Draw order is byte-identical to today at every `socketDepth`: per matching
attempt one shuffle + one weighted pick per pair; per fiber `dA, dB, magA,
signDrawA, magB, signDrawB, thickness`. The four mag/sign draws are still
consumed; their values are reinterpreted or ignored (implementer may use the
mag draws to vary `dA`/`dB` spread) but never skipped, so a saved seed keeps
its matching and overall composition across all three slider positions.

## 5. UI and persistence

- **LeftPanel:** third `SliderRow` — label "Socket depth", displayed 0–100 %,
  `step` 0.01 on a 0–1 range — directly below Randomness.
- **FilamentStudio:** `socketDepth` joins `StudioState` and `styleOf`;
  slider changes go through the existing `handleStyle` → rebuild with
  current seeds (reshape in place, selection preserved).
- **ProjectSnapshot:** new `socketDepth: number` field. Loader falls back to
  the default (0.4) for missing/legacy or non-numeric values and clamps to
  [0, 1], mirroring `curviness`/`randomness` handling.

## 6. Testing (`src/engine/__tests__/fibers.test.ts`)

Across seeds × `socketDepth ∈ {0, 0.4, 1}` (and existing style extremes):

- **Perpendicular exit:** at both ends, the initial path direction is
  parallel to the LED normal within tolerance.
- **Straight section:** path points within distance `L` of each endpoint
  deviate from the normal ray by ≤ ε.
- **Containment:** every sampled point within `[−ε, 1 + ε]` on both axes at
  `socketDepth` extremes.
- **No straight fibers:** max chord deviation > 0.005 for every fiber
  (regression for the facing-pair exclusion). The floor drops from 0.01:
  under perpendicular exits the bow of a near-facing opposite pair (minimum
  cross-offset 0.085 between distinct LEDs) mathematically caps at ≈ 0.007,
  so 0.01 is unattainable; 0.005 still rejects the excluded straight cases
  (deviation ~0).
- **No facing pairs matched:** over sampled seeds, no emitted pair is
  exactly facing (excluding the documented fallback path).
- **Determinism & stability:** same `(seed, style)` → deep-equal frames;
  same seed with different `socketDepth` → identical LED pairings.
- **Sanitize:** NaN/out-of-range `socketDepth` behaves as default/clamped.
- Retained tests updated where the removed S-curve/perpFloor behavior was
  asserted directly.

## Error handling

No new failure modes: `socketDepth` is clamped on entry, stub math is pure,
and matcher termination is unchanged.

## Out of scope

Renderer, animations, light model, palettes, wall layout, LED placement,
crossing heuristic, fiber thickness, and hue derivation are untouched.
