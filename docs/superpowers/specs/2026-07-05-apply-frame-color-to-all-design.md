# Apply frame color to all frames — design

## Context

`InspectorPanel.tsx` already lets the user set a per-frame bezel color via `ColorSwatchPicker` (see `docs/superpowers/specs/2026-07-05-frame-board-colors-design.md`). There's currently no quick way to take a color chosen for one frame and apply it to every other frame — the user has to repeat the picker per frame.

## Requirement

Once the currently-selected frame has an explicit color (not the unset/default state), the user can apply that color to every frame in the wall with one action.

## Non-goals

- No bulk "reset all frames to default" — matches the existing frame-color feature's stance (no dedicated reset control anywhere).
- No per-frame confirmation dialog — the action is easily undone by re-picking colors, consistent with how other bulk actions (Re-route fibres, Generate new wall) work without confirmation.
- No new persisted state — this only ever writes into the existing `frameColors` array.

## Data model

No changes. Reuses `StudioState.frameColors: (string | null)[]` (parallel to frame index, `null` = default look).

## UI (`src/components/filament/InspectorPanel.tsx`)

New prop on `InspectorPanelProps`: `onApplyToAll: () => void`.

In `SelectedFrame`, directly below the existing `ColorSwatchPicker` block (frame color row), add a text-button row:

```tsx
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
```

Disabled state is derived from `props.frameColor == null` inside the component — no separate prop needed. When disabled, clicking does nothing (native `disabled` on `<button>`).

## Logic (`src/components/filament/FilamentStudio.tsx`)

New handler next to `handleFrameColor`:

```ts
const handleApplyColorToAll = () => {
  const s = uiRef.current;
  if (s.selectedFrame == null) return;
  const color = s.frameColors[s.selectedFrame];
  if (color == null) return;
  patch({ frameColors: Array(s.gridSize * s.gridSize).fill(color) });
};
```

Wired into the `<InspectorPanel>` call as `onApplyToAll={handleApplyColorToAll}`.

## Persistence & interactions

No changes needed elsewhere:

- `handleSave`/`handleLoad` already serialize/restore the full `frameColors` array.
- Existing reset-on-regenerate logic (grid size change, Reroute, Generate new wall, preset pick) is untouched — this feature only ever writes into `frameColors`, it doesn't change when resets happen.
- Re-seeding a single frame (`handleReseed`) still leaves all frame colors, including ones just bulk-applied, untouched.

## Testing

No new pure-function logic to unit test (the repo's existing convention: presentational components and simple event handlers in `FilamentStudio.tsx` aren't unit tested — see prior spec's testing section). Verification is `npm run check` + manual browser check:

- Select a frame, set a custom color, click "Apply to all frames" — confirm every frame recolors to match.
- With no color set on the selected frame (default), confirm the button renders disabled and does nothing.
- Save, reload, Load — confirm the applied color persists on every frame.
