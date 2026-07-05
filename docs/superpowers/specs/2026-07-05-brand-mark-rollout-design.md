# Brand mark rollout — design

Source: Claude Design project "Fiber optic LED wall designer", file `Glowbraid Logo Options.dc.html` (2a-2e). These five sections are one mark — three concentric glowing rings (outer pink `#ff6b9d`, middle cyan `#6bd8ff`, inner purple `#9b8cff`) — shown in different contexts, not five alternative logos. ("Interlocked" in the design's copy is descriptive framing; the actual CSS renders three same-center circles of decreasing radius, and the glow is what reads as braided.)

## Current state

- `src/components/glowbraid/Header.tsx:23` — the only existing "mark" is a plain `<div>` with a `conic-gradient` background, no SVG.
- `src/routes/__root.tsx:8-27` — `head()` sets `<title>` and the stylesheet link only. No `<link rel="icon">`, `apple-touch-icon`, or `manifest` link exists anywhere in the app.
- `public/manifest.json` — references `favicon.ico`, `logo192.png`, `logo512.png` (all exist on disk, unstyled/generic), `theme_color: #000000`, `background_color: #ffffff`.
- No `apple-touch-icon.png` exists.
- No SVG logo asset or Logo/Mark component exists anywhere in `src`.

## Scope

1. Replace the header's conic-gradient div with a real SVG mark (design 2e treatment).
2. Generate real favicon/app-icon rasters from the mark on a dark rounded tile (design 2d treatment), replacing the current generic files.
3. Wire icon/manifest `<link>` tags into `__root.tsx` (currently missing entirely).
4. Update `manifest.json` theme colors to match the dark brand palette.
5. Export the stacked lockup (2b) and light-mode variant (2c) as standalone static SVG assets — no current UI destination, so they're saved as files, not unused React components.

## Asset generation method

Render an HTML/CSS harness that reproduces the design's exact CSS (concentric circles + box-shadow glow) using the Playwright MCP browser tool, screenshot at each target pixel size, then pack the favicon sizes into a multi-res `.ico` with ImageMagick's `convert` (already installed locally). This avoids adding a new dependency (no `sharp`/`resvg` in `package.json`) and avoids ImageMagick's built-in SVG rasterizer, which commonly lacks the `librsvg` delegate and renders gradients/filters poorly.

## Files touched

**New:**
- `src/components/glowbraid/BrandMark.tsx` — SVG React component (concentric rings, sized via prop), used by `Header.tsx`.
- `public/brand/mark.svg` — 2a, rings alone.
- `public/brand/lockup-stacked.svg` — 2b, mark + "GLOWBRAID" wordmark below, for future splash/social use.
- `public/brand/lockup-light.svg` — 2c, deepened ring colors (`#e0447d`/`#1fa3d1`/`#7a63e6`) + "Glowbraid" wordmark, for light backgrounds.
- `public/apple-touch-icon.png` (180×180).

**Regenerated:**
- `public/favicon.ico` (16/32/48 multi-res)
- `public/logo192.png`, `public/logo512.png`

**Edited:**
- `src/components/glowbraid/Header.tsx` — swap the conic-gradient div for `<BrandMark size={26} />`.
- `src/routes/__root.tsx` — add `<link rel="icon" href="/favicon.ico">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<link rel="manifest" href="/manifest.json">`.
- `public/manifest.json` — `theme_color`/`background_color` → dark brand (`#0b0c0f`).

## Icon background treatment

- `favicon.ico`, `logo192.png`, `logo512.png`: dark rounded-square tile (`#0b0c0f` background, corner radius ≈ 25% of size) behind the rings, matching design 2d exactly.
- `apple-touch-icon.png`: **plain full-bleed square**, same dark background and centered rings, but **no pre-rounded corners** — iOS applies its own mask, and pre-rounding causes visible double-rounding/letterboxing. This is a platform convention, not a new design call.

## Out of scope

- No light-mode theme toggle exists in the app; `lockup-light.svg` is exported as an asset only, not wired into any UI.
- No splash/loading screen exists; `lockup-stacked.svg` is exported as an asset only.
- No maskable-icon safe-zone variant — standard icons only (YAGNI; nothing in the app currently requests a maskable icon).

## Verification

- `npm run check` (Biome) passes.
- Dev server renders the new header mark correctly in place of the old conic-gradient div.
- Browser tab shows the new favicon; inspect `public/favicon.ico`, `logo192.png`, `logo512.png`, `apple-touch-icon.png` visually to confirm the tile/glow rendering matches the design at each size.
