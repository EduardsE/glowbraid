# Clickable frames in 3D mode — design

## Goal

Make wall frames selectable in the 3D installation view, at full parity with
the existing 2D sim view. Clicking a frame in 3D selects it — opening the
Inspector (frame/fibre readout + connection map) and unlocking the same
per-frame controls (re-seed, frame colour) — and shows a glowing outline around
the selected frame in the 3D scene. Clicking empty space deselects.

Feasibility is not in question: each frame's bezel is already its own
`THREE.Mesh` positioned via `frameOrigin`, and the studio already tracks
`selectedFrame` in `ui` state. The work is a hit-test, a highlight, and the
pointer wiring — no engine changes.

## Non-goals (YAGNI)

- Fibre-level picking in 3D. The 2D connection map remains the way to inspect
  individual fibres; it already works whenever a frame is selected, regardless
  of view.
- Camera-focus / fly-to-frame on click.
- Touch gestures beyond what pointer events already provide.
- Any change to the persistence contract or RNG draw order — this feature adds
  no randomness and no `ProjectSnapshot` fields.

## Constraints (from CLAUDE.md)

- **Layering:** engine → renderer → UI, imports point left only. This feature
  touches `renderer3d/` and `components/glowbraid/` only. No engine changes.
- **Render loop lives outside React state:** selection is UI chrome, not
  animation-frequency data, so `selectedFrame` stays in `ui` (`useState`) as it
  is today — nothing new goes into refs.
- **Testing:** Vitest covers pure `.ts` helpers only; the GL glue in
  `wall3d.ts` stays untested like the rest of that file. Extract the pickable
  layout math into a pure helper so it can be tested.

## Behaviour

| Action in 3D | Result |
|---|---|
| Click inside a frame's square (bezel or interior) | Select that frame: `selectedFrame = index`, `selectedFiber = null` |
| Click empty board / background | Deselect: `selectedFrame = null`, `selectedFiber = null` |
| Drag (orbit / pan) | No selection change — handled by OrbitControls |

This matches the 2D `onClickAt` semantics exactly (whole-square AABB hit,
gaps deselect), so the Inspector, re-seed, frame-colour, and connection-map
features light up in 3D for free — they all key off `selectedFrame`.

## Approach: dedicated invisible pick-planes (chosen)

Add one transparent quad per frame, sized to the frame's full square, at z ≈ 0
(the front face plane), each carrying `userData.frameIndex`. Picking raycasts
only these planes:

- A hit returns its `frameIndex` directly.
- A miss means empty space → deselect.

Chosen over the alternatives because it mirrors the 2D `pickFrame`
whole-square AABB model most faithfully and keeps picking a clean, separate
concern from rendering (no reverse layout math at click time, no interference
from bezel depth, fibre tubes, or bloom). Cost is N cheap invisible meshes,
rebuilt alongside the wall.

Alternatives considered:

- **Bezel-only raycast** — cheapest (bezels are already separate meshes), but
  only the raised border is clickable, diverging from 2D where the whole square
  hits; deselect needs a separate board test. Rejected for the parity gap.
- **Board-plane raycast + reverse layout math** — no new geometry, but requires
  mapping world-xy back to a frame square and handling bezels standing proud at
  `frameOffset`. More fiddly than a dedicated pick layer. Rejected for clarity.

## Components & changes

### `src/renderer3d/fiberGeometry.ts` (pure, tested)

Add a pure helper that, given the `WorldLayout` and a world-space point on the
front-face plane, returns the frame index whose square contains it, or `null`.
This is the world-space analogue of `viewport.ts`'s `pickFrame` AABB test and is
unit-tested with Vitest. The pick-plane geometry/positions reuse
`frameOrigin(layout, i)` and the frame-square size already derivable from
`WorldLayout`.

### `src/renderer3d/wall3d.ts`

1. **Build pick-planes** in `rebuild()`: for each frame, a `PlaneGeometry`
   sized to the frame square, positioned at `frameOrigin(...)` with z ≈ 0,
   material `transparent` + `opacity 0` (or `visible: false` but still
   raycastable — use an invisible-but-pickable material), `userData.frameIndex
   = i`. Store them in an array for raycasting and dispose them in
   `disposeGroup()`.
