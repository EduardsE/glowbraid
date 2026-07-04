# Fiber Perfect-Matching Generation — Design

Date: 2026-07-04
Status: Approved (pending implementation)
Supersedes: the "Fiber routing per fiber" generation rules in
`2026-07-04-filament-studio-design.md` §Generation. All other sections of that
spec remain in force.

## Problem

The current generator (`generateFrame(seed, density)` in `src/engine/fibers.ts`)
picks both fiber endpoints uniformly at random. Three defects follow:

1. **Unconnected LEDs.** Nothing guarantees an LED is ever picked, so some of
   the 24 LEDs per frame have no fiber and render dark.
2. **Multi-fiber LEDs.** Nothing stops an LED being picked repeatedly. A
   physical LED feeds exactly one fiber end, so this is impossible hardware.
3. **Straight fibers.** Control points sit on the endpoint edge normals. For
   directly-opposite LEDs the normals are collinear with the chord, so the
   cubic Bézier degenerates to a straight line — visually poor.

## Decisions (made with the user)

- **Perfect matching.** Every LED has exactly one fiber; every frame has
  exactly 12 fibers. The fiber-density slider (8–24) is removed.
- **Old saves may re-render differently.** Saved projects keep loading, but
  their walls regenerate under the new algorithm. No legacy code path.
- **Straightness is attacked from both ends.** The matcher penalizes
  near-collinear opposite pairs, and control points gain a tangential offset so
  any that remain still bow visibly.

## 1. Matching algorithm (`src/engine/fibers.ts`)

`generateFrame(seed)` — the `density` parameter is removed — builds the
matching with a greedy randomized walk:

1. Seeded-shuffle the 24 LED indices (Fisher–Yates over `createRng(seed)`).
2. Walk the shuffled list. For each LED still unpaired, collect candidate
   partners from the remaining unpaired LEDs:
   - **Hard constraint:** partner is on a different edge (`side` differs).
   - **Soft score:** longer chord distance scores higher (this replaces the old
     `MIN_ENDPOINT_DISTANCE = 0.42` rejection rule), and pairs whose chord is
     nearly parallel to both endpoint normals (directly-opposite pairs) score
     lower.
3. Choose the partner by weighted random pick over the scores — weighted
   sampling keeps layouts organic instead of converging on one optimum.
4. **Dead end** (every remaining unpaired LED shares the current LED's edge):
   discard the partial matching and restart from step 1 with a fresh shuffle.
   Bounded at 20 restarts.
5. **Termination fallback:** if all restarts are exhausted, pair the remaining
   LEDs arbitrarily in shuffle order, ignoring the different-edge rule. The
   generator never throws and never loops forever. (Restarts are not rare —
   about 22% of seeds trigger at least one restart — but the 20-restart budget
   is ample: the fallback never fires in practice, 0 of 1,000,000 seeds.)

Exported constants: `FIBERS_PER_FRAME = 12`, plus the restart bound. The RNG
draw-order comment in `fibers.ts` is rewritten to document the new order; the
old order need not be preserved (compat decision above). Per-fiber draws that
survive unchanged: control distances `dA`/`dB`, thickness `0.85 + rnd()·0.5`,
`hueBase = (start.u + end.u) / 2`, 38-sample cubic Bézier path.

## 2. Curvature — no straight fibers

Control points gain a tangential component:

```
P1 = A + normalA·dA + tangentA·sA
P2 = B + normalB·dB + tangentB·sB
```

- `tangent` is the edge direction (perpendicular to the edge normal).
- `d ∈ [0.34, 0.76)` as today.
- `s` is a seeded, signed offset. Its magnitude scales with the pair's
  collinearity: a chord parallel to the endpoint normals (opposite pair) gets a
  strong bow; a diagonal pair keeps roughly its current gentle curve.
- Exact ranges/constants for `s` are tuned visually during implementation; the
  acceptance bar is the straightness test in §5.

## 3. API and UI changes

- `generateFrame(seed)` loses its `density` parameter. All call sites update
  (`FilamentStudio`, `EmptyState`, tests).
- **LeftPanel:** the "Fibre runs / frame" slider is removed, replaced by a
  static info line styled like the existing LED info card:
  "12 fibre runs / frame · one per LED". "Re-route fibres" and
  "Generate new wall" are unchanged.
- **FilamentStudio:** the `fiberDensity` state and its prop plumbing are
  removed. Frames regenerate only when gridSize/seeds change.
- **ProjectSnapshot / storage:** the `fiberDensity` field is removed from the
  type and from new saves. The loader ignores an unknown `fiberDensity` key in
  old saves, so they load without migration.
- **EmptyState:** showcase frame keeps seed 2024 at the fixed 12 fibers.
- **Inspector:** the fiber-count stat now always reads 12; no code change
  beyond the regenerated data.

## 4. Determinism and compatibility

Generation stays fully deterministic: same seed → identical frame on every
run and platform (single `createRng(seed)` stream, fixed draw order). Old
saved walls re-render with new routing on load; seeds and all other snapshot
fields keep their meaning.

## 5. Testing (`src/engine/__tests__/fibers.test.ts`)

- **Perfect-matching invariant:** across all 12 fibers, every LED index 0–23
  appears exactly once as an endpoint (covers "no unconnected LEDs" and "no
  multi-fiber LEDs" in one assertion). Checked across a sample of seeds.
- **Fiber count:** exactly `FIBERS_PER_FRAME` fibers per frame.
- **Different edges:** for a sample of seeds, both endpoints of every fiber lie
  on different edges.
- **Determinism:** same seed → deep-equal frames.
- **Straightness:** for a sample of seeds, every fiber's path deviates from its
  endpoint chord by more than a small ε at its point of maximum deviation
  (every fiber visibly curves; ε fixed when constants are tuned).
- Retained from today: 38-sample paths starting/ending at the endpoint LED
  positions; endpoints reference valid LEDs.
- Removed: the duplicate-pair and minimum-endpoint-distance tests (both
  subsumed by the perfect-matching invariant and soft scoring).

## Error handling

The restart bound plus the arbitrary-pairing fallback guarantee termination
with exactly 12 fibers for any seed. No exceptions are thrown; no UI error
states are needed.

## Out of scope

Renderer, animations, light model, palettes, wall layout, and persistence
format (beyond dropping `fiberDensity`) are untouched.
