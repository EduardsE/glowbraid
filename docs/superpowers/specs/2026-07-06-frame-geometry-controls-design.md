# Frame geometry controls — design

Add four user-controllable frame geometry parameters and unify the 2D/3D
appearance:

1. **Corner radius** — how rounded the frame corners are (previously fixed and
   mismatched between 2D and 3D).
2. **Frame width** — bezel wall thickness (previously the fixed
   `FRAME_BEZEL_RATIO = 0.03`).
3. **Frame offset** — how far the frames stand off the board (3D-only; models
   the physical standoff/buffer behind each frame).

All values are physical: corner radius and frame width in **mm**, offset in
**cm** — consistent with the existing `frameGap` (mm) and `frameSize`/
`boardPadding` (cm) controls.

## Motivation

- The 2D renderer rounds frame corners via a fixed ratio (`r = sz * 0.045`,
  bezel outer at `r*1.5`); the 3D `bezelGeometry` builds a **sharp-cornered**
  square `THREE.Shape`. The two views don't match.
- Corner radius and bezel wall thickness are not adjustable at all.
- In 3D the frame sits flush on the board (`z = 0`). Real frames have a small
  buffer (default ~2 cm) behind them; there's no way to represent it.

## Decisions (confirmed)

- **One corner-radius knob, auto inner.** User sets the outer corner radius;
  the inner light-panel radius is derived as `max(0, cornerRadius − border)`,
  keeping the two corners concentric like a routed frame. No separate inner
  control.
- **Absolute units** — corner radius and frame width in mm, offset in cm.
- **Global offset**, one value for all frames. Default 2 cm.

## Persistence — `ProjectSnapshot` (`src/engine/types.ts`)

Three new fields. All are render-time settings unrelated to the seeded RNG
streams, so **no determinism / draw-order impact**. Each tolerates absence per
the legacy-save contract (`handleLoad` in `GlowbraidStudio.tsx`):

| Field          | Unit | Default | Range (clamp)                          | Absent → |
|----------------|------|---------|----------------------------------------|----------|
| `cornerRadius` | mm   | 15      | 0 … `frameSize × 5` (½ the frame edge) | 15       |
| `frameWidth`   | mm   | 8       | 1 … `frameSize × 5 − 1` (panel stays >0)| 8        |
| `frameOffset`  | cm   | 2       | 0 … 10                                  | 2        |

Defaults chosen for visual continuity: at the default 25 cm frame,
`frameWidth 8mm ≈ 0.03×250mm = 7.5mm` (old ratio) and `cornerRadius 15mm`
approximates today's `1.5 × 0.045 × 250mm ≈ 17mm` bezel corner.

`FRAME_BEZEL_RATIO` is retained only as the fallback constant behind the
`frameWidth` default; `border` is now derived from `frameWidth`.

Loader sanitizers (mirroring existing `cmField`/`styleAxis` helpers):
- `cornerRadius`: number, clamp `0 … frameSize*5`, fallback 15.
- `frameWidth`: number, clamp `1 … frameSize*5 − 1`, fallback 8.
- `frameOffset`: number, clamp `0 … 10`, fallback 2.

## Derived geometry (shared rule)

Given a frame edge `frameSize` (cm), `frameWidth` (mm), `cornerRadius` (mm):

```
border   = frameWidth / 10                     // cm
panel    = frameSize − 2 * border              // cm, kept > 0 by width clamp
outerR   = min(cornerRadius / 10, frameSize/2) // cm
innerR   = clamp(outerR − border, 0, panel/2)  // cm
```

The same `border`/`outerR`/`innerR` feed both renderers so 2D and 3D agree.

## 2D renderer (`src/renderer/wallRenderer.ts`)

- `frameGeometry(x, y, sz, border)` takes an explicit `border` (screen px)
  instead of computing `sz * FRAME_BEZEL_RATIO` internally. Callers pass
  `border = (frameWidth/10) * (sz / frameSize)`.
