# Frame Geometry Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four user-controllable frame geometry parameters — corner radius, bezel wall width, and frame-to-board offset — and unify the rounded-corner appearance between the 2D and 3D renderers.

**Architecture:** Three new `ProjectSnapshot`/`StudioState` fields drive a shared derivation (`border`, `outerRadius`, `innerRadius`). The 2D renderer converts mm → screen px per frame; the 3D renderer builds rounded-rectangle bezel geometry and floats the frame off the board in z. Engine layer is untouched, so the determinism/persistence contract is unaffected.

**Tech Stack:** TypeScript, React (TanStack Start), Canvas2D, three.js, Vitest, Biome.

## Global Constraints

- Corner radius and frame width are stored in **mm**; frame offset in **cm**. Consistent with `frameGap` (mm) and `frameSize`/`boardPadding` (cm).
- New `ProjectSnapshot` fields MUST tolerate absence — sanitize with a fallback in `buildInitialProject` (`GlowbraidStudio.tsx`), like every existing field.
- Do NOT touch `src/engine/` — these are render-time settings only; no RNG draw-order impact.
- Do NOT reintroduce `ctx.shadowBlur` in hot draw paths (`wallRenderer.ts`).
- Defaults: `cornerRadius = 15` mm, `frameWidth = 8` mm, `frameOffset = 2` cm.
- Clamps: outer radius ≤ `frameSize × 5` mm (½ the frame edge); frame width in `[1, frameSize × 5 − 1]` mm (panel stays > 0); offset in `[0, 10]` cm.
- Derived rule (shared by both renderers), all in cm unless noted:
  `border = frameWidth/10`, `panel = frameSize − 2·border`,
  `outerR = min(cornerRadius/10, frameSize/2)`,
  `innerR = clamp(outerR − border, 0, panel/2)`.
- `npx tsc --noEmit` and `npm run check` must both pass before any commit.

---

### Task 1: Persistence & state fields

Add the three settings to the persisted snapshot and the in-memory studio state, with loader sanitizers and autosave wiring. No rendering yet — the fields exist but are unused until later tasks consume them.

**Files:**
- Modify: `src/engine/types.ts` (ProjectSnapshot)
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` (StudioState, INITIAL_STATE, sanitizers, buildInitialProject, autosave effect)

**Interfaces:**
- Produces: `ProjectSnapshot.cornerRadius: number` (mm), `ProjectSnapshot.frameWidth: number` (mm), `ProjectSnapshot.frameOffset: number` (cm). `StudioState` gains the same three numeric fields.

- [ ] **Step 1: Add the three fields to `ProjectSnapshot`**

In `src/engine/types.ts`, inside `interface ProjectSnapshot`, after the `boardPadding` field (around line 87), add:

```ts
  /** Frame corner radius in millimetres. Absent in legacy saves → loader defaults to 15. */
  cornerRadius?: number;
  /** Bezel wall thickness in millimetres. Absent in legacy saves → loader defaults to 8. */
  frameWidth?: number;
  /** Frame standoff from the board in centimetres (3D only). Absent in legacy saves → loader defaults to 2. */
  frameOffset?: number;
```

- [ ] **Step 2: Add the fields to `StudioState` and `INITIAL_STATE`**

In `src/components/glowbraid/GlowbraidStudio.tsx`, add to `interface StudioState` (after `boardPadding: number;`, ~line 35):

```ts
  cornerRadius: number;
  frameWidth: number;
  frameOffset: number;
```

Add to `INITIAL_STATE` (after `boardPadding: 4,`, ~line 60):

```ts
  cornerRadius: 15,
  frameWidth: 8,
  frameOffset: 2,
