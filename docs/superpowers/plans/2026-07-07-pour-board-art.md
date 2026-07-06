# Poured-Acrylic Board Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional "Pour" board-art mode that replaces the backing board's flat color with a seeded, procedurally generated acrylic-pour painting, shown in the 2D views and the 3D installation view.

**Architecture:** A pure, DOM-free field module (`src/renderer/pourField.ts`: seeded value noise → fBm → domain warp → Worley cells, composed into an RGBA buffer) plus a thin memoized canvas wrapper (`src/renderer/pourTexture.ts`). The 2D renderer blits the texture for the board and clips per-frame sub-rectangles into the frame panels; the 3D renderer uses it as a `CanvasTexture` on the board material. Three new optional `ProjectSnapshot` fields persist mode/seed/palette. Spec: `docs/superpowers/specs/2026-07-07-pour-board-art-design.md`.

**Tech Stack:** TypeScript, Canvas2D, three.js, Vitest, Biome. No new dependencies.

## Global Constraints

- Engine layer (`src/engine/`) gains only persistence *types* — no pour logic, no React/DOM.
- Randomness comes only from the engine's `hash` (`src/engine/random.ts`); the fibre-generation RNG in `fibers.ts` is never touched (draw order there is load-bearing).
- Do not use `ctx.shadowBlur` or per-frame filter effects anywhere.
- New `WallDrawState` / `Wall3DState` fields are **optional** with "absent → none" behavior so every task compiles and passes tests independently.
- Loader (`buildInitialProject` in `GlowbraidStudio.tsx`) must tolerate absent/invalid values for all three new snapshot fields.
- After each task: `npm run check` must pass (run `npx biome check --write src` to fix formatting) and `npm run test` must pass.
- Commit after every task with a `feat:`/`test:` conventional message.

---

### Task 1: Noise primitives (`pourField.ts` core)

**Files:**
- Create: `src/renderer/pourField.ts`
- Test: `src/renderer/__tests__/pourField.test.ts`

**Interfaces:**
- Consumes: `hash(n: number): number` from `@/engine/random` (stateless, returns [0, 1)).
- Produces (used by Task 2 in the same file):
  - `valueNoise(seed: number, x: number, y: number): number` — smooth noise in [0, 1)
  - `fbm(seed: number, x: number, y: number, octaves: number): number` — [0, 1)
  - `warpPoint(seed: number, x: number, y: number): { x: number; y: number }`
  - `worley(seed: number, x: number, y: number): { f1: number; f2: number }`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/__tests__/pourField.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fbm, valueNoise, warpPoint, worley } from "../pourField";

