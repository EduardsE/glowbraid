# Start Screen (Empty-State Preset Card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder empty-state screen with the real
preset-card start screen from the design source: a glass card (badge,
heading, subhead, 2×2 preset grid, dashed blank-random-wall button) over a
larger/dimmer ambient showcase frame.

**Architecture:** Pure UI + one new state handler — no engine changes. Four
static preset defs (`{ name, sub, gridSize, palette, anim }`) render as
buttons in a rewritten `EmptyState.tsx`; clicking one calls a new
`handlePreset` in `FilamentStudio.tsx` that reseeds and configures the wall
exactly like the existing `handleGridSize`/`handleGenerate` handlers do.
`wallRenderer.ts`'s ambient backdrop grows and dims to match the new design.

**Tech Stack:** React 19, Tailwind v4 (arbitrary-value utility classes,
no new CSS files), TypeScript, Vitest (existing engine tests only — no new
test files, per Global Constraints below).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-start-screen-design.md`.
- Reference markup/logic: `docs/reference/filament-studio.dc.html` (already
  re-synced — read the `<sc-if value="{{ empty }}">` block and the
  `vgrad`/`presetDefs`/`startPresets`/`drawShowcase` code inside
  `renderVals()`/the class body for exact values).
- Presets carry only `{ gridSize, palette, anim }` — no `density` field (the
  engine has no fiber-count knob; see spec's "Decision" section).
- Match Tailwind arbitrary-value styling conventions already used in
  `src/components/filament/LeftPanel.tsx`, `Header.tsx`, `InspectorPanel.tsx`
  (bracket syntax for exact colors/radii/spacing, `font-smono`/`font-grotesk`
  utility classes from `src/styles.css`, no inline `style=` props).
- No new test files: this repo has no React component test precedent
  (`find src/components -iname "*.test.*"` is empty; only
  `src/engine/__tests__/fibers.test.ts` exists). Verify via `npx tsc --noEmit`,
  `pnpm test` (existing engine suite must stay green), `pnpm run build`, and
  manual dev-server click-through.
- Out of scope: engine (`fibers.ts`, `palettes.ts`, `animation.ts`), other
  panels (`Header.tsx`, `LeftPanel.tsx`, `InspectorPanel.tsx`,
  `TransportBar.tsx`), `storage.ts`, and the non-empty wall render path.

---

### Task 1: Remove the unused `fil-float` keyframe

**Files:**
- Modify: `src/styles.css:161-170`

**Interfaces:** None — pure deletion, no other file references this rule
(confirmed: `grep -rn "fil-float" src` currently matches only
`src/styles.css:162` and `src/components/filament/EmptyState.tsx:4`, and
Task 3 removes the latter).

- [ ] **Step 1: Delete the keyframes block**

Open `src/styles.css`. Lines 161–170 are:

```css

@keyframes fil-float {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-6px);
	}
}
```

Delete all of it (including the leading blank line at 161), so the file
ends cleanly after the `.font-smono { ... }` rule (line 160: `}`).

- [ ] **Step 2: Verify no dangling references**

Run: `grep -rn "fil-float" src`
Expected: no output (Task 3 will remove the one remaining reference in
`EmptyState.tsx`; if run before Task 3, exactly one match in
`EmptyState.tsx:4` is expected and fine).

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "chore: remove unused fil-float keyframe"
```

---

### Task 2: Port the ambient showcase backdrop sizing

**Files:**
- Modify: `src/renderer/wallRenderer.ts:167-193` (the `ShowcaseOptions`
  interface and `drawShowcaseFrame` function)
- Modify: `src/components/filament/FilamentStudio.tsx:150-164` (the `draw`
  callback's `empty` branch)

**Interfaces:**
- Consumes: `drawFrame` (private to `wallRenderer.ts`, unchanged signature),
  `generateFrame` from `src/engine/fibers.ts` (unchanged signature
  `(seed: number, style?: FiberStyle) => Frame`).
- Produces: `drawShowcaseFrame(ctx, width, height, frame, opts)` — same
  exported signature, changed internals only. No other file calls this
  function outside `FilamentStudio.tsx`.

- [ ] **Step 1: Resize and dim the showcase frame in `wallRenderer.ts`**

In `src/renderer/wallRenderer.ts`, replace the `drawShowcaseFrame` body
(currently lines 176-193):

```ts
/** Single centered demo frame behind the empty-state overlay. */
export function drawShowcaseFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  opts: ShowcaseOptions,
): void {
  const sz = Math.min(width, height) * 0.44;
  const x = width / 2 - sz / 2;
  const y = height / 2 - sz / 2 - 10;
  drawFrame(ctx, x, y, sz, frame, {
    selected: false,
    selectedFiber: null,
    edit: false,
    gpos: 0.5,
    ...opts,
  });
}
```

with:

```ts
/** Single centered demo frame behind the empty-state overlay. */
export function drawShowcaseFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  opts: ShowcaseOptions,
): void {
  const sz = Math.min(width, height) * 0.72;
  const x = width / 2 - sz / 2;
  const y = height / 2 - sz / 2;
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawFrame(ctx, x, y, sz, frame, {
    selected: false,
    selectedFiber: null,
    edit: false,
    gpos: 0.5,
    ...opts,
  });
  ctx.restore();
}
```

(Size `0.44 → 0.72`, drop the `- 10` y-offset, wrap the draw in
`globalAlpha = 0.85`. Ports `drawShowcase(ctx)` from
`docs/reference/filament-studio.dc.html`.)

- [ ] **Step 2: Change the showcase seed in `FilamentStudio.tsx`**

In `src/components/filament/FilamentStudio.tsx`, inside the `draw` callback,
find:

```ts
    if (s.empty) {
      if (!showcaseRef.current) {
        showcaseRef.current = generateFrame(2024, styleOf(s));
      }
```

Change `2024` to `51840` (matches the source's `genFrame(51840, 12)` — the
density argument `12` has no equivalent in this engine's
`(seed, style)` signature, per the spec's dropped-`density` decision):

```ts
    if (s.empty) {
      if (!showcaseRef.current) {
        showcaseRef.current = generateFrame(51840, styleOf(s));
      }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual visual check**

Run: `pnpm dev`, open the app in a browser. The empty-state background frame
should appear noticeably larger (about 72% of the shorter viewport
dimension) and slightly translucent (85% opacity) compared to before.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wallRenderer.ts src/components/filament/FilamentStudio.tsx
git commit -m "feat(renderer): enlarge and dim the empty-state showcase backdrop"
```

---

### Task 3: Rewrite `EmptyState.tsx` with the preset-card design

**Files:**
- Modify: `src/components/filament/EmptyState.tsx` (full rewrite)

**Interfaces:**
- Consumes: `PaletteId`, `AnimationId` from `@/engine/types`; `PALETTES`
  from `@/engine/palettes` (each entry has `.stops: RGB[]`, `RGB = [number,
  number, number]`).
- Produces:
  ```ts
  export interface EmptyStatePreset {
    gridSize: number;
    palette: PaletteId;
    anim: AnimationId;
  }
  export function EmptyState(props: {
    onPreset: (preset: EmptyStatePreset) => void;
    onStart: () => void;
  }): JSX.Element
  ```
  Task 4 imports `EmptyState` and the `EmptyStatePreset` type from this
  file.

- [ ] **Step 1: Replace the file contents**

Overwrite `src/components/filament/EmptyState.tsx` with:

```tsx
import { PALETTES } from "@/engine/palettes";
import type { AnimationId, PaletteId } from "@/engine/types";

export interface EmptyStatePreset {
  gridSize: number;
  palette: PaletteId;
  anim: AnimationId;
}

interface PresetDef extends EmptyStatePreset {
  name: string;
  sub: string;
}

const PRESET_DEFS: PresetDef[] = [
  {
    name: "Aurora Loft",
    gridSize: 3,
    palette: "aurora",
    anim: "flow",
    sub: "3×3 · Flowing",
  },
  {
    name: "Neon Booth",
    gridSize: 2,
    palette: "neon",
    anim: "rainbow",
    sub: "2×2 · Rainbow",
  },
  {
    name: "Sunset Hall",
    gridSize: 4,
    palette: "sunset",
    anim: "gradient",
    sub: "4×4 · Gradient",
  },
  {
    name: "Ember Nook",
    gridSize: 2,
    palette: "ember",
    anim: "breathe",
    sub: "2×2 · Breathing",
  },
];

/** Vertical CSS gradient across a palette's stops, for the preset bar. */
function verticalGradient(paletteId: PaletteId): string {
  const stops = PALETTES[paletteId].stops;
  const stopList = stops
    .map(
      ([r, g, b], i) =>
        `rgb(${r},${g},${b}) ${Math.round((i / (stops.length - 1)) * 100)}%`,
    )
    .join(",");
  return `linear-gradient(180deg,${stopList})`;
}

export function EmptyState({
  onPreset,
  onStart,
}: {
  onPreset: (preset: EmptyStatePreset) => void;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center p-7 [background:radial-gradient(70%_70%_at_50%_45%,rgba(10,11,14,0.05),rgba(10,11,14,0.62))]">
      <div className="flex w-[min(548px,94%)] flex-col gap-4 rounded-[20px] border border-white/[0.09] bg-[rgba(11,12,16,0.74)] px-[26px] pt-6 pb-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-[18px]">
        <div className="flex flex-col gap-[9px]">
          <span className="font-smono self-start rounded-full border border-[rgba(155,140,255,0.35)] px-[11px] py-[5px] text-[10px] tracking-[0.16em] text-[#c1b6ff]">
            NEW PROJECT
          </span>
          <div className="text-2xl leading-[1.12] font-semibold tracking-[-0.01em]">
            Design light that flows.
          </div>
          <div className="max-w-[440px] text-[12.5px] leading-[1.55] text-[rgba(233,234,240,0.55)]">
            Hidden LEDs around each frame inject colour into passive
            side-glow fibres. Pick a starting point below — you can reshape
            the wall anytime.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[10px]">
          {PRESET_DEFS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onPreset(preset)}
              className="flex min-h-[56px] cursor-pointer items-stretch gap-[11px] rounded-[13px] border border-white/[0.08] bg-white/[0.02] px-3 py-[11px] text-left transition-colors hover:border-[rgba(155,140,255,0.5)] hover:bg-[rgba(155,140,255,0.08)]"
            >
              <span
                className="block w-1.5 flex-none rounded-md shadow-[0_0_14px_rgba(155,140,255,0.25)]"
                style={{ background: verticalGradient(preset.palette) }}
              />
              <span className="flex flex-col items-start justify-center gap-[3px]">
                <span className="text-[13px] font-semibold text-white">
                  {preset.name}
                </span>
                <span className="font-smono text-[10.5px] tracking-[0.02em] text-[rgba(233,234,240,0.45)]">
                  {preset.sub}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onStart}
          className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-dashed border-white/[0.16] text-[12.5px] font-medium text-[rgba(233,234,240,0.72)] transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          ✦&nbsp; Start from a blank random wall
        </button>
      </div>
    </div>
  );
}
```

Note: the preset bar's background gradient is the one visual detail that
must stay an inline `style` (it's per-preset dynamic data, not a fixed
Tailwind value) — everything else uses Tailwind arbitrary-value classes to
match the codebase convention.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: fails at this point with errors in `FilamentStudio.tsx` (it still
renders `<EmptyState onStart={handleGenerate} />` without `onPreset` —
that's expected and fixed in Task 4). Confirm the *only* errors are about
the missing `onPreset` prop on `EmptyState` usage, not about anything inside
`EmptyState.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/filament/EmptyState.tsx
git commit -m "feat(ui): rewrite EmptyState as the preset-card start screen"
```

---

### Task 4: Wire `handlePreset` into `FilamentStudio.tsx`

**Files:**
- Modify: `src/components/filament/FilamentStudio.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `EmptyStatePreset` from `./EmptyState` (Task 3);
  existing `rebuild`, `patch`, `randomSeed`, `styleOf`, `ui` from this
  same file (all already defined, unchanged signatures).
- Produces: nothing new consumed elsewhere — `handlePreset` is local to this
  component.

- [ ] **Step 1: Import the preset type**

In `src/components/filament/FilamentStudio.tsx`, change the import:

```ts
import { EmptyState } from "./EmptyState";
```

to:

```ts
import { EmptyState, type EmptyStatePreset } from "./EmptyState";
```

- [ ] **Step 2: Add the `handlePreset` handler**

Directly after the existing `handleGenerate` function (find it — it reads
`const handleGenerate = () => { ... };`), add:

```ts
  const handlePreset = (preset: EmptyStatePreset) => {
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

- [ ] **Step 3: Pass the handler to `EmptyState`**

Find the render line:

```tsx
          {ui.empty ? <EmptyState onStart={handleGenerate} /> : null}
```

Replace with:

```tsx
          {ui.empty ? (
            <EmptyState onPreset={handlePreset} onStart={handleGenerate} />
          ) : null}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the existing test suite**

Run: `pnpm test`
Expected: all existing tests pass (this task touches no engine code, so
`src/engine/__tests__/fibers.test.ts` is unaffected).

- [ ] **Step 6: Production build**

Run: `pnpm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manual click-through**

Run: `pnpm dev`, open the app.

- Confirm the empty state shows the glass card with badge, heading, 2×2
  preset grid, and dashed button, over the enlarged/dimmed ambient frame
  from Task 2.
- Click "Aurora Loft" → confirm the editor opens with a 3×3 grid, Aurora
  palette, Flowing animation.
- Click "Neon Booth" → confirm 2×2, Neon, Rainbow.
- Click "Sunset Hall" → confirm 4×4, Sunset, Gradient.
- Click "Ember Nook" → confirm 2×2, Ember, Breathing.
- Reload the page (empty state resets), click the dashed "Start from a
  blank random wall" button → confirm it enters the editor keeping the
  default 3×3/Sunset/Flowing config with a fresh seed (same behavior as the
  old single "Create New Wall" button).
- Hover each preset card and the dashed button → confirm the border/
  background hover transitions match the design (preset: purple border +
  tint; dashed: white-ish fill + white text).

- [ ] **Step 8: Commit**

```bash
git add src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): wire start-screen presets to the wall generator"
```

---

## Self-Review Notes

- **Spec coverage:** `EmptyState.tsx` rewrite (Task 3) ✓, `FilamentStudio.tsx`
  handler (Task 4) ✓, showcase backdrop resize/alpha/seed (Task 2) ✓,
  `fil-float` cleanup (Task 1) ✓, dropped-`density` decision applied in
  `PRESET_DEFS` (Task 3) ✓, verification plan (manual click-through, Task 4
  Step 7) ✓. No spec section left uncovered.
- **Type consistency:** `EmptyStatePreset` defined once in `EmptyState.tsx`
  (Task 3) and imported by exact name in `FilamentStudio.tsx` (Task 4);
  `handlePreset`'s parameter type and `onPreset`'s callback type match.
  `PaletteId`/`AnimationId` used verbatim from `@/engine/types` throughout.