- `drawFrame` receives `cornerRadius` (mm) and `frameSize` (cm) via opts and
  computes:
  - `rPx = (cornerRadius/10) * (sz / frameSize)`, clamped ≤ `sz/2`.
  - bezel outer `roundRect` uses `rPx` (replacing the `r*1.5` magic).
  - inner panel `roundRect` uses `max(0, rPx − borderPx)` (replacing `r`).
  - The existing fibre clip already uses the panel roundRect, so fibres remain
    masked to the rounded inner corners automatically.
- `WallDrawState` gains `cornerRadius` and `frameWidth`; `drawWall` threads them
  to `drawFrame` and to the layout/border math.
- Frame offset has **no** 2D effect (flat view), as intended.

## 3D renderer (`src/renderer3d/`)

`fiberGeometry.ts`:
- New pure helper `roundedRectPath(w, h, r, clockwise): Vector2[]`/`Shape`
  builder producing a rounded rectangle with arc corners, honoring the winding
  contract already documented in `bezelGeometry` (outer contour clockwise, hole
  counter-clockwise) so the inner cavity wall keeps correct (non-culled)
  normals. `r = 0` degrades to the current sharp rectangle.
- `WorldLayout` gains `border`-from-width, `cornerRadius`, `frameOffset`.
  `computeWorldLayout(gridSize, frameSize, frameGapMm, boardPadding,
  frameWidthMm, cornerRadiusMm, frameOffsetCm)` computes `border`, `panelSize`,
  `outerR`, `innerR` per the shared rule. `boardSize` is unchanged (still
  `gridSize*frameSize + (gridSize-1)*gap + 2*padding`).
- `bezelGeometry(layout)` builds the outer contour with `roundedRectPath(s, s,
  outerR, clockwise)` and the hole with `roundedRectPath(panel, panel, innerR,
  counter-clockwise)`, positioned by `border`.
- `fiberWorldPoints`: add `layout.frameOffset` to each point's z
  (`z = frameOffset + FIBER_SOCKET_Z + bulge`).

`wall3d.ts`:
- `Wall3DState` gains `cornerRadius`, `frameWidth`, `frameOffset`.
- `rebuild` passes them to `computeWorldLayout`; bezel mesh
  `position.z = layout.frameOffset` (was 0). Board stays at `z = 0`, so the
  whole frame + its fibres float `frameOffset` cm off the board front.
- Rebuild cache `key` gains `cornerRadius|frameWidth|frameOffset` so the scene
  rebuilds when any of them change.

## UI (`src/components/glowbraid/`)

Three sliders added to the frame-geometry control group in `LeftPanel.tsx`,
each following the existing `frameSize`/`frameGap`/`boardPadding` pattern
(label + live value readout + range input):

- Corner radius — mm, 0…`frameSize*5`, step 1.
- Frame width — mm, 1…`frameSize*5 − 1`, step 1.
- Frame offset — cm, 0…10, step 0.5.

Wired through `GlowbraidStudio`'s `ui` state and `patch(...)`, with the existing
silent autosave. `ui` type + `DEFAULTS` + `handleLoad` sanitizers updated in
lockstep.

## Tests

`src/renderer3d/__tests__/fiberGeometry.test.ts`:
- `roundedRectPath`: correct corner count, winding direction for both
  orientations, and `r=0` → 4-corner rectangle.
- `bezelGeometry`: `innerR` clamps to 0 when `cornerRadius < border`; outer
  clamps to `frameSize/2`.
- `fiberWorldPoints`: every point's z is raised by exactly `frameOffset`.
- `computeWorldLayout`: `boardSize` unaffected by the new params; `border`
  tracks `frameWidth`; `panelSize` stays positive at the width clamp.

`src/renderer/__tests__/wallRenderer.test.ts`:
- `frameGeometry(x, y, sz, border)` uses the passed border (update existing test
  that referenced `FRAME_BEZEL_RATIO`).

2D corner-radius px conversion is pure arithmetic verified alongside
`frameGeometry`; final visual parity between 2D and 3D confirmed by running the
app.

## Out of scope

- Per-frame corner radius / width / offset (global only).
- Independent inner corner radius (derived only).
- Any change to fibre generation or the engine layer.
```