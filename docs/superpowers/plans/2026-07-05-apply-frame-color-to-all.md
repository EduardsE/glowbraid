# Apply Frame Color To All Frames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user copy the currently-selected frame's color onto every frame in the wall with one click, from the Inspector panel.

**Architecture:** A new "Apply to all frames" button in `InspectorPanel.tsx`'s frame-color row, disabled when the selected frame has no explicit color. Wired to a new handler in `FilamentStudio.tsx` that fills the existing `frameColors` array with the selected frame's current color. No new data model, persistence, or renderer changes — reuses the `frameColors: (string | null)[]` state added by the prior frame/board color feature.

**Tech Stack:** React + TypeScript, Vitest (repo has no jsdom/component test harness — see Global Constraints).

## Global Constraints

- No bulk "reset all to default" — the button is disabled when the selected frame's color is `null` (default/unset), never applies `null` to all frames.
- No confirmation dialog before applying — consistent with other bulk actions in this app (Re-route fibres, Generate new wall).
- This repo's `vitest.config.ts` only picks up `src/**/*.test.ts` — no `.tsx` component tests exist. This feature has no new pure-function logic, so no new automated test is added; verification is `npm run check` plus manual browser use, per the design's Testing section.

---

### Task 1: "Apply to all frames" button + handler

**Files:**
- Modify: `src/components/filament/InspectorPanel.tsx`
- Modify: `src/components/filament/FilamentStudio.tsx`

**Interfaces:**
- Consumes: existing `InspectorPanelProps.frameColor: string | null` (already defined); existing `StudioState.frameColors: (string | null)[]`, `StudioState.gridSize: number`, `StudioState.selectedFrame: number | null` (all already defined).
- Produces: `InspectorPanelProps.onApplyToAll: () => void`; `FilamentStudio`'s `handleApplyColorToAll` function (no other task depends on these — this is the whole feature).

This task has no new pure-function logic (it's a UI button plus a small event handler that fills an array), matching the existing convention in this codebase that presentational components and simple `FilamentStudio.tsx` event handlers aren't unit tested (see `docs/superpowers/plans/2026-07-05-frame-board-colors-plan.md` Task 3/4 for precedent). Verification is `npm run check`, `npm run test` (regression only), and a manual browser pass.

- [ ] **Step 1: Add `onApplyToAll` to `InspectorPanelProps`**

In `src/components/filament/InspectorPanel.tsx`, add the new prop to the interface, right after the existing `onFrameColor: (c: string) => void;` line (currently line 17):

```ts
  onFrameColor: (c: string) => void;
  onApplyToAll: () => void;
```

- [ ] **Step 2: Add the button below the frame color picker**

In the same file, in `SelectedFrame`, replace the frame-color block (currently lines 86-93):

```tsx
      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-[rgba(233,234,240,0.7)]">Frame color</div>
        <ColorSwatchPicker
          value={props.frameColor}
          onChange={props.onFrameColor}
          ariaLabel="Frame color"
        />
      </div>
```

with:

```tsx
      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-[rgba(233,234,240,0.7)]">Frame color</div>
        <ColorSwatchPicker
          value={props.frameColor}
          onChange={props.onFrameColor}
          ariaLabel="Frame color"
        />
        <button
          type="button"
          onClick={props.onApplyToAll}
          disabled={props.frameColor == null}
          className={
            props.frameColor == null
              ? "cursor-not-allowed self-start text-[11px] text-[rgba(233,234,240,0.3)]"
              : "cursor-pointer self-start text-[11px] text-[#9b8cff] hover:text-white"
          }
        >
          Apply to all frames
        </button>
      </div>
```

- [ ] **Step 3: Add `handleApplyColorToAll` in `FilamentStudio`**

In `src/components/filament/FilamentStudio.tsx`, add this function immediately after `handleFrameColor` (currently lines 351-357):

```ts
  const handleApplyColorToAll = () => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const color = s.frameColors[s.selectedFrame];
    if (color == null) return;
    patch({ frameColors: Array(s.gridSize * s.gridSize).fill(color) });
  };
```

- [ ] **Step 4: Pass the handler into `InspectorPanel`**

In the `<InspectorPanel>` call (currently lines 537-552), add `onApplyToAll={handleApplyColorToAll}` right after `onFrameColor={handleFrameColor}` (currently line 550):

```tsx
          onFrameColor={handleFrameColor}
          onApplyToAll={handleApplyColorToAll}
```

- [ ] **Step 5: Run lint/typecheck**

Run: `npm run check`
Expected: no errors — confirms the new prop is passed and typed consistently on both the `InspectorPanelProps` interface and the `<InspectorPanel>` call site.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS — this task adds no new automated tests, this just confirms no regression.

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev`. Generate a wall (3×3 or larger). Select a frame with no color set yet — confirm "Apply to all frames" renders greyed out/disabled and clicking it does nothing. Give that frame a preset color — confirm the button becomes active (purple text). Click it — confirm every frame on the wall recolors to match. Select a different frame, give it a custom color via the "+" swatch, click "Apply to all frames" again — confirm all frames now show that custom color. Click a frame's ⟳ reseed button — confirm its color (just bulk-applied) is unaffected. Save, reload the page, click Load — confirm every frame's color is restored correctly.

- [ ] **Step 8: Commit**

```bash
git add src/components/filament/InspectorPanel.tsx src/components/filament/FilamentStudio.tsx
git commit -m "feat(ui): add apply-frame-color-to-all button"
```
