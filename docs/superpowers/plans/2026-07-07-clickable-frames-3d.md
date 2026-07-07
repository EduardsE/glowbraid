# Clickable Frames in 3D Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wall frames selectable in the 3D installation view at full parity with the 2D sim view — click selects a frame (opening the Inspector and unlocking per-frame controls) and glows an outline around it; click empty space deselects.

**Architecture:** Picking uses one invisible `THREE.PlaneGeometry` per frame (sized to the frame's full square, tagged with `userData.frameIndex`) as dedicated raycast targets; a pure helper computes each plane's world position from the existing `WorldLayout`. A GL-canvas pointer handler distinguishes a click from an orbit-drag and reuses the exact `selectedFrame` React state update the 2D view already performs, so the Inspector, re-seed, frame-colour and connection-map light up for free. The selected frame is highlighted by a single bloom-lit line-loop overlay.

**Tech Stack:** TypeScript, three.js (`renderer3d/`), React (`components/glowbraid/`), Vitest, Biome.

## Global Constraints

- **Layering:** engine → renderer → UI; imports point left only. This feature touches `src/renderer3d/` and `src/components/glowbraid/` only. **No engine changes.**
- **No new randomness / no `ProjectSnapshot` fields** — the persistence contract and `fibers.ts` RNG draw order are untouched.
- **Animation-frequency data stays in refs; UI chrome stays in `ui` state.** Selection is `ui.selectedFrame` (already `useState`), unchanged.
- **Vitest covers pure `.ts` helpers only** (`vitest.config.ts` picks up `src/**/*.test.ts`). The GL glue in `wall3d.ts` and the React glue in `GlowbraidStudio.tsx` stay untested, matching the existing `renderer3d`/component split.
- World layout is centimetres; the board front face is at `z = 0`, frames stand off at `z = layout.frameOffset`, bezels extrude `BEZEL_DEPTH` (2 cm) toward the viewer. Within a frame, world y is **y-down**: `frameOrigin` returns the outer **top-left** corner, and the square extends to `(origin.x + frameSize, origin.y - frameSize)`.

---

### Task 1: Pure pick-plane placement helper (`frameSquarePlane`)

The one automated-test seam: given the layout and a frame index, return the world-space centre and edge length of that frame's full square. `wall3d` uses it to position each invisible pick-plane; the test locks the y-down convention so a future change to `frameOrigin` can't silently shift picking.

**Files:**
- Modify: `src/renderer3d/fiberGeometry.ts` (add export after `frameOrigin`, ~line 85)
- Test: `src/renderer3d/__tests__/fiberGeometry.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `WorldLayout`, `frameOrigin(layout, index)` (existing, same file).
- Produces: `frameSquarePlane(layout: WorldLayout, index: number): { cx: number; cy: number; size: number }` — `cx/cy` is the square's centre in world cm, `size` is the frame edge length (`layout.frameSize`). Task 2 consumes this.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer3d/__tests__/fiberGeometry.test.ts`. Add `frameSquarePlane` to the existing import block from `"../fiberGeometry"`, then add:

```ts
describe("frameSquarePlane", () => {
  // layout = computeWorldLayout(2, 25, 20, 4, 8, 15, 2): boardSize 60, gap 2cm.
  // Frame 0 outer top-left = frameOrigin(layout, 0) = (-26, 26); square is 25cm.
  it("centres the plane on the frame square (y-down convention)", () => {
    const p = frameSquarePlane(layout, 0);
    expect(p.cx).toBeCloseTo(-26 + 25 / 2, 6); // -13.5
    expect(p.cy).toBeCloseTo(26 - 25 / 2, 6); // 13.5
    expect(p.size).toBe(25);
  });

  it("steps adjacent frames one pitch (frameSize + gap) apart", () => {
    const a = frameSquarePlane(layout, 0);
    const b = frameSquarePlane(layout, 1); // next column
    const c = frameSquarePlane(layout, 2); // next row (2x2 grid)
    expect(b.cx - a.cx).toBeCloseTo(25 + 2, 6); // +pitch in x
    expect(b.cy).toBeCloseTo(a.cy, 6);
    expect(c.cy - a.cy).toBeCloseTo(-(25 + 2), 6); // rows step downward
    expect(c.cx).toBeCloseTo(a.cx, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer3d/__tests__/fiberGeometry.test.ts`
Expected: FAIL — `frameSquarePlane is not a function` (or an import/type error).

- [ ] **Step 3: Write minimal implementation**

In `src/renderer3d/fiberGeometry.ts`, add directly after `frameOrigin` (after ~line 85):

```ts
/**
 * World-space centre and edge length of frame `index`'s full square (bezel +
 * light panel), for positioning an invisible pick-plane. Mirrors the y-down
 * convention: `frameOrigin` gives the outer top-left, so the centre is half a
 * frame right and half a frame *down* (−y).
 */
export function frameSquarePlane(
  layout: WorldLayout,
  index: number,
): { cx: number; cy: number; size: number } {
  const o = frameOrigin(layout, index);
  const half = layout.frameSize / 2;
  return { cx: o.x + half, cy: o.y - half, size: layout.frameSize };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer3d/__tests__/fiberGeometry.test.ts`
Expected: PASS (all existing tests in the file still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/renderer3d/fiberGeometry.ts src/renderer3d/__tests__/fiberGeometry.test.ts
git commit -m "feat: add frameSquarePlane helper for 3D pick-planes"
```

---

### Task 2: Picking in 3D (pick-planes + `pick()` + studio pointer wiring)

Delivers the observable behaviour: clicking a frame in 3D selects it (Inspector opens, re-seed/frame-colour unlock); dragging to orbit does not; clicking empty space deselects. Spans `wall3d.ts` (raycast target + method) and `GlowbraidStudio.tsx` (pointer handler) because the wiring is what makes `pick()` observable — one behaviour, one test cycle.

**Files:**
- Modify: `src/renderer3d/wall3d.ts` — `Wall3D` interface (~line 49-55), imports (~line 18-24), renderer scope vars (~line 130-145), `rebuild()` (~line 203-214, after the bezel loop), returned object (~line 332-349)
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` — imports (line 1), a new ref + two handlers (near other `useCallback`s ~line 455-480), the GL `<canvas>` JSX (~line 711-714)

**Interfaces:**
- Consumes: `frameSquarePlane` (Task 1); existing `BEZEL_DEPTH` export and `frameOrigin` from `./fiberGeometry`; existing module-scope `canvas`, `camera`, `group`, `layout` in `wall3d.ts`.
- Produces: `Wall3D.pick(clientX: number, clientY: number): number | null` — returns the hit frame index or `null`. Task 3 relies on the same `Wall3DState`/`render` object it extends.

- [ ] **Step 1: Extend the `Wall3D` interface and imports in `wall3d.ts`**

Add `BEZEL_DEPTH` and `frameSquarePlane` to the existing import from `"./fiberGeometry"` (currently imports `bezelGeometry, computeWorldLayout, fiberWorldPoints, frameOrigin, type WorldLayout`):

```ts
import {
  BEZEL_DEPTH,
  bezelGeometry,
  computeWorldLayout,
  fiberWorldPoints,
  frameOrigin,
  frameSquarePlane,
  type WorldLayout,
} from "./fiberGeometry";
```

Add `pick` to the `Wall3D` interface (after `dispose(): void;`):

```ts
export interface Wall3D {
  render(state: Wall3DState): void;
  resetCamera(): void;
  dollyIn(): void;
  dollyOut(): void;
  pick(clientX: number, clientY: number): number | null;
  dispose(): void;
}
```

- [ ] **Step 2: Add pick-plane scope state and raycaster in `createWall3D`**

In the `--- mutable wall state ---` block (near the `let bezelMats` / `let colorArray` declarations, ~line 135), add:

```ts
  let pickPlanes: THREE.Mesh[] = [];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
```

- [ ] **Step 3: Build the invisible pick-planes in `rebuild()`**

In `rebuild()`, immediately after the bezel-building `for` loop (right after `group.add(mesh);` closes that loop, ~line 214), add:

```ts
    // Invisible per-frame pick targets. visible:false meshes are skipped by
    // the renderer but are still hit by Raycaster, so they cost no draw work.
    // Placed at the bezel front to minimise click parallax vs. the raised frame.
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    pickPlanes = [];
    for (let i = 0; i < state.frames.length; i++) {
      const sq = frameSquarePlane(layout, i);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sq.size, sq.size), pickMat);
      mesh.visible = false;
      mesh.position.set(sq.cx, sq.cy, layout.frameOffset + BEZEL_DEPTH);
      mesh.userData.frameIndex = i;
      group.add(mesh);
      pickPlanes.push(mesh);
    }
```

(`disposeGroup()` already traverses `group` and disposes every non-`fiberMat` geometry and material, so these planes and their shared `pickMat` are cleaned up on each rebuild — no extra teardown needed. `pickPlanes` is reassigned fresh here each rebuild.)

- [ ] **Step 4: Add the `pick` function and expose it**

Add a `pick` function inside `createWall3D` (e.g. just before `function render`):

```ts
  function pick(clientX: number, clientY: number): number | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickPlanes, false);
    if (hits.length === 0) return null;
    const idx = hits[0].object.userData.frameIndex;
    return typeof idx === "number" ? idx : null;
  }
```

Add `pick,` to the returned object (alongside `render, resetCamera, dollyIn, dollyOut`):

```ts
  return {
    render,
    resetCamera,
    dollyIn: () => dolly(1 / DOLLY_STEP),
    dollyOut: () => dolly(DOLLY_STEP),
    pick,
    dispose: () => {
```

- [ ] **Step 5: Verify the renderer compiles and unit tests still pass**

Run: `npm run build`
Expected: type-checks and builds with no errors.
Run: `npm run test`
Expected: PASS (existing suite unaffected).

- [ ] **Step 6: Add the click-vs-drag pointer handler in the studio**

In `src/components/glowbraid/GlowbraidStudio.tsx`, change line 1 to also import `PointerEvent`:

```ts
import type { MouseEvent, PointerEvent } from "react";
```

Add a module constant next to `const DURATION = 12;` (line 30):

```ts
/** Max pointer travel (client px) between down and up to count as a click, not an orbit-drag. */
const CLICK_DRAG_PX = 4;
```

Add a ref alongside the other refs (near `const glCanvasRef` / `const wall3dRef`, ~line 281-283):

```ts
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
```

Add two handlers near the other `useCallback`s (e.g. after the `useCanvasInteraction(...)` block that ends ~line 480):

```ts
  const handleGlPointerDown = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    // Only the primary button starts a potential select; right-drag is pan.
    pointerDownRef.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  }, []);

  const handleGlPointerUp = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!down || e.button !== 0) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DRAG_PX) return;
    const index = wall3dRef.current?.pick(e.clientX, e.clientY) ?? null;
    setUi((prev) => ({ ...prev, selectedFrame: index, selectedFiber: null }));
  }, []);
```

- [ ] **Step 7: Wire the handlers onto the GL canvas**

In the JSX, add the two handlers to the GL `<canvas>` (the one with `ref={glCanvasRef}`, ~line 711-714):

```tsx
          <canvas
            ref={glCanvasRef}
            onPointerDown={handleGlPointerDown}
            onPointerUp={handleGlPointerUp}
            className={`absolute inset-0 block h-full w-full cursor-grab ${mode3dActive ? "" : "hidden"}`}
          />
```

- [ ] **Step 8: Verify build/lint and manually smoke-test selection**

Run: `npm run build && npm run check`
Expected: no type or lint errors.

Manual (Run: `npm run dev`, open http://localhost:3000):
- Switch to 3D mode. Click a frame → the Inspector panel populates with that frame's readout and the frame controls (re-seed, frame colour) act on it. The connection map appears.
- Orbit-drag across a frame → selection does **not** change.
- Click empty board/background → Inspector clears (deselected).
- Confirm 2D sim mode selection still works unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/renderer3d/wall3d.ts src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: select frames by clicking in 3D mode"
```

---

### Task 3: Glowing selection outline in 3D

Adds the visual highlight: a single bloom-lit line-loop tracing the selected frame's outer edge, rebuilt when the selection or layout changes and removed on deselect.

**Files:**
- Modify: `src/renderer3d/wall3d.ts` — `Wall3DState` interface (~line 26-47), a `SELECT_COLOR` constant + `roundedRectPoints` import, outline scope state + helpers, a call in `render()`, `disposeGroup()`
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` — the `wall3dRef.current?.render({...})` call (~line 350-369)

**Interfaces:**
- Consumes: `frameSquarePlane`/`frameOrigin`, `BEZEL_DEPTH` (from Task 2 imports), `roundedRectPoints` (existing export in `fiberGeometry.ts`), existing `layout`, `scene`, `disposeGroup`.
- Produces: `Wall3DState.selectedFrame: number | null` — the frame to outline; the studio passes `s.selectedFrame` into `render`.

- [ ] **Step 1: Add `selectedFrame` to `Wall3DState` and `roundedRectPoints` import**

Add to the `Wall3DState` interface (after `frameColors: (string | null)[];`, ~line 41):

```ts
  /** Frame index to outline as selected, or null for none. */
  selectedFrame: number | null;
```

Add `roundedRectPoints` to the `"./fiberGeometry"` import block (from Task 2):

```ts
import {
  BEZEL_DEPTH,
  bezelGeometry,
  computeWorldLayout,
  fiberWorldPoints,
  frameOrigin,
  frameSquarePlane,
  roundedRectPoints,
  type WorldLayout,
} from "./fiberGeometry";
```

- [ ] **Step 2: Add the accent constant and outline scope state**

Add near the other tuning constants (by `BLOOM_THRESHOLD`, ~line 70):

```ts
/** Selection outline colour — bright enough that UnrealBloomPass blooms it into a glow. */
const SELECT_COLOR = 0x6cf0ff;
/** Outline outset beyond the frame's outer edge, cm. */
const SELECT_OUTSET = 0.4;
```

Add outline state in the mutable-state block (near `pickPlanes`, ~line 135):

```ts
  let outline: THREE.LineLoop | null = null;
  let outlineFrame: number | null = null;
```

- [ ] **Step 3: Add the outline build/dispose helpers**

Add these two functions inside `createWall3D` (e.g. just before `function pick`):

```ts
  function disposeOutline(): void {
    if (outline) {
      scene.remove(outline);
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      outline = null;
    }
    outlineFrame = null;
  }

  function buildOutline(index: number): void {
    disposeOutline();
    const o = frameOrigin(layout, index);
    const m = SELECT_OUTSET;
    const pts = roundedRectPoints(
      o.x - m,
      o.y + m,
      layout.frameSize + 2 * m,
      layout.frameSize + 2 * m,
      layout.outerRadius + m,
      true,
    );
    const z = layout.frameOffset + BEZEL_DEPTH + 0.05;
    const geo = new THREE.BufferGeometry().setFromPoints(
      pts.map((p) => new THREE.Vector3(p.x, p.y, z)),
    );
    const mat = new THREE.LineBasicMaterial({
      color: SELECT_COLOR,
      toneMapped: false,
    });
    outline = new THREE.LineLoop(geo, mat);
    scene.add(outline);
    outlineFrame = index;
  }
```

- [ ] **Step 4: Force outline refresh on rebuild, and drive it from `render()`**

In `disposeGroup()` (which `rebuild()` calls, so a layout change re-derives the outline at the new positions), add `disposeOutline();` — e.g. right after `boardTex = null;`:

```ts
    boardTex?.dispose();
    boardTex = null;
    disposeOutline();
```

In `render()`, after the `if (colorAttr) { ... }` block and before `controls.update();` (~line 309), add:

```ts
    const sel =
      state.selectedFrame != null && state.selectedFrame < state.frames.length
        ? state.selectedFrame
        : null;
    if (sel == null) {
      if (outline) disposeOutline();
    } else if (sel !== outlineFrame) {
      buildOutline(sel);
    }
```

(No change needed to `dispose()` — it already calls `disposeGroup()`, which now calls `disposeOutline()`.)

- [ ] **Step 5: Pass `selectedFrame` into the 3D render call from the studio**

In `src/components/glowbraid/GlowbraidStudio.tsx`, in the `wall3dRef.current?.render({ ... })` object (~line 350-369), add after `frameColors: s.frameColors,`:

```ts
        frameColors: s.frameColors,
        selectedFrame: s.selectedFrame,
```

- [ ] **Step 6: Verify build/lint and manually confirm the glow**

Run: `npm run build && npm run check && npm run test`
Expected: no errors; tests pass.

Manual (`npm run dev`, 3D mode):
- Click a frame → a glowing cyan outline appears around it. Click another → the outline moves. Click empty space → the outline disappears.
- With a frame selected, change grid size → the outline stays on a valid frame (or clears if the index no longer exists) and sits correctly on the rebuilt wall.
- Orbit the camera → the outline stays glued to the frame's front edge.

- [ ] **Step 7: Commit**

```bash
git add src/renderer3d/wall3d.ts src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: glow an outline around the selected frame in 3D"
```

---

### Task 4: Update CLAUDE.md

Bring the architecture note in line with reality — 3D is no longer view-only.

**Files:**
- Modify: `CLAUDE.md` (the `src/renderer3d/` bullet under Architecture)

- [ ] **Step 1: Edit the renderer3d description**

In `CLAUDE.md`, in the `src/renderer3d/` bullet, replace the sentence:

```
View-only: no picking; camera state is session-only.
```

with:

```
Frame picking via invisible per-frame pick-planes (`frameSquarePlane` + a Raycaster in `wall3d.ts`) drives the same `selectedFrame` selection the 2D view uses; camera state is session-only.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note 3D frame picking in CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- Behaviour table (select on frame click, deselect on empty, drag ignored) → Task 2 (pointer handler + `pick`). ✓
- Approach C invisible per-frame pick-planes → Task 2, Step 3. ✓
- Pure tested helper (`fiberGeometry.ts`) → Task 1 (`frameSquarePlane`, reconciled with approach C: it positions the pick-planes rather than mapping point→index, since C reads `userData.frameIndex` directly). ✓
- `Wall3D.pick` + NDC via `getBoundingClientRect` → Task 2, Step 4. ✓
- Click-vs-drag threshold alongside OrbitControls → Task 2, Steps 6–7. ✓
- `selectedFrame` in `Wall3DState`, glowing bloom-lit outline overlay, cleared on null, single object → Task 3. ✓
- Studio passes `selectedFrame` into `render`; reuses the 2D `selectedFrame`/`selectedFiber:null` update → Task 2 (state update) + Task 3 (render wiring). ✓
- Out-of-range selected index guarded → Task 3, Step 4 (`sel < state.frames.length`); studio lookups already guard with `?? null`. ✓
- Docs update → Task 4. ✓
- Non-goals (fibre picking, camera focus, touch, persistence/RNG) → not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type consistency:** `frameSquarePlane` returns `{cx, cy, size}` — produced in Task 1, consumed identically in Task 2, Step 3. `pick(clientX, clientY): number | null` — declared (Task 2, Step 1) and implemented (Step 4) with matching signature; called with `e.clientX, e.clientY` in the studio. `Wall3DState.selectedFrame: number | null` — added in Task 3, Step 1; supplied by the studio in Task 3, Step 5. `disposeOutline`/`buildOutline`/`outlineFrame` names consistent across Task 3 steps. `BEZEL_DEPTH`, `roundedRectPoints`, `frameSquarePlane` all exist/are exported in `fiberGeometry.ts`. ✓