```

- [ ] **Step 3: Add a non-rounding numeric sanitizer**

In `GlowbraidStudio.tsx`, after the `cmField` helper (~line 119), add:

```ts
/** Loader sanitizer: finite number clamped to [min, max] (no rounding), else fallback. */
function numField(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
```

- [ ] **Step 4: Sanitize the fields in `buildInitialProject`**

In `buildInitialProject`, after the `boardPadding` line (~line 169), add (note the radius/width max depends on the already-computed `frameSize`):

```ts
  const cornerRadius = cmField(d.cornerRadius, 15, 0, frameSize * 5);
  const frameWidth = cmField(d.frameWidth, 8, 1, frameSize * 5 - 1);
  const frameOffset = numField(d.frameOffset, 2, 0, 10);
```

Then add them to the returned `state` object (in the `{ ...INITIAL_STATE, ... }` spread, after `boardPadding,`):

```ts
      cornerRadius,
      frameWidth,
      frameOffset,
```

- [ ] **Step 5: Persist the fields in the autosave snapshot**

In the autosave effect, add to the `snapshot` object literal (after `boardPadding: s.boardPadding,`, ~line 447):

```ts
        cornerRadius: s.cornerRadius,
        frameWidth: s.frameWidth,
        frameOffset: s.frameOffset,
```

And add to the effect's dependency array (after `ui.boardPadding,`, ~line 469):

```ts
    ui.cornerRadius,
    ui.frameWidth,
    ui.frameOffset,
```

- [ ] **Step 6: Verify types and lint**

Run: `npx tsc --noEmit && npm run check`
Expected: both pass, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: persist frame corner radius, width, and offset settings"
```

---

### Task 2: 2D pure geometry helpers

Add the mm → px corner-radius conversion and make `frameGeometry` accept an explicit border, both as pure, unit-tested functions.

**Files:**
- Modify: `src/renderer/wallRenderer.ts` (frameGeometry, new frameCornerRadii)
- Test: `src/renderer/__tests__/wallRenderer.test.ts`

**Interfaces:**
- Produces:
  - `frameGeometry(x: number, y: number, sz: number, border?: number): FrameGeometry` — border defaults to `sz * FRAME_BEZEL_RATIO`.
  - `frameCornerRadii(cornerRadiusMm: number, frameWidthMm: number, frameSizeCm: number, szPx: number): { borderPx: number; outerPx: number; innerPx: number }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/__tests__/wallRenderer.test.ts` (and add `frameCornerRadii` to the existing import from `../wallRenderer`):

```ts
describe("frameGeometry with explicit border", () => {
  it("insets the panel by the passed border instead of the default ratio", () => {
    const g = frameGeometry(10, 20, 100, 12);
    expect(g.border).toBe(12);
    expect(g.panelX).toBe(22);
    expect(g.panelSize).toBe(76);
  });
});

describe("frameCornerRadii", () => {
  // 25cm frame drawn at 250px → 10px per cm → 1px per mm.
  it("converts mm to px at the frame's on-screen scale", () => {
    const r = frameCornerRadii(15, 8, 25, 250);
    expect(r.borderPx).toBeCloseTo(8);
    expect(r.outerPx).toBeCloseTo(15);
    expect(r.innerPx).toBeCloseTo(7); // 15 - 8
  });

  it("clamps the inner radius to zero when the border exceeds the outer radius", () => {
    const r = frameCornerRadii(5, 20, 25, 250);
    expect(r.innerPx).toBe(0);
  });

  it("clamps the outer radius to half the frame edge", () => {
    const r = frameCornerRadii(9999, 8, 25, 250);
    expect(r.outerPx).toBe(125);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/wallRenderer.test.ts`
Expected: FAIL — `frameCornerRadii is not a function` and the explicit-border test fails (4th arg ignored).

- [ ] **Step 3: Implement the helpers**

In `src/renderer/wallRenderer.ts`, change `frameGeometry`'s signature to accept an optional border (replace the `const border = sz * FRAME_BEZEL_RATIO;` line by defaulting the parameter):

```ts
export function frameGeometry(
  x: number,
  y: number,
  sz: number,
  border: number = sz * FRAME_BEZEL_RATIO,
): FrameGeometry {
  return {
    outerX: x,
    outerY: y,
    outerSize: sz,
    panelX: x + border,
    panelY: y + border,
    panelSize: sz - 2 * border,
    border,
  };
}
```

Immediately after `frameGeometry`, add:

```ts
export interface FrameCornerRadii {
  /** Bezel wall thickness, screen px. */
  borderPx: number;
  /** Outer (bezel) corner radius, screen px. */
  outerPx: number;
  /** Inner (light-panel) corner radius, screen px — concentric with the outer. */
  innerPx: number;
}

/**
 * Converts the mm corner-radius / width settings into screen px for a frame
 * drawn at `szPx` on-screen (frame edge `frameSizeCm`). Inner radius is derived
 * concentric with the outer, clamped so it never goes negative or exceeds the
 * panel's own half-size.
 */
export function frameCornerRadii(
  cornerRadiusMm: number,
  frameWidthMm: number,
  frameSizeCm: number,
  szPx: number,
): FrameCornerRadii {
  const pxPerCm = szPx / frameSizeCm;
  const borderPx = (frameWidthMm / 10) * pxPerCm;
  const outerPx = Math.min((cornerRadiusMm / 10) * pxPerCm, szPx / 2);
  const panelPx = szPx - 2 * borderPx;
  const innerPx = Math.max(0, Math.min(outerPx - borderPx, panelPx / 2));
  return { borderPx, outerPx, innerPx };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/wallRenderer.test.ts`
Expected: PASS (all, including the pre-existing frameGeometry tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wallRenderer.ts src/renderer/__tests__/wallRenderer.test.ts
git commit -m "feat: add 2D frame corner-radius px conversion helper"
```

---

### Task 3: 2D renderer wiring

Thread the new settings through `WallDrawState` → `drawWall` → `drawFrame`, replacing the fixed `r = sz * 0.045` radius and `frameGeometry` default border.

**Files:**
- Modify: `src/renderer/wallRenderer.ts` (WallDrawState, FrameDrawOptions, drawWall, drawFrame)
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` (`draw()` drawWall call)

**Interfaces:**
- Consumes: `frameCornerRadii`, `frameGeometry(..., border)` from Task 2; `StudioState.cornerRadius`/`frameWidth` from Task 1.
- Produces: `WallDrawState` gains `cornerRadius: number` and `frameWidth: number` (mm); `frameSize` already present.

- [ ] **Step 1: Extend `WallDrawState`**

In `src/renderer/wallRenderer.ts`, add to `interface WallDrawState` (after `frameSize: number;`, ~line 153):

```ts
  /** Corner radius, millimetres. */
  cornerRadius: number;
  /** Bezel wall thickness, millimetres. */
  frameWidth: number;
```

- [ ] **Step 2: Extend `FrameDrawOptions`**

Add to `interface FrameDrawOptions` (after `edit: boolean;`, ~line 175):

```ts
  cornerRadius: number;
  frameWidth: number;
  /** Frame edge length, cm — used to convert the mm radius/width to px. */
  frameSizeCm: number;
```

- [ ] **Step 3: Pass the values in the `drawFrame` call inside `drawWall`**

In `drawWall`, add to the options object passed to `drawFrame` (after `edit,`, ~line 250):

```ts
      cornerRadius: state.cornerRadius,
      frameWidth: state.frameWidth,
      frameSizeCm: state.frameSize,
```

- [ ] **Step 4: Compute px radii in `drawFrame` and apply them**

In `drawFrame`, destructure the new opts (add to the existing `const { ... } = opts;` block, ~line 284): `cornerRadius,`, `frameWidth,`, `frameSizeCm,`.

Replace the two lines (~299–300):

```ts
  const r = sz * 0.045;
  const { panelX, panelY, panelSize, border } = frameGeometry(x, y, sz);
```

with:

```ts
  const { borderPx, outerPx, innerPx } = frameCornerRadii(
    cornerRadius,
    frameWidth,
    frameSizeCm,
    sz,
  );
  const border = borderPx;
  const { panelX, panelY, panelSize } = frameGeometry(x, y, sz, border);
```

Update the three `roundRect` radius arguments:
- Bezel (~line 305): `roundRect(ctx, x, y, sz, sz, r * 1.5);` → `roundRect(ctx, x, y, sz, sz, outerPx);`
- Panel clip (~line 322): `roundRect(ctx, panelX, panelY, panelSize, panelSize, r);` → `roundRect(ctx, panelX, panelY, panelSize, panelSize, innerPx);`
- Panel border (~line 487): `roundRect(ctx, panelX, panelY, panelSize, panelSize, r);` → `roundRect(ctx, panelX, panelY, panelSize, panelSize, innerPx);`

(`border` is still used for LED positioning below — leave those references as-is.)

- [ ] **Step 5: Pass the fields from `draw()` in GlowbraidStudio**

In `src/components/glowbraid/GlowbraidStudio.tsx`, in the `drawWall(...)` call inside `draw()`, add (after `frameSize: s.frameSize,`, ~line 314):

```ts
        cornerRadius: s.cornerRadius,
        frameWidth: s.frameWidth,
```

- [ ] **Step 6: Verify types, lint, and existing tests**

Run: `npx tsc --noEmit && npm run check && npx vitest run src/renderer`
Expected: all pass.

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev` and open the 2D (sim/edit) view. The default wall should render with rounded corners as before. Temporarily editing `INITIAL_STATE.cornerRadius` / `frameWidth` (then reverting) should visibly change corner rounding and bezel thickness. Confirm no console errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/wallRenderer.ts src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: drive 2D frame corner radius and width from settings"
```

---

### Task 4: 3D layout — width, radius fields, and frame offset

Extend `computeWorldLayout` to derive `border` from frame width, carry the corner radii and offset, and raise fibre z by the offset. Existing `bezelGeometry` stays sharp until Task 5.

**Files:**
- Modify: `src/renderer3d/fiberGeometry.ts` (WorldLayout, computeWorldLayout, fiberWorldPoints; drop FRAME_BEZEL_RATIO import)
- Test: `src/renderer3d/__tests__/fiberGeometry.test.ts`

**Interfaces:**
- Produces:
  - `WorldLayout` gains `outerRadius: number`, `innerRadius: number`, `frameOffset: number` (all cm).
  - `computeWorldLayout(gridSize, frameSize, frameGapMm, boardPadding, frameWidthMm, cornerRadiusMm, frameOffsetCm): WorldLayout`.
  - `fiberWorldPoints` z-values include `+ layout.frameOffset`.

- [ ] **Step 1: Update the existing tests to the new signature and expectations**

In `src/renderer3d/__tests__/fiberGeometry.test.ts`:

Replace the layout construction (line 18) with the full-arg call:

```ts
// 2×2 grid, 25cm frames, 20mm gap, 4cm padding, 8mm width, 15mm radius, 2cm offset
const layout = computeWorldLayout(2, 25, 20, 4, 8, 15, 2);
```

Replace the `computeWorldLayout` describe block's assertions (lines 20–32) with:

```ts
describe("computeWorldLayout", () => {
  it("sizes the board from frames, gaps and padding", () => {
    expect(layout.boardSize).toBe(60);
    expect(layout.gapCm).toBe(2);
  });

  it("derives the border from frame width and the radii from corner radius", () => {
    expect(layout.border).toBeCloseTo(0.8, 6); // 8mm
    expect(layout.panelSize).toBeCloseTo(25 - 2 * 0.8, 6);
    expect(layout.outerRadius).toBeCloseTo(1.5, 6); // 15mm
    expect(layout.innerRadius).toBeCloseTo(0.7, 6); // 1.5 - 0.8
    expect(layout.frameOffset).toBe(2);
  });

  it("clamps the outer radius to half the frame edge", () => {
    const big = computeWorldLayout(1, 20, 0, 0, 8, 9999, 0);
    expect(big.outerRadius).toBeCloseTo(10, 6);
  });

  it("clamps the inner radius to zero when the border exceeds it", () => {
    const thick = computeWorldLayout(1, 20, 0, 0, 30, 5, 0);
    expect(thick.innerRadius).toBe(0);
  });

  it("handles a 1×1 grid with zero gap contribution", () => {
    const single = computeWorldLayout(1, 30, 20, 0, 8, 15, 2);
    expect(single.boardSize).toBe(30);
  });
});
```

In the `fiberWorldPoints` describe block, update the two socket-height assertions (lines 69–74) to include the offset:

```ts
  it("pins z to the offset socket height at both ends", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    const socket = layout.frameOffset + FIBER_SOCKET_Z;
    expect(FIBER_SOCKET_Z).toBeCloseTo(BEZEL_DEPTH / 2, 6);
    expect(p[2]).toBeCloseTo(socket, 5);
    expect(p[p.length - 1]).toBeCloseTo(socket, 5);
  });
```

And the bulge-range test (lines 76–85), replace the `FIBER_SOCKET_Z` floor/ceiling references with the offset socket:

```ts
  it("bulges smoothly between the socket floor and the max height", () => {
    const p = fiberWorldPoints(fiber, 0, layout);
    const socket = layout.frameOffset + FIBER_SOCKET_Z;
    let maxZ = 0;
    for (let i = 2; i < p.length; i += 3) {
      expect(p[i]).toBeGreaterThanOrEqual(socket - 1e-6);
      maxZ = Math.max(maxZ, p[i]);
    }
    expect(maxZ).toBeGreaterThan(socket + BULGE_MIN * 0.9);
    expect(maxZ).toBeLessThanOrEqual(socket + BULGE_MAX + 1e-6);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer3d/__tests__/fiberGeometry.test.ts`
Expected: FAIL — `computeWorldLayout` takes 4 args / `layout.outerRadius` undefined / socket z off by the offset.

- [ ] **Step 3: Update `WorldLayout` and `computeWorldLayout`**

In `src/renderer3d/fiberGeometry.ts`, remove the `FRAME_BEZEL_RATIO` import (line 4) — it's no longer used. Add to `interface WorldLayout` (after `border: number;` / `panelSize: number;`):

```ts
  /** Outer (bezel) corner radius, cm. */
  outerRadius: number;
  /** Inner (light-panel) corner radius, cm — concentric with the outer. */
  innerRadius: number;
  /** Frame standoff from the board face, cm. */
  frameOffset: number;
```

Replace `computeWorldLayout` (lines 27–46) with:

```ts
export function computeWorldLayout(
  gridSize: number,
  frameSize: number,
  frameGapMm: number,
  boardPadding: number,
  frameWidthMm: number,
  cornerRadiusMm: number,
  frameOffsetCm: number,
): WorldLayout {
  const gapCm = frameGapMm / 10;
  const boardSize =
    gridSize * frameSize + (gridSize - 1) * gapCm + 2 * boardPadding;
  const border = frameWidthMm / 10;
  const panelSize = frameSize - 2 * border;
  const outerRadius = Math.min(cornerRadiusMm / 10, frameSize / 2);
  const innerRadius = Math.max(0, Math.min(outerRadius - border, panelSize / 2));
  return {
    gridSize,
    frameSize,
    gapCm,
    boardPadding,
    boardSize,
    border,
    panelSize,
    outerRadius,
    innerRadius,
    frameOffset: frameOffsetCm,
  };
}
```

- [ ] **Step 4: Raise fibre z by the offset**

In `fiberWorldPoints`, change the z line (~line 147):

```ts
    out[i * 3 + 2] = FIBER_SOCKET_Z + h * Math.sin(Math.PI * s) ** 1.5;
```

to:

```ts
    out[i * 3 + 2] =
      layout.frameOffset + FIBER_SOCKET_Z + h * Math.sin(Math.PI * s) ** 1.5;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer3d/__tests__/fiberGeometry.test.ts`
Expected: PASS.

Note: the `bezelGeometry` describe block still passes because `bezelGeometry(layout)` reads `layout.border`/`layout.frameSize` (both still present); rounded corners come in Task 5. `tsc` will still fail here because `wall3d.ts` calls the old 4-arg `computeWorldLayout` — that's fixed in Task 6. Do not run `tsc` at this task boundary.

- [ ] **Step 6: Commit**

```bash
git add src/renderer3d/fiberGeometry.ts src/renderer3d/__tests__/fiberGeometry.test.ts
git commit -m "feat: derive 3D border/radii from width and offset settings"
```

---

### Task 5: 3D rounded bezel geometry

Give the 3D bezel true rounded corners matching 2D, via a pure rounded-rectangle point generator.

**Files:**
- Modify: `src/renderer3d/fiberGeometry.ts` (new roundedRectPoints, bezelGeometry)
- Test: `src/renderer3d/__tests__/fiberGeometry.test.ts`

**Interfaces:**
- Consumes: `WorldLayout.outerRadius`/`innerRadius` from Task 4.
- Produces: `roundedRectPoints(x0, y0, w, h, r, clockwise, cornerSegments?): THREE.Vector2[]` — a closed rounded-rectangle polygon in the frame's y-down convention (top-left at `(x0, y0)`, spanning down to `(x0+w, y0−h)`). Clockwise winding (negative signed area) when `clockwise` is true.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer3d/__tests__/fiberGeometry.test.ts` (add `roundedRectPoints` to the import from `../fiberGeometry`):

```ts
function signedArea(pts: THREE.Vector2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

describe("roundedRectPoints", () => {
  it("returns the four sharp corners when radius is zero", () => {
    const pts = roundedRectPoints(0, 0, 10, 10, 0, true);
    expect(pts).toHaveLength(4);
  });

  it("winds clockwise (negative signed area) when clockwise=true", () => {
    expect(signedArea(roundedRectPoints(0, 0, 10, 10, 2, true))).toBeLessThan(0);
  });

  it("winds counter-clockwise when clockwise=false", () => {
    expect(
      signedArea(roundedRectPoints(0, 0, 10, 10, 2, false)),
    ).toBeGreaterThan(0);
  });

  it("stays within the rectangle bounds", () => {
    for (const p of roundedRectPoints(0, 0, 10, 10, 3, true)) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
      expect(p.y).toBeLessThanOrEqual(1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-10 - 1e-9);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer3d/__tests__/fiberGeometry.test.ts`
Expected: FAIL — `roundedRectPoints is not a function`.

- [ ] **Step 3: Implement `roundedRectPoints`**

In `src/renderer3d/fiberGeometry.ts`, add above `bezelGeometry`:

```ts
/**
 * Closed rounded-rectangle polygon in the frame's y-down convention: top-left
 * corner at (x0, y0), extending to (x0+w, y0-h). Built clockwise (TL→TR→BR→BL,
 * negative signed area — the winding ExtrudeGeometry needs for the outer
 * contour); reversed for the counter-clockwise hole. r is clamped to half the
 * shorter side; r=0 yields the four sharp corners.
 */
export function roundedRectPoints(
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  clockwise: boolean,
  cornerSegments = 6,
): THREE.Vector2[] {
  const l = x0;
  const rt = x0 + w;
  const t = y0;
  const b = y0 - h;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  let pts: THREE.Vector2[];
  if (rr === 0) {
    pts = [
      new THREE.Vector2(l, t),
      new THREE.Vector2(rt, t),
      new THREE.Vector2(rt, b),
      new THREE.Vector2(l, b),
    ];
  } else {
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      const out: THREE.Vector2[] = [];
      for (let i = 0; i <= cornerSegments; i++) {
        const a = a0 + ((a1 - a0) * i) / cornerSegments;
        out.push(
          new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)),
        );
      }
      return out;
    };
    const H = Math.PI / 2;
    pts = [
      ...arc(rt - rr, t - rr, H, 0), // TR corner: 90°→0°
      ...arc(rt - rr, b + rr, 0, -H), // BR corner: 0°→-90°
      ...arc(l + rr, b + rr, -H, -Math.PI), // BL corner: -90°→-180°
      ...arc(l + rr, t - rr, Math.PI, H), // TL corner: 180°→90°
    ];
  }
  return clockwise ? pts : pts.slice().reverse();
}
```

- [ ] **Step 4: Rebuild `bezelGeometry` with rounded contours**

Replace the body of `bezelGeometry` (lines 82–103) with:

```ts
export function bezelGeometry(layout: WorldLayout): THREE.ExtrudeGeometry {
  const s = layout.frameSize;
  const b = layout.border;
  const panel = layout.panelSize;
  const shape = new THREE.Shape(
    roundedRectPoints(0, 0, s, s, layout.outerRadius, true),
  );
  shape.holes.push(
    new THREE.Path(
      roundedRectPoints(b, -b, panel, panel, layout.innerRadius, false),
    ),
  );
  return new THREE.ExtrudeGeometry(shape, {
    depth: BEZEL_DEPTH,
    bevelEnabled: false,
  });
}
```

(Keep the existing doc comment above `bezelGeometry` about the clockwise-outer / counter-clockwise-hole winding contract — `roundedRectPoints` honours it.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer3d/__tests__/fiberGeometry.test.ts`
Expected: PASS — including the existing `bezelGeometry` normal-orientation tests (flat side walls at x=0 and x=b survive between the corner arcs).

- [ ] **Step 6: Commit**

```bash
git add src/renderer3d/fiberGeometry.ts src/renderer3d/__tests__/fiberGeometry.test.ts
git commit -m "feat: round the 3D bezel corners to match the 2D renderer"
```

---

### Task 6: 3D renderer wiring

Feed the new settings into the stateful 3D scene: layout args, bezel standoff in z, and the rebuild cache key.

**Files:**
- Modify: `src/renderer3d/wall3d.ts` (Wall3DState, rebuild, cache key)
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` (`draw()` wall3d render call)

**Interfaces:**
- Consumes: `computeWorldLayout(..., frameWidthMm, cornerRadiusMm, frameOffsetCm)` from Task 4; `StudioState` fields from Task 1.
- Produces: `Wall3DState` gains `cornerRadius: number`, `frameWidth: number`, `frameOffset: number`.

- [ ] **Step 1: Extend `Wall3DState`**

In `src/renderer3d/wall3d.ts`, add to `interface Wall3DState` (after `boardPadding: number;`, ~line 30):

```ts
  cornerRadius: number;
  frameWidth: number;
  frameOffset: number;
```

- [ ] **Step 2: Pass the new args to `computeWorldLayout` in `rebuild`**

In `rebuild`, update the `computeWorldLayout` call (~line 154):

```ts
    layout = computeWorldLayout(
      state.gridSize,
      state.frameSize,
      state.frameGap,
      state.boardPadding,
      state.frameWidth,
      state.cornerRadius,
      state.frameOffset,
    );
```

- [ ] **Step 3: Float the bezel off the board by the offset**

In `rebuild`, in the per-frame bezel loop, change the mesh z (~line 186):

```ts
      mesh.position.set(o.x, o.y, 0);
```

to:

```ts
      mesh.position.set(o.x, o.y, layout.frameOffset);
```

(The board mesh stays at `z = -BOARD_DEPTH/2` with its front face at z=0; fibres already carry the offset from Task 4.)

- [ ] **Step 4: Include the new settings in the rebuild cache key**

In the render function, extend the cache `key` (~line 261):

```ts
    const key = `${state.gridSize}|${state.frameSize}|${state.frameGap}|${state.boardPadding}`;
```

to:

```ts
    const key = `${state.gridSize}|${state.frameSize}|${state.frameGap}|${state.boardPadding}|${state.frameWidth}|${state.cornerRadius}|${state.frameOffset}`;
```

- [ ] **Step 5: Pass the fields from `draw()` in GlowbraidStudio**

In `src/components/glowbraid/GlowbraidStudio.tsx`, in the `wall3dRef.current?.render({ ... })` call inside `draw()`, add (after `boardPadding: s.boardPadding,`, ~line 301):

```ts
        cornerRadius: s.cornerRadius,
        frameWidth: s.frameWidth,
        frameOffset: s.frameOffset,
```

- [ ] **Step 6: Verify types, lint, and full test suite**

Run: `npx tsc --noEmit && npm run check && npm run test`
Expected: all pass.

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev`, switch to 3D view. Bezel corners should now be rounded (matching 2D). Temporarily bumping `INITIAL_STATE.frameOffset` (then reverting) should visibly lift the frames + their fibres off the board slab, leaving a gap. Confirm no console errors and camera still frames the wall.

- [ ] **Step 8: Commit**

```bash
git add src/renderer3d/wall3d.ts src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: wire corner radius, width, and offset into the 3D scene"
```

---

### Task 7: UI controls

Add the three sliders to the left panel and wire them to `patch`.

**Files:**
- Modify: `src/components/glowbraid/LeftPanel.tsx` (props + sliders)
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` (LeftPanel props)

**Interfaces:**
- Consumes: `StudioState` fields + `patch` from Task 1.
- Produces: `LeftPanelProps` gains `cornerRadius`, `onCornerRadius`, `frameWidth`, `onFrameWidth`, `frameOffset`, `onFrameOffset`.

- [ ] **Step 1: Extend `LeftPanelProps`**

In `src/components/glowbraid/LeftPanel.tsx`, add to `interface LeftPanelProps` (after `onBoardPadding: (n: number) => void;`):

```ts
  cornerRadius: number;
  onCornerRadius: (n: number) => void;
  frameWidth: number;
  onFrameWidth: (n: number) => void;
  frameOffset: number;
  onFrameOffset: (n: number) => void;
```

- [ ] **Step 2: Add the three sliders**

In `LeftPanel.tsx`, after the "Board padding" `SliderRow` block (the one ending just before the "Show measurements" label), insert:

```tsx
      <SliderRow label="Frame width" value={`${props.frameWidth} mm`}>
        <input
          type="range"
          aria-label="Frame width"
          min={1}
          max={props.frameSize * 5 - 1}
          step={1}
          value={props.frameWidth}
          onChange={(e) => props.onFrameWidth(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Corner radius" value={`${props.cornerRadius} mm`}>
        <input
          type="range"
          aria-label="Corner radius"
          min={0}
          max={props.frameSize * 5}
          step={1}
          value={props.cornerRadius}
          onChange={(e) => props.onCornerRadius(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Frame offset" value={`${props.frameOffset} cm`}>
        <input
          type="range"
          aria-label="Frame offset"
          min={0}
          max={10}
          step={0.5}
          value={props.frameOffset}
          onChange={(e) => props.onFrameOffset(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>
```

- [ ] **Step 3: Pass the props from GlowbraidStudio**

In `src/components/glowbraid/GlowbraidStudio.tsx`, in the `<LeftPanel ... />` JSX, add (after `onBoardPadding={(n) => patch({ boardPadding: n })}`, ~line 600):

```tsx
          cornerRadius={ui.cornerRadius}
          onCornerRadius={(n) => patch({ cornerRadius: n })}
          frameWidth={ui.frameWidth}
          onFrameWidth={(n) => patch({ frameWidth: n })}
          frameOffset={ui.frameOffset}
          onFrameOffset={(n) => patch({ frameOffset: n })}
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && npm run check`
Expected: both pass.

- [ ] **Step 5: Verify in the running app**

Run: `npm run dev`. Confirm the three new sliders appear in the WALL section. Drag each and observe: corner radius rounds the frames (2D and 3D), frame width thickens the bezel (2D and 3D), frame offset lifts frames off the board (3D only; no change in 2D). Reload the page and confirm the values persisted (autosave round-trip).

- [ ] **Step 6: Commit**

```bash
git add src/components/glowbraid/LeftPanel.tsx src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: add frame width, corner radius, and offset sliders"
```

---

## Self-Review

**Spec coverage:**
- Corner radius (single outer knob, auto inner) → Tasks 2 (2D helper), 3 (2D apply), 4 (3D radii), 5 (3D rounded bezel), 7 (slider). ✓
- Frame width → Tasks 2/3 (2D), 4 (3D border), 7 (slider). ✓
- Frame offset (global, default 2cm, 3D-only) → Tasks 4 (fibre z), 6 (bezel z + cache key), 7 (slider). ✓
- Persistence with legacy fallbacks → Task 1. ✓
- 2D/3D unification → Tasks 3 + 5 both drive off the shared derived rule. ✓
- Tests → Tasks 2, 4, 5 add unit coverage; 3, 6, 7 verify via tsc/app. ✓
- Determinism untouched → no `src/engine/` changes in any task. ✓

**Type consistency:** `frameCornerRadii` returns `{ borderPx, outerPx, innerPx }` (Task 2) used verbatim in Task 3. `WorldLayout.{outerRadius,innerRadius,frameOffset}` (Task 4) consumed by `bezelGeometry` (Task 5) and `rebuild` (Task 6). `computeWorldLayout`'s 7-arg signature (Task 4) matches its call in Task 6. `Wall3DState`/`WallDrawState` field names (`cornerRadius`, `frameWidth`, `frameOffset`) match the `StudioState`/`ProjectSnapshot` fields (Task 1) and the `draw()` call sites (Tasks 3, 6). ✓

**Ordering note:** `tsc --noEmit` is intentionally not run at the Task 4 boundary (wall3d.ts still calls the old signature until Task 6); Task 4 verifies via its own vitest file. Tasks 1–3 are independently type-clean.