2. **`pick(clientX, clientY): number | null`** on the `Wall3D` interface:
   convert client coords to NDC using the canvas bounding rect, set the shared
   `THREE.Raycaster` from camera, `intersectObjects(pickPlanes)`, return the
   nearest hit's `userData.frameIndex` or `null`.
3. **Selection outline:** add `selectedFrame: number | null` to `Wall3DState`.
   In `render()`, when `selectedFrame` changes, (re)build a single outline
   overlay — an `EdgesGeometry`/box `LineSegments` around the selected frame's
   bezel, positioned via `frameOrigin`, in an accent colour bright enough that
   the existing `UnrealBloomPass` blooms it into a glow. Remove/hide the overlay
   when `selectedFrame` is `null`. One overlay object updated on change, not one
   per frame.

### `src/components/glowbraid/GlowbraidStudio.tsx`

1. **GL-canvas pointer handler** (new, on `glCanvasRef`): on `pointerdown`
   record `{x, y}`; on `pointerup`, if the pointer moved less than a small
   threshold (~4px) treat it as a click — call `wall3dRef.current?.pick(clientX,
   clientY)` and `setUi(prev => ({ ...prev, selectedFrame: index,
   selectedFiber: null }))`. Above the threshold it was an orbit/pan drag →
   ignore. Runs alongside OrbitControls (which is attached to the same canvas),
   not replacing it.
2. **Pass selection into the 3D render state:** in `draw()`, add
   `selectedFrame: s.selectedFrame` to the `wall3dRef.current?.render({...})`
   call (2D already receives it).

### `CLAUDE.md`

Update the `renderer3d/` description: 3D is no longer "View-only: no picking" —
frame picking now exists (raycast against invisible per-frame pick-planes).
Camera state remains session-only.

## Data flow

```
pointerup on GL canvas (below drag threshold)
  → wall3d.pick(clientX, clientY)        [raycast pick-planes → frameIndex|null]
  → setUi({ selectedFrame, selectedFiber: null })   [same update as 2D onClickAt]
  → React render: Inspector / frame controls read selectedFrame (unchanged)
  → draw() passes selectedFrame into wall3d.render(...)
  → wall3d updates the glowing outline overlay
```

## Testing

- **Unit (Vitest):** the pure world-point → frame-index helper in
  `fiberGeometry.ts` — hits inside each frame square, misses in the gaps and
  outside the board, boundary cases. Follows the existing `fiberGeometry` /
  `fiberColors` test pattern.
- **Click-vs-drag threshold:** if the comparison can be isolated as a pure
  predicate, unit-test it; otherwise it's trivial inline glue.
- **Manual:** in `npm run dev`, switch to 3D, click frames (bezel and interior)
  to select, confirm the Inspector opens and the outline glows, orbit-drag does
  not select, click empty space deselects, and selection survives a rebuild
  (e.g. changing grid size).
- The three.js raycast/render glue in `wall3d.ts` stays untested, consistent
  with the rest of the file.

## Risks / edge cases

- **Pick-plane vs. bezel depth:** planes sit at z ≈ 0; bezels stand proud at
  `frameOffset`. Since we raycast only the pick-planes (not bezels), depth
  ordering between them is irrelevant — a ray through a frame's square hits that
  frame's plane regardless of the raised bezel in front.
- **Selection surviving rebuild:** `selectedFrame` lives in React `ui` state,
  independent of the 3D group lifecycle, so a wall rebuild preserves it; the
  outline is re-derived from `selectedFrame` on the next render. An index that
  is now out of range (grid shrank) is already guarded by the existing
  `framesRef.current[s.selectedFrame] ?? null` lookups; picking only ever
  returns in-range indices.
- **DPR / canvas rect:** NDC conversion must use the canvas `getBoundingClientRect()`,
  matching how the 2D interaction hook maps coordinates.
```