describe("valueNoise", () => {
  it("is deterministic for identical inputs", () => {
    expect(valueNoise(42, 1.37, 8.62)).toBe(valueNoise(42, 1.37, 8.62));
  });

  it("stays within [0, 1) over a sample grid", () => {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const n = valueNoise(7, x * 0.73, y * 0.51);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it("varies with the seed", () => {
    expect(valueNoise(1, 2.5, 3.5)).not.toBe(valueNoise(2, 2.5, 3.5));
  });

  it("is continuous: a tiny step changes the value only slightly", () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.317 + 0.05;
      const y = i * 0.211 + 0.05;
      const a = valueNoise(9, x, y);
      const b = valueNoise(9, x + 1e-3, y);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });
});

describe("fbm", () => {
  it("is deterministic and within [0, 1)", () => {
    const v = fbm(11, 3.2, 4.7, 4);
    expect(v).toBe(fbm(11, 3.2, 4.7, 4));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe("warpPoint", () => {
  it("is deterministic and displaces the input point", () => {
    const w = warpPoint(5, 1.5, 2.5);
    expect(w).toEqual(warpPoint(5, 1.5, 2.5));
    // Warp must actually move the point (marbling depends on it).
    expect(Math.hypot(w.x - 1.5, w.y - 2.5)).toBeGreaterThan(0.01);
  });
});

describe("worley", () => {
  it("returns 0 <= f1 <= f2 over a sample grid", () => {
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const { f1, f2 } = worley(3, x * 0.61, y * 0.43);
        expect(f1).toBeGreaterThanOrEqual(0);
        expect(f2).toBeGreaterThanOrEqual(f1);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/pourField.test.ts`
Expected: FAIL — `Cannot find module '../pourField'` (or unresolved import).

- [ ] **Step 3: Write the implementation**

Create `src/renderer/pourField.ts`:

```ts
import { hash } from "@/engine/random";

/**
 * Procedural acrylic-pour field — pure math, DOM-free.
 *
 * Marbling comes from domain-warping sample coordinates through layered
 * value noise; cells and "lacing" come from Worley noise evaluated on the
 * warped coordinates (see renderPourRGBA). Everything derives from the
 * engine's stateless `hash`, so a given seed regenerates the identical
 * artwork. Renderer-layer on purpose: the board painting is simulator
 * visual only and never feeds the hardware path.
 */

/** Lattice-point hash decorrelated across integer coordinates and seeds. */
function hash2(seed: number, ix: number, iy: number): number {
  return hash(ix + iy * 57.31 + seed * 0.9871);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smoothly interpolated lattice noise, [0, 1). */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = smooth(x - ix);
  const sy = smooth(y - iy);
  const a = hash2(seed, ix, iy);
  const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy + 1);
  const d = hash2(seed, ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal sum of valueNoise octaves, normalized to [0, 1). */
export function fbm(
  seed: number,
  x: number,
  y: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 101, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** How far coordinates are advected by the warp field (marble intensity). */
const WARP_STRENGTH = 1.6;

/**
 * Two-layer domain warp: the point is displaced by noise that is itself
 * sampled at noise-displaced coordinates, producing the curling flow lines
 * characteristic of a pour.
 */
export function warpPoint(
  seed: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const ax = fbm(seed + 11, x + 3.1, y + 1.7, 3);
  const ay = fbm(seed + 29, x - 2.3, y + 4.9, 3);
  const bx = fbm(seed + 47, x + 4 * ax, y + 4 * ay, 3);
  const by = fbm(seed + 61, x + 4 * ay + 8.2, y + 4 * ax + 2.8, 3);
  return {
    x: x + WARP_STRENGTH * (bx - 0.5) * 2,
    y: y + WARP_STRENGTH * (by - 0.5) * 2,
  };
}

/**
 * Worley (cellular) noise over a jittered unit grid: distances to the
 * nearest (f1) and second-nearest (f2) feature points in the 3×3
 * neighborhood. f2 − f1 → 0 along cell borders.
 */
export function worley(
  seed: number,
  x: number,
  y: number,
): { f1: number; f2: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = Number.POSITIVE_INFINITY;
  let f2 = Number.POSITIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const px = cx + hash2(seed + 7, cx, cy);
      const py = cy + hash2(seed + 13, cx, cy);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/pourField.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Lint/format and commit**

```bash
npx biome check --write src/renderer
npm run check
git add src/renderer/pourField.ts src/renderer/__tests__/pourField.test.ts
git commit -m "feat: add seeded noise primitives for pour board art"
```

---

### Task 2: Pour palettes and `renderPourRGBA`

**Files:**
- Modify: `src/renderer/pourField.ts` (append)
- Test: `src/renderer/__tests__/pourField.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 primitives (`fbm`, `warpPoint`, `worley`) and `RGB` from `@/engine/types`.
- Produces (used by Tasks 3–7):
  - `type PourPaletteId = "tidal" | "magma" | "bubblegum" | "iris"`
  - `interface PourPalette { id: PourPaletteId; name: string; stops: RGB[] }`
  - `POUR_PALETTES: Record<PourPaletteId, PourPalette>`
  - `POUR_PALETTE_IDS: PourPaletteId[]`
  - `samplePourStops(palette: PourPalette, t: number): RGB` — clamped (non-wrapping) piecewise-linear sample
  - `renderPourRGBA(seed: number, palette: PourPalette, width: number, height: number): { pixels: Uint8ClampedArray; averageLuminance: number }` — RGBA, alpha 255, luminance in [0, 1]

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/__tests__/pourField.test.ts` (extend the existing import from `../pourField` with the new names):

```ts
import {
  fbm,
  POUR_PALETTE_IDS,
  POUR_PALETTES,
  type PourPalette,
  renderPourRGBA,
  samplePourStops,
  valueNoise,
  warpPoint,
  worley,
} from "../pourField";
```

```ts
describe("POUR_PALETTES", () => {
  it("keys, ids, and POUR_PALETTE_IDS agree", () => {
    expect(Object.keys(POUR_PALETTES).sort()).toEqual(
      [...POUR_PALETTE_IDS].sort(),
    );
    for (const id of POUR_PALETTE_IDS) {
      expect(POUR_PALETTES[id].id).toBe(id);
      expect(POUR_PALETTES[id].stops.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("samplePourStops", () => {
  const pal: PourPalette = {
    id: "tidal",
    name: "Test",
    stops: [
      [0, 0, 0],
      [100, 100, 100],
      [200, 200, 200],
    ],
  };

  it("clamps to the first stop at t <= 0 and the last at t >= 1", () => {
    expect(samplePourStops(pal, -0.5)).toEqual([0, 0, 0]);
    expect(samplePourStops(pal, 1.5)).toEqual([200, 200, 200]);
  });

  it("interpolates midway between adjacent stops", () => {
    expect(samplePourStops(pal, 0.25)).toEqual([50, 50, 50]);
  });
});

describe("renderPourRGBA", () => {
  const SIZE = 32;

  it("same seed and palette produce a byte-identical buffer", () => {
    const a = renderPourRGBA(1234, POUR_PALETTES.tidal, SIZE, SIZE);
    const b = renderPourRGBA(1234, POUR_PALETTES.tidal, SIZE, SIZE);
    expect(a.pixels).toEqual(b.pixels);
    expect(a.averageLuminance).toBe(b.averageLuminance);
  });

  it("different seeds produce different buffers", () => {
    const a = renderPourRGBA(1, POUR_PALETTES.tidal, SIZE, SIZE);
    const b = renderPourRGBA(2, POUR_PALETTES.tidal, SIZE, SIZE);
    expect(a.pixels).not.toEqual(b.pixels);
  });

  it("buffer has RGBA length and is fully opaque", () => {
    const { pixels } = renderPourRGBA(7, POUR_PALETTES.magma, SIZE, SIZE);
    expect(pixels.length).toBe(SIZE * SIZE * 4);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });

  it("averageLuminance is in [0, 1] and tracks the palette", () => {
    const dark: PourPalette = {
      id: "tidal",
      name: "AllDark",
      stops: [
        [0, 0, 0],
        [10, 10, 10],
        [20, 20, 20],
        [30, 30, 30],
      ],
    };
    const light: PourPalette = {
      id: "tidal",
      name: "AllLight",
      stops: [
        [225, 225, 225],
        [235, 235, 235],
        [245, 245, 245],
        [255, 255, 255],
      ],
    };
    const d = renderPourRGBA(5, dark, SIZE, SIZE).averageLuminance;
    const l = renderPourRGBA(5, light, SIZE, SIZE).averageLuminance;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
    expect(d).toBeLessThan(0.3);
    expect(l).toBeGreaterThan(0.7);
  });
});
```

- [ ] **Step 2: Run tests to verify the new suites fail**

Run: `npx vitest run src/renderer/__tests__/pourField.test.ts`
Expected: Task 1 suites PASS; new suites FAIL (`POUR_PALETTES` etc. not exported).

- [ ] **Step 3: Write the implementation**

Append to `src/renderer/pourField.ts` (add `import type { RGB } from "@/engine/types";` at the top, alongside the existing `hash` import):

```ts
export type PourPaletteId = "tidal" | "magma" | "bubblegum" | "iris";

export interface PourPalette {
  id: PourPaletteId;
  name: string;
  stops: RGB[];
}

/**
 * Pour palettes are separate from the LED palettes: pours live on white
 * lacing and near-black negative space, which the LED palettes deliberately
 * avoid. Stops are ordered dark → light; samplePourStops clamps (no wrap).
 */
export const POUR_PALETTES: Record<PourPaletteId, PourPalette> = {
  tidal: {
    id: "tidal",
    name: "Tidal",
    stops: [
      [6, 10, 18],
      [13, 48, 74],
      [26, 134, 150],
      [126, 206, 208],
      [243, 246, 246],
    ],
  },
  magma: {
    id: "magma",
    name: "Magma",
    stops: [
      [24, 28, 52],
      [41, 74, 158],
      [227, 66, 32],
      [255, 148, 54],
      [247, 244, 238],
    ],
  },
  bubblegum: {
    id: "bubblegum",
    name: "Bubblegum",
    stops: [
      [46, 74, 168],
      [221, 58, 158],
      [248, 150, 206],
      [164, 240, 222],
      [236, 248, 246],
    ],
  },
  iris: {
    id: "iris",
    name: "Iris",
    stops: [
      [16, 10, 20],
      [84, 32, 130],
      [168, 90, 220],
      [212, 166, 74],
      [246, 244, 248],
    ],
  },
};

export const POUR_PALETTE_IDS: PourPaletteId[] = [
  "tidal",
  "magma",
  "bubblegum",
  "iris",
];

/** Clamped piecewise-linear palette sample (unlike samplePalette, no wrap). */
export function samplePourStops(palette: PourPalette, t: number): RGB {
  const stops = palette.stops;
  const n = stops.length - 1;
  const c = Math.min(1, Math.max(0, t)) * n;
  const i = Math.min(n - 1, Math.floor(c));
  const f = c - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/** Marble features across the board's width. */
const FLOW_SCALE = 3.2;
/** Worley cells per warped flow unit. */
const CELL_SCALE = 1.8;
/** F2−F1 distance below which a pixel reads as bright lacing. */
const LACE_WIDTH = 0.16;
/** How strongly lacing pulls toward the palette's lightest stop. */
const LACE_STRENGTH = 0.85;
/** Max darkening of cell rims (the dark webbing between cells). */
const RIM_DARKEN = 0.45;
/** Widen the fbm output (which clusters near 0.5) across the full palette. */
const CONTRAST = 2.2;

/**
 * Rasterize one pour artwork into a raw RGBA buffer.
 *
 * Per pixel: warp the coordinates (marbling), map fbm through the palette,
 * then — gated by a low-frequency mask so parts of the canvas stay purely
 * marbled — overlay Worley cells: bright lacing where f2−f1 is small, and
 * darkened rims just inside cell borders. Pure function of its arguments.
 */
export function renderPourRGBA(
  seed: number,
  palette: PourPalette,
  width: number,
  height: number,
): { pixels: Uint8ClampedArray; averageLuminance: number } {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const laceColor = palette.stops[palette.stops.length - 1];
  let lumSum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width) * FLOW_SCALE;
      const v = ((y + 0.5) / height) * FLOW_SCALE;
      const w = warpPoint(seed, u, v);
      const base = fbm(seed + 5, w.x, w.y, 4);
      const t = (base - 0.5) * CONTRAST + 0.5;
      let [r, g, b] = samplePourStops(palette, t);

      const mask = fbm(seed + 83, u * 0.9 + 7.3, v * 0.9 + 2.1, 3);
      const cellAmount = Math.min(1, Math.max(0, (mask - 0.42) / 0.22));
      if (cellAmount > 0) {
        const { f1, f2 } = worley(seed + 3, w.x * CELL_SCALE, w.y * CELL_SCALE);
        const lace = Math.max(0, 1 - (f2 - f1) / LACE_WIDTH) * cellAmount;
        const rim =
          Math.min(1, Math.max(0, (f1 - 0.3) / 0.35)) * cellAmount * (1 - lace);
        const pull = lace * LACE_STRENGTH;
        const shade = 1 - RIM_DARKEN * rim;
        r = (r + (laceColor[0] - r) * pull) * shade;
        g = (g + (laceColor[1] - g) * pull) * shade;
        b = (b + (laceColor[2] - b) * pull) * shade;
      }

      const o = (y * width + x) * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
      lumSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }
  }
  return { pixels, averageLuminance: lumSum / (width * height) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/pourField.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Lint/format and commit**

```bash
npx biome check --write src/renderer
npm run check
git add src/renderer/pourField.ts src/renderer/__tests__/pourField.test.ts
git commit -m "feat: add pour palettes and RGBA pour-field rasterizer"
```

---

### Task 3: Texture cache + luminance-based light factor

**Files:**
- Create: `src/renderer/pourTexture.ts`
- Modify: `src/renderer/lightMapping.ts:52-55` (refactor `lightBoardFactor`)
- Test: `src/renderer/__tests__/lightMapping.test.ts` (append)

**Interfaces:**
- Consumes: `renderPourRGBA`, `POUR_PALETTES`, `PourPaletteId` from `./pourField`.
- Produces:
  - `lightFactorFromLuminance(lum: number): number` in `lightMapping.ts` — 0 dark → 1 light, same crossfade constants as `lightBoardFactor`.
  - In `pourTexture.ts`:
    - `POUR_TEXTURE_SIZE = 768`
    - `interface PourTexture { canvas: HTMLCanvasElement; averageLuminance: number }`
    - `getPourTexture(seed: number, paletteId: PourPaletteId, size?: number): PourTexture | null` — memoized single-entry cache; `null` when no 2D context exists (caller falls back to the flat fill).

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/lightMapping.test.ts` (keep its existing imports; add `lightFactorFromLuminance` to the import from `../lightMapping`):

```ts
describe("lightFactorFromLuminance", () => {
  it("is 0 at/below CROSSFADE_START and 1 at/above START + RANGE", () => {
    expect(lightFactorFromLuminance(0)).toBe(0);
    expect(lightFactorFromLuminance(CROSSFADE_START)).toBe(0);
    expect(lightFactorFromLuminance(CROSSFADE_START + CROSSFADE_RANGE)).toBe(1);
    expect(lightFactorFromLuminance(1)).toBe(1);
  });

  it("agrees with lightBoardFactor for a hex color", () => {
    expect(lightFactorFromLuminance(relativeLuminance("#808080"))).toBe(
      lightBoardFactor("#808080"),
    );
  });
});
```

(If `CROSSFADE_START`, `CROSSFADE_RANGE`, `relativeLuminance`, or `lightBoardFactor` are not already imported in that test file, add them to the import list — all are exported from `../lightMapping`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/lightMapping.test.ts`
Expected: FAIL — `lightFactorFromLuminance` is not exported.

- [ ] **Step 3: Implement**

In `src/renderer/lightMapping.ts`, replace the existing `lightBoardFactor` (lines 51–55) with:

```ts
/** 0 dark → 1 light for a raw relative luminance; drives the additive↔graphic crossfade. */
export function lightFactorFromLuminance(lum: number): number {
  const f = (lum - CROSSFADE_START) / CROSSFADE_RANGE;
  return Math.max(0, Math.min(1, f));
}

/** 0 on dark boards → 1 on light boards; drives the additive↔graphic crossfade. */
export function lightBoardFactor(hex: string): number {
  return lightFactorFromLuminance(relativeLuminance(hex));
}
```

Create `src/renderer/pourTexture.ts`:

```ts
import {
  POUR_PALETTES,
  type PourPaletteId,
  renderPourRGBA,
} from "./pourField";

/**
 * Offscreen-canvas cache for the generated pour artwork, mirroring the
 * glowSpriteCache approach in wallRenderer.ts: generate once, blit every
 * frame. Single entry — only one artwork is ever on screen.
 */

/**
 * Generation resolution. The field is smooth, so scaling up at draw time is
 * visually lossless; if generation stalls noticeably (>~1.5 s), lowering
 * this to 512 is the intended knob.
 */
export const POUR_TEXTURE_SIZE = 768;

export interface PourTexture {
  canvas: HTMLCanvasElement;
  averageLuminance: number;
}

let cacheKey = "";
let cached: PourTexture | null = null;

/**
 * Build (or fetch) the pour artwork for a seed + palette. Returns null when
 * no real 2D context exists (SSR/tests) — callers fall back to the flat
 * boardColor fill.
 */
export function getPourTexture(
  seed: number,
  paletteId: PourPaletteId,
  size: number = POUR_TEXTURE_SIZE,
): PourTexture | null {
  const key = `${seed}|${paletteId}|${size}`;
  if (cached && key === cacheKey) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { pixels, averageLuminance } = renderPourRGBA(
    seed,
    POUR_PALETTES[paletteId],
    size,
    size,
  );
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
  cached = { canvas, averageLuminance };
  cacheKey = key;
  return cached;
}
```

(No unit test for `pourTexture.ts` itself — it needs a DOM canvas, and the suite is deliberately jsdom-free; its logic beyond the tested `renderPourRGBA` is a five-line memo.)

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS — including all pre-existing `lightMapping` tests (the refactor must not change `lightBoardFactor` behavior).

- [ ] **Step 5: Lint/format and commit**

```bash
npx biome check --write src/renderer
npm run check
git add src/renderer/pourTexture.ts src/renderer/lightMapping.ts src/renderer/__tests__/lightMapping.test.ts
git commit -m "feat: add memoized pour texture cache and luminance-based light factor"
```

---

### Task 4: Snapshot fields + 2D renderer wiring

**Files:**
- Modify: `src/engine/types.ts:81-114` (`ProjectSnapshot`)
- Modify: `src/renderer/wallRenderer.ts` (`WallDrawState`, `drawWall` board fill ~lines 266–287, `FrameDrawOptions`/`drawFrame` panel fill ~lines 376–397)

**Interfaces:**
- Consumes: `getPourTexture`, `PourTexture` from `./pourTexture`; `PourPaletteId` from `./pourField`; `lightFactorFromLuminance` from `./lightMapping`.
- Produces:
  - `ProjectSnapshot` gains `boardArt?: "none" | "pour"`, `boardArtSeed?: number`, `boardArtPalette?: string`.
  - `WallDrawState` gains optional `boardArt?: "none" | "pour"`, `boardArtSeed?: number`, `boardArtPalette?: PourPaletteId` (absent → flat fill, today's behavior). Task 6 passes these from the studio.

There is no test harness for Canvas2D drawing (no jsdom); correctness is verified visually in Task 7. Type-safety is exercised by the existing suite importing `wallRenderer`.

- [ ] **Step 1: Add the snapshot fields**

In `src/engine/types.ts`, inside `ProjectSnapshot` directly after the `boardColor?` field:

```ts
  /** Board artwork mode. Absent in legacy saves → loader defaults to "none". */
  boardArt?: "none" | "pour";
  /** Seed for the generated board artwork. Absent → loader derives it from masterSeed. */
  boardArtSeed?: number;
  /** Pour palette id — validated against the renderer's POUR_PALETTES at load. Absent/unknown → "tidal". */
  boardArtPalette?: string;
```

(`boardArtPalette` is a plain `string` here on purpose: the engine layer must not import the renderer's `PourPaletteId`. The loader narrows it.)

- [ ] **Step 2: Wire the 2D renderer**

In `src/renderer/wallRenderer.ts`:

**2a.** Add imports:

```ts
import { lightFactorFromLuminance } from "./lightMapping";
import type { PourPaletteId } from "./pourField";
import { getPourTexture, type PourTexture } from "./pourTexture";
```

(`lightFactorFromLuminance` joins the existing `./lightMapping` import list.)

**2b.** In `WallDrawState`, after `boardColor: string;`:

```ts
  /** Board artwork mode; absent → "none" (flat boardColor fill). */
  boardArt?: "none" | "pour";
  boardArtSeed?: number;
  boardArtPalette?: PourPaletteId;
```

**2c.** In `FrameDrawOptions`, after `boardColor: string;`:

```ts
  /** Active pour artwork + board rect in canvas px; null → flat boardColor panel. */
  pour: {
    texture: PourTexture;
    boardX: number;
    boardY: number;
    boardSize: number;
  } | null;
```

**2d.** In `drawWall`, replace the board fill block (currently `ctx.save(); ctx.fillStyle = state.boardColor; ctx.fillRect(...)`) and the `lightFactor` line with:

```ts
  const pourTex =
    state.boardArt === "pour" &&
    state.boardArtSeed != null &&
    state.boardArtPalette != null
      ? getPourTexture(state.boardArtSeed, state.boardArtPalette)
      : null;

  // Backing board — sits behind the frame grid, visible in the inter-frame
  // gaps and around the outer edge per `boardPadding`.
  ctx.save();
  if (pourTex) {
    ctx.drawImage(
      pourTex.canvas,
      layout.boardX,
      layout.boardY,
      layout.boardSize,
      layout.boardSize,
    );
  } else {
    ctx.fillStyle = state.boardColor;
    ctx.fillRect(
      layout.boardX,
      layout.boardY,
      layout.boardSize,
      layout.boardSize,
    );
  }
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    layout.boardX,
    layout.boardY,
    layout.boardSize,
    layout.boardSize,
  );
  ctx.restore();

  const edit = state.mode === "edit";
  const lightFactor = pourTex
    ? lightFactorFromLuminance(pourTex.averageLuminance)
    : lightBoardFactor(state.boardColor);
```

**2e.** In the `drawFrame(...)` call inside the loop, add alongside `boardColor: state.boardColor,`:

```ts
      pour: pourTex
        ? {
            texture: pourTex,
            boardX: layout.boardX,
            boardY: layout.boardY,
            boardSize: layout.boardSize,
          }
        : null,
```

**2f.** In `drawFrame`, add `pour` to the destructuring of `opts`, then replace the panel fill (currently `ctx.fillStyle = boardColor; ctx.fillRect(panelX, panelY, panelSize, panelSize);` right after the `ctx.clip()`):

```ts
  // The board shows through the open frame: in pour mode, draw this panel's
  // sub-rectangle of the artwork so the painting continues behind the fibres.
  if (pour) {
    const scale = pour.texture.canvas.width / pour.boardSize;
    ctx.drawImage(
      pour.texture.canvas,
      (panelX - pour.boardX) * scale,
      (panelY - pour.boardY) * scale,
      panelSize * scale,
      panelSize * scale,
      panelX,
      panelY,
      panelSize,
      panelSize,
    );
  } else {
    ctx.fillStyle = boardColor;
    ctx.fillRect(panelX, panelY, panelSize, panelSize);
  }
```

- [ ] **Step 3: Verify the suite and linters still pass**

Run: `npm run test && npm run check`
Expected: PASS (fields are optional; nothing constructs them yet).

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/renderer/wallRenderer.ts
git commit -m "feat: draw pour board art in the 2D renderer, incl. frame panels"
```

---

### Task 5: 3D renderer wiring

**Files:**
- Modify: `src/renderer3d/wall3d.ts` (`Wall3DState`, `rebuild`, `render`, `disposeGroup`, `dispose`)

**Interfaces:**
- Consumes: `getPourTexture` from `@/renderer/pourTexture`; `PourPaletteId` from `@/renderer/pourField`.
- Produces: `Wall3DState` gains optional `boardArt?: "none" | "pour"`, `boardArtSeed?: number`, `boardArtPalette?: PourPaletteId`. Task 6 passes these from the studio.

- [ ] **Step 1: Implement**

In `src/renderer3d/wall3d.ts`:

**1a.** Add imports (next to the existing `@/renderer/wallRenderer` import):

```ts
import type { PourPaletteId } from "@/renderer/pourField";
import { getPourTexture } from "@/renderer/pourTexture";
```

**1b.** In `Wall3DState`, after `boardColor: string;`:

```ts
  /** Board artwork mode; absent → "none" (flat boardColor material). */
  boardArt?: "none" | "pour";
  boardArtSeed?: number;
  boardArtPalette?: PourPaletteId;
```

**1c.** Next to `let boardMat: THREE.MeshStandardMaterial | null = null;` add:

```ts
  let boardTex: THREE.CanvasTexture | null = null;
```

**1d.** In `disposeGroup`, after the `group.traverse(...)` block (before `group = new THREE.Group();`):

```ts
    boardTex?.dispose();
    boardTex = null;
```

**1e.** In `rebuild`, replace the `boardMat = new THREE.MeshStandardMaterial({...})` assignment with:

```ts
    const pour =
      state.boardArt === "pour" &&
      state.boardArtSeed != null &&
      state.boardArtPalette != null
        ? getPourTexture(state.boardArtSeed, state.boardArtPalette)
        : null;
    if (pour) {
      boardTex = new THREE.CanvasTexture(pour.canvas);
      boardTex.colorSpace = THREE.SRGBColorSpace;
    }
    boardMat = new THREE.MeshStandardMaterial({
      color: pour ? 0xffffff : state.boardColor,
      map: pour ? boardTex : null,
      roughness: 0.9,
      metalness: 0.05,
    });
```

**1f.** In `render`, extend the rebuild key so art changes rebuild the scene, and stop overwriting the white base color when a map is active. Replace:

```ts
    const key = `${state.gridSize}|${state.frameSize}|${state.frameGap}|${state.boardPadding}|${state.frameWidth}|${state.cornerRadius}|${state.frameOffset}`;
```

with:

```ts
    const key = `${state.gridSize}|${state.frameSize}|${state.frameGap}|${state.boardPadding}|${state.frameWidth}|${state.cornerRadius}|${state.frameOffset}|${state.boardArt ?? "none"}|${state.boardArtSeed ?? 0}|${state.boardArtPalette ?? ""}`;
```

and replace `boardMat?.color.set(state.boardColor);` with:

```ts
    if (boardMat && boardMat.map == null) boardMat.color.set(state.boardColor);
```

**1g.** In the returned `dispose`, `disposeGroup()` already runs and now clears `boardTex` — no further change needed there.

- [ ] **Step 2: Verify the suite and linters pass**

Run: `npm run test && npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer3d/wall3d.ts
git commit -m "feat: show pour board art on the 3D board mesh"
```

---

### Task 6: Studio state, persistence, and left-panel UI

**Files:**
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx` (state, loader, autosave, draw, handlers, LeftPanel props)
- Modify: `src/components/glowbraid/LeftPanel.tsx` (Board art controls)

**Interfaces:**
- Consumes: `POUR_PALETTES`, `POUR_PALETTE_IDS`, `PourPaletteId` from `@/renderer/pourField`; `hash` from `@/engine/random`; the optional state fields added in Tasks 4–5.
- Produces: `LeftPanelProps` gains `boardArt: "none" | "pour"`, `onBoardArt(mode)`, `boardArtPalette: PourPaletteId`, `onBoardArtPalette(id)`, `onBoardArtReroll()`.

- [ ] **Step 1: Studio state + persistence**

In `src/components/glowbraid/GlowbraidStudio.tsx`:

**1a.** Add imports:

```ts
import { hash } from "@/engine/random";
import { POUR_PALETTES, type PourPaletteId } from "@/renderer/pourField";
```

**1b.** Below the existing `randomSeed()` helper add:

```ts
/** Spec'd fallback: board-art seed derived deterministically from the wall's master seed. */
function deriveBoardArtSeed(masterSeed: number): number {
  return Math.floor(hash(masterSeed) * 2 ** 31);
}
```

**1c.** In `StudioState`, after `boardColor: string;`:

```ts
  boardArt: "none" | "pour";
  boardArtSeed: number;
  boardArtPalette: PourPaletteId;
```

**1d.** In `INITIAL_STATE`, after `boardColor: DEFAULT_BOARD_COLOR,`:

```ts
  boardArt: "none",
  boardArtSeed: deriveBoardArtSeed(7431),
  boardArtPalette: "tidal",
```

(7431 matches `INITIAL_STATE.masterSeed` — keep them in sync.)

**1e.** In `buildInitialProject`, after the `boardColor` sanitization:

```ts
  const boardArt: StudioState["boardArt"] = d.boardArt === "pour" ? "pour" : "none";
  const boardArtSeed = Number.isFinite(Number(d.boardArtSeed))
    ? Math.floor(Number(d.boardArtSeed))
    : deriveBoardArtSeed(d.masterSeed);
  const boardArtPalette: PourPaletteId =
    typeof d.boardArtPalette === "string" &&
    Object.hasOwn(POUR_PALETTES, d.boardArtPalette)
      ? (d.boardArtPalette as PourPaletteId)
      : "tidal";
```

and add `boardArt, boardArtSeed, boardArtPalette,` to the returned `state` object (next to `boardColor`).

**1f.** In the autosave effect's `snapshot` object, after `boardColor: s.boardColor,`:

```ts
        boardArt: s.boardArt,
        boardArtSeed: s.boardArtSeed,
        boardArtPalette: s.boardArtPalette,
```

and add to the effect's dependency array (next to `ui.boardColor`):

```ts
    ui.boardArt,
    ui.boardArtSeed,
    ui.boardArtPalette,
```

**1g.** In `draw()`, pass the three fields in **both** branches — in the `wall3dRef.current?.render({...})` state and in the `drawWall(ctx, ..., {...})` state, each next to `boardColor: s.boardColor,`:

```ts
        boardArt: s.boardArt,
        boardArtSeed: s.boardArtSeed,
        boardArtPalette: s.boardArtPalette,
```

**1h.** Pass new props to `<LeftPanel ...>` next to the `boardColor` props:

```tsx
          boardArt={ui.boardArt}
          onBoardArt={(mode) => patch({ boardArt: mode })}
          boardArtPalette={ui.boardArtPalette}
          onBoardArtPalette={(id) => patch({ boardArtPalette: id })}
          onBoardArtReroll={() => patch({ boardArtSeed: randomSeed() })}
```

- [ ] **Step 2: LeftPanel UI**

In `src/components/glowbraid/LeftPanel.tsx`:

**2a.** Add imports:

```ts
import {
  POUR_PALETTE_IDS,
  POUR_PALETTES,
  type PourPaletteId,
} from "@/renderer/pourField";
```

(`Shuffle` from the existing `lucide-react` import is reused for the reroll button — no lucide change needed.)

**2b.** In `LeftPanelProps`, after `onBoardColor`:

```ts
  boardArt: "none" | "pour";
  onBoardArt: (mode: "none" | "pour") => void;
  boardArtPalette: PourPaletteId;
  onBoardArtPalette: (id: PourPaletteId) => void;
  onBoardArtReroll: () => void;
```

**2c.** Directly after the "Board color" block (the `<div>` containing `ColorSwatchPicker`), add:

```tsx
      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-ink/70">Board art</div>
        <div className="flex gap-[5px]">
          {(["none", "pour"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => props.onBoardArt(mode)}
              className={
                mode === props.boardArt
                  ? "h-8 flex-1 cursor-pointer rounded-lg border border-glow/50 bg-glow/15 text-xs text-white"
                  : "h-8 flex-1 cursor-pointer rounded-lg border border-white/[0.09] bg-white/[0.02] text-xs text-ink/65 hover:bg-white/[0.06] hover:text-ink/90"
              }
            >
              {mode === "none" ? "None" : "Pour"}
            </button>
          ))}
        </div>
        {props.boardArt === "pour" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {POUR_PALETTE_IDS.map((id) => {
                const stops = POUR_PALETTES[id].stops;
                const gradient = `linear-gradient(135deg, ${stops
                  .map(([r, g, b]) => `rgb(${r},${g},${b})`)
                  .join(", ")})`;
                return (
                  <button
                    key={id}
                    type="button"
                    title={POUR_PALETTES[id].name}
                    aria-label={`Pour palette: ${POUR_PALETTES[id].name}`}
                    onClick={() => props.onBoardArtPalette(id)}
                    style={{ background: gradient }}
                    className={
                      id === props.boardArtPalette
                        ? "h-[30px] w-[30px] cursor-pointer rounded-[7px] border border-white/15 outline outline-2 outline-offset-2 outline-glow/80"
                        : "h-[30px] w-[30px] cursor-pointer rounded-[7px] border border-white/15 hover:border-white/40"
                    }
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={props.onBoardArtReroll}
              className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] text-xs text-ink hover:bg-white/[0.08]"
            >
              <Shuffle size={12} aria-hidden="true" />
              Reroll artwork
            </button>
          </>
        ) : null}
      </div>
```

- [ ] **Step 3: Verify suite and linters**

Run: `npm run test && npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/glowbraid/GlowbraidStudio.tsx src/components/glowbraid/LeftPanel.tsx
git commit -m "feat: board-art controls, persistence, and render wiring in the studio"
```

---

### Task 7: End-to-end visual verification and tuning

**Files:**
- Possibly tune constants in: `src/renderer/pourField.ts` (`FLOW_SCALE`, `CELL_SCALE`, `LACE_WIDTH`, `LACE_STRENGTH`, `RIM_DARKEN`, `CONTRAST`, `WARP_STRENGTH`), `src/renderer/pourTexture.ts` (`POUR_TEXTURE_SIZE`)

**Interfaces:** none new — this task validates the assembled feature against the spec.

- [ ] **Step 1: Run the app**

```bash
npm run dev
```

Open http://localhost:3000 (drive it with the Playwright browser tools if available; otherwise ask the user to look).

- [ ] **Step 2: Verify against this checklist**

1. Board art **None** → identical to pre-feature behavior (flat board color, all animations fine).
2. Switch to **Pour** → marbled artwork with visible cellular lacing fills the board *and* continues inside the frame panels (no flat squares over the painting). A sub-second generation pause is acceptable; multi-second is not — halve `POUR_TEXTURE_SIZE` if so.
3. All four palettes read distinctly and match their names (Tidal teal/ink/white, Magma red/blue/white, Bubblegum pink/blue/mint, Iris purple/gold).
4. **Reroll artwork** produces a clearly different composition each click.
5. Light palettes (Tidal, Bubblegum can render bright) still show legible fibres — the crossfade should kick in (fibres get the opaque graphic treatment instead of vanishing additive glow).
6. Switch to **3D** → the same artwork appears on the board slab; orbit and bloom behave normally; switching back and forth doesn't leak (no console warnings about textures/materials).
7. Reload the page → same artwork regenerates (seed persisted). Set art to None, reload → still None.
8. Edit mode + measurements overlay still render correctly over the pour.
9. Visual quality gate: if the result looks like plain blobby noise rather than a pour (no flow lines, no cells), tune in this order — raise `WARP_STRENGTH` (stronger marbling), lower `LACE_WIDTH` (thinner lacing), adjust `CELL_SCALE` (cell size), raise `CONTRAST` (deeper darks/whites). Re-run `npm run test` after tuning (tests are value-independent, but determinism tests guard regressions).

- [ ] **Step 3: Full verification**

```bash
npm run test && npm run check && npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit any tuning**

```bash
git add -A src
git commit -m "feat: tune pour field constants after visual review"
```

(Skip the commit if nothing was tuned.)
