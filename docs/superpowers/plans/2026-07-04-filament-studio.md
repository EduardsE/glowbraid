# Filament Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Filament Studio fibre-optic wall simulator (spec: `docs/superpowers/specs/2026-07-04-filament-studio-design.md`) in this TanStack Start scaffold.

**Architecture:** Pure-TypeScript deterministic simulation engine (`src/engine/`) with no React/DOM dependencies; canvas renderer module (`src/renderer/`); thin React shell (`src/components/filament/`) that owns UI state and the rAF loop. Visual/behavioural source of truth is the imported design file at `docs/reference/filament-studio.dc.html` — its embedded `DCLogic` class contains working reference math which this plan ports verbatim (constants included).

**Tech Stack:** TanStack Start (React 19, file routes), TypeScript strict, Tailwind CSS 4, Vitest, Biome, Canvas 2D.

## Global Constraints

- **Formatting/linting:** Biome — tab indentation, double quotes. Before every commit run: `npx biome check --write src vite.config.ts` and fix anything it can't auto-fix. All `<button>` elements need `type="button"` (Biome a11y rule).
- **TypeScript:** strict; `verbatimModuleSyntax` is on — type-only imports MUST use `import type`; `noUnusedLocals`/`noUnusedParameters` are errors.
- **Path alias:** `@/*` → `./src/*` (already configured in tsconfig). Use `@/engine/...`, `@/renderer/...` in cross-layer imports; relative imports within a layer and in tests.
- **Engine purity:** files under `src/engine/` must not import React, touch `window`/`document`/`localStorage`, or import from `src/renderer` / `src/components`.
- **Renderer purity:** files under `src/renderer/` may use Canvas 2D types but must not import React.
- **Design fidelity:** every color, size, alpha, and magic constant comes from `docs/reference/filament-studio.dc.html`. Do not "improve" visuals.
- **Test command:** `npx vitest run` (all tests) or `npx vitest run <path>` (one file). Typecheck: `npx tsc --noEmit`.
- **Commits:** end every commit message with `Co-Authored-By: Claude <noreply@anthropic.com>` (single-line footer). Frequent small commits, one per task minimum.
- Key shared constants (defined once, listed here for reference): `TRAVEL = 1.15`, `DECAY = 1.95`, `MIN_SEGMENT_INTENSITY = 0.05`, `FIBER_SAMPLES = 38`, `MIN_ENDPOINT_DISTANCE = 0.42`, loop `DURATION = 12` s, accent violet `#9b8cff`, LED group centers `0.27`/`0.73` with offsets `±0.085`.

---

### Task 1: Baseline commit, fonts, global styles, page title

**Files:**
- Modify: `src/styles.css` (line 1 font import + append base styles at end)
- Modify: `src/routes/__root.tsx:18` (title)

**Interfaces:**
- Produces: CSS classes `.font-grotesk`, `.font-smono` and keyframes `fil-float` used by all UI tasks; dark `#0b0c0f` page background.

- [ ] **Step 1: Commit the untracked scaffold as a baseline**

The repo currently has one commit (docs only); all scaffold files are untracked. Commit them unchanged first so implementation diffs stay reviewable:

```bash
git add -A
git commit -m "chore: commit TanStack Start scaffold baseline

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 2: Replace the Google Fonts import**

In `src/styles.css`, replace line 1 (the Fraunces/Manrope import) with:

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
```

- [ ] **Step 3: Append global styles at the end of `src/styles.css`**

```css
html,
body {
	height: 100%;
	margin: 0;
	padding: 0;
	overflow: hidden;
	background: #0b0c0f;
}

::-webkit-scrollbar {
	width: 8px;
	height: 8px;
}
::-webkit-scrollbar-thumb {
	background: rgba(255, 255, 255, 0.09);
	border-radius: 8px;
}
::-webkit-scrollbar-track {
	background: transparent;
}

input[type="range"] {
	accent-color: #9b8cff;
}

.font-grotesk {
	font-family: "Space Grotesk", system-ui, sans-serif;
}
.font-smono {
	font-family: "Space Mono", monospace;
}

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

(Note: `src/styles.css` is excluded from Biome, so its formatting doesn't matter to `npm run check`.)

- [ ] **Step 4: Update the page title**

In `src/routes/__root.tsx`, change `title: 'TanStack Start Starter'` to `title: 'Filament — Fibre Optic Wall Studio'`.

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: build completes without errors.

- [ ] **Step 6: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat: Filament fonts, dark base styles, page title

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Vitest setup, engine types, seeded RNG

**Files:**
- Create: `vitest.config.ts`
- Create: `src/engine/types.ts`
- Create: `src/engine/random.ts`
- Test: `src/engine/__tests__/random.test.ts`

**Interfaces:**
- Produces: all shared engine types (below, exact shapes); `createRng(seed: number): Rng` where `type Rng = () => number` (deterministic, [0,1)); `hash(n: number): number` (stateless, [0,1)). Every later engine task imports from `./types` and `./random`.

- [ ] **Step 1: Create `vitest.config.ts`**

A dedicated Vitest config so tests don't load the TanStack Start vite plugin:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
	},
});
```

- [ ] **Step 2: Create `src/engine/types.ts`**

```ts
export type Point = { x: number; y: number };
export type RGB = [number, number, number];
export type Side = "top" | "right" | "bottom" | "left";

export interface Led {
	/** Human-readable id used in the inspector, e.g. "T3", "L6" */
	id: string;
	/** 0–23, global within the frame */
	index: number;
	/** Position on the frame border, normalized 0–1 */
	position: Point;
	/** Inward edge normal (unit axis vector) */
	normal: Point;
	side: Side;
	/** 0–5 within the edge */
	edgeIndex: number;
	/** Which 3-LED cut strip segment on the edge */
	strip: 0 | 1;
	/** Perimeter coordinate 0–1; drives animation phase */
	u: number;
}

export interface Fiber {
	id: string;
	startLedIndex: number;
	endLedIndex: number;
	/** 38 samples of a cubic Bézier, includes both endpoints */
	path: Point[];
	/** Polyline length in frame units */
	length: number;
	/** Stroke width multiplier 0.85–1.35 */
	thickness: number;
	/** (startLed.u + endLed.u) / 2 — tints the passive guide */
	hueBase: number;
}

export interface Frame {
	seed: number;
	leds: Led[];
	fibers: Fiber[];
	crossings: number;
}

export interface WallConfig {
	gridSize: number;
	fiberDensity: number;
	frameSeeds: number[];
}

export type AnimationId =
	| "flow"
	| "rainbow"
	| "pulse"
	| "breathe"
	| "sparkle"
	| "gradient";

export type PaletteId = "sunset" | "neon" | "aurora" | "ember" | "spectrum";

/** One LED's animated output at a moment in time */
export interface LedLight {
	color: RGB;
	brightness: number;
}

/** Shape persisted to localStorage under "filament.project" */
export interface ProjectSnapshot {
	gridSize: number;
	frameSize: number;
	fiberDensity: number;
	masterSeed: number;
	seeds: number[];
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: PaletteId;
	mode: "edit" | "sim";
}
```

- [ ] **Step 3: Write the failing test `src/engine/__tests__/random.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createRng, hash } from "../random";

describe("createRng", () => {
	it("produces the same sequence for the same seed", () => {
		const a = createRng(1234);
		const b = createRng(1234);
		expect(Array.from({ length: 50 }, () => a())).toEqual(
			Array.from({ length: 50 }, () => b()),
		);
	});

	it("produces different sequences for different seeds", () => {
		const a = createRng(1);
		const b = createRng(2);
		expect(Array.from({ length: 10 }, () => a())).not.toEqual(
			Array.from({ length: 10 }, () => b()),
		);
	});

	it("returns values in [0, 1)", () => {
		const rnd = createRng(99999);
		for (let i = 0; i < 1000; i++) {
			const v = rnd();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe("hash", () => {
	it("is deterministic", () => {
		expect(hash(42)).toBe(hash(42));
	});

	it("returns values in [0, 1)", () => {
		for (let n = 0; n < 500; n++) {
			const v = hash(n * 13.7);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/random.test.ts`
Expected: FAIL — cannot resolve `../random`.

- [ ] **Step 5: Create `src/engine/random.ts`**

Port of the design file's `rng()`/`hash()` (mulberry32 variant):

```ts
export type Rng = () => number;

/** Deterministic seeded PRNG — same seed, same sequence. Ported from the design reference. */
export function createRng(seed: number): Rng {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Stateless hash of a number into [0, 1). Used by the sparkle animation. */
export function hash(n: number): number {
	const s = Math.sin(n * 12.9898) * 43758.5453;
	return s - Math.floor(s);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/random.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): shared types and deterministic seeded RNG

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Engine geometry

**Files:**
- Create: `src/engine/geometry.ts`
- Test: `src/engine/__tests__/geometry.test.ts`

**Interfaces:**
- Consumes: `Point` from `./types`.
- Produces: `FIBER_SAMPLES = 38`; `sampleCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, samples?: number): Point[]`; `polylineLength(pts: Point[]): number`; `pathsAreClose(a: Point[], b: Point[], threshold?: number): boolean`; `countCrossings(paths: Point[][]): number`.

- [ ] **Step 1: Write the failing test `src/engine/__tests__/geometry.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
	FIBER_SAMPLES,
	countCrossings,
	pathsAreClose,
	polylineLength,
	sampleCubicBezier,
} from "../geometry";
import type { Point } from "../types";

const line = (x0: number, y0: number, x1: number, y1: number): Point[] =>
	Array.from({ length: 10 }, (_, i) => {
		const t = i / 9;
		return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
	});

describe("sampleCubicBezier", () => {
	it("returns FIBER_SAMPLES points by default, starting at p0 and ending at p3", () => {
		const pts = sampleCubicBezier(
			{ x: 0, y: 0 },
			{ x: 0.3, y: 0.5 },
			{ x: 0.7, y: 0.5 },
			{ x: 1, y: 1 },
		);
		expect(pts).toHaveLength(FIBER_SAMPLES);
		expect(pts[0]).toEqual({ x: 0, y: 0 });
		expect(pts[pts.length - 1].x).toBeCloseTo(1, 10);
		expect(pts[pts.length - 1].y).toBeCloseTo(1, 10);
	});

	it("degenerates to a straight line when control points are collinear", () => {
		const pts = sampleCubicBezier(
			{ x: 0, y: 0 },
			{ x: 1 / 3, y: 0 },
			{ x: 2 / 3, y: 0 },
			{ x: 1, y: 0 },
		);
		expect(polylineLength(pts)).toBeCloseTo(1, 6);
		for (const p of pts) expect(p.y).toBeCloseTo(0, 10);
	});
});

describe("polylineLength", () => {
	it("sums segment lengths", () => {
		expect(
			polylineLength([
				{ x: 0, y: 0 },
				{ x: 3, y: 0 },
				{ x: 3, y: 4 },
			]),
		).toBeCloseTo(7, 10);
	});
});

describe("pathsAreClose / countCrossings", () => {
	it("detects two crossing diagonals", () => {
		const a = line(0, 0, 1, 1);
		const b = line(0, 1, 1, 0);
		expect(pathsAreClose(a, b)).toBe(true);
		expect(countCrossings([a, b])).toBe(1);
	});

	it("does not flag far-apart parallel lines", () => {
		const a = line(0, 0, 1, 0);
		const b = line(0, 1, 1, 1);
		expect(pathsAreClose(a, b)).toBe(false);
		expect(countCrossings([a, b])).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/geometry.test.ts`
Expected: FAIL — cannot resolve `../geometry`.

- [ ] **Step 3: Create `src/engine/geometry.ts`**

```ts
import type { Point } from "./types";

/** Samples per fiber path (matches the design reference) */
export const FIBER_SAMPLES = 38;

export function sampleCubicBezier(
	p0: Point,
	p1: Point,
	p2: Point,
	p3: Point,
	samples: number = FIBER_SAMPLES,
): Point[] {
	const out: Point[] = [];
	for (let i = 0; i < samples; i++) {
		const t = i / (samples - 1);
		const mt = 1 - t;
		const a = mt * mt * mt;
		const b = 3 * mt * mt * t;
		const c = 3 * mt * t * t;
		const d = t * t * t;
		out.push({
			x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
			y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
		});
	}
	return out;
}

export function polylineLength(pts: Point[]): number {
	let len = 0;
	for (let i = 1; i < pts.length; i++) {
		len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
	}
	return len;
}

/**
 * Coarse proximity test between two sampled paths (the design reference's
 * crossing heuristic: every 4th interior sample, threshold 0.028).
 */
export function pathsAreClose(a: Point[], b: Point[], threshold = 0.028): boolean {
	for (let i = 2; i < a.length - 2; i += 4) {
		for (let j = 2; j < b.length - 2; j += 4) {
			if (Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y) < threshold) return true;
		}
	}
	return false;
}

export function countCrossings(paths: Point[][]): number {
	let crossings = 0;
	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			if (pathsAreClose(paths[i], paths[j])) crossings++;
		}
	}
	return crossings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): bezier sampling, path length, crossing detection

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Engine palettes

**Files:**
- Create: `src/engine/palettes.ts`
- Test: `src/engine/__tests__/palettes.test.ts`

**Interfaces:**
- Consumes: `PaletteId`, `RGB` from `./types`.
- Produces: `interface Palette { id: PaletteId; name: string; stops: RGB[] }`; `PALETTES: Record<PaletteId, Palette>`; `PALETTE_IDS: PaletteId[]` (display order); `samplePalette(palette: Palette, u: number): RGB` (piecewise-linear, wraps u into [0,1)).

- [ ] **Step 1: Write the failing test `src/engine/__tests__/palettes.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { PALETTE_IDS, PALETTES, samplePalette } from "../palettes";

describe("PALETTES", () => {
	it("has the five palettes in display order", () => {
		expect(PALETTE_IDS).toEqual(["sunset", "neon", "aurora", "ember", "spectrum"]);
		for (const id of PALETTE_IDS) {
			expect(PALETTES[id].id).toBe(id);
			expect(PALETTES[id].stops).toHaveLength(5);
		}
	});
});

describe("samplePalette", () => {
	const sunset = PALETTES.sunset;

	it("returns the first stop at u = 0", () => {
		expect(samplePalette(sunset, 0)).toEqual([255, 92, 140]);
	});

	it("returns exact stops at stop positions (5 stops → u = k/4)", () => {
		expect(samplePalette(sunset, 0.25)).toEqual([255, 150, 96]);
		expect(samplePalette(sunset, 0.5)).toEqual([255, 214, 138]);
	});

	it("interpolates linearly between stops", () => {
		const mid = samplePalette(sunset, 0.125); // halfway between stop 0 and 1
		expect(mid[0]).toBeCloseTo(255, 6);
		expect(mid[1]).toBeCloseTo((92 + 150) / 2, 6);
		expect(mid[2]).toBeCloseTo((140 + 96) / 2, 6);
	});

	it("wraps u outside [0, 1)", () => {
		expect(samplePalette(sunset, 1.25)).toEqual(samplePalette(sunset, 0.25));
		expect(samplePalette(sunset, -0.75)).toEqual(samplePalette(sunset, 0.25));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/palettes.test.ts`
Expected: FAIL — cannot resolve `../palettes`.

- [ ] **Step 3: Create `src/engine/palettes.ts`**

```ts
import type { PaletteId, RGB } from "./types";

export interface Palette {
	id: PaletteId;
	name: string;
	stops: RGB[];
}

export const PALETTES: Record<PaletteId, Palette> = {
	sunset: {
		id: "sunset",
		name: "Sunset",
		stops: [
			[255, 92, 140],
			[255, 150, 96],
			[255, 214, 138],
			[214, 96, 206],
			[150, 96, 255],
		],
	},
	neon: {
		id: "neon",
		name: "Neon",
		stops: [
			[86, 240, 255],
			[255, 64, 204],
			[126, 255, 190],
			[178, 120, 255],
			[86, 240, 255],
		],
	},
	aurora: {
		id: "aurora",
		name: "Aurora",
		stops: [
			[92, 255, 182],
			[86, 204, 255],
			[160, 120, 255],
			[64, 255, 222],
			[92, 255, 182],
		],
	},
	ember: {
		id: "ember",
		name: "Ember",
		stops: [
			[255, 72, 64],
			[255, 150, 60],
			[255, 206, 110],
			[255, 96, 150],
			[200, 50, 80],
		],
	},
	spectrum: {
		id: "spectrum",
		name: "Spectrum",
		stops: [
			[255, 80, 80],
			[255, 200, 60],
			[110, 255, 110],
			[70, 200, 255],
			[180, 110, 255],
		],
	},
};

export const PALETTE_IDS: PaletteId[] = ["sunset", "neon", "aurora", "ember", "spectrum"];

/** Piecewise-linear sample; u wraps around (ported from the design reference). */
export function samplePalette(palette: Palette, u: number): RGB {
	const stops = palette.stops;
	const n = stops.length - 1;
	const w = ((u % 1) + 1) % 1;
	const f = w * n;
	const i = Math.floor(f);
	const t = f - i;
	const a = stops[i];
	const b = stops[Math.min(n, i + 1)];
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/palettes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): five color palettes with wrap-around sampling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Engine LED layout

**Files:**
- Create: `src/engine/leds.ts`
- Test: `src/engine/__tests__/leds.test.ts`

**Interfaces:**
- Consumes: `Led`, `Point`, `Side` from `./types`.
- Produces: `LEDS_PER_FRAME = 24`; `LEDS_PER_EDGE = 6`; `buildLeds(): Led[]` — 24 LEDs ordered top→right→bottom→left, each edge two 3-LED strips (group centers 0.27/0.73, offsets −0.085/0/+0.085), ids `T1`–`T6`, `R1`–`R6`, `B1`–`B6`, `L1`–`L6`, perimeter coordinate `u = (edgeIdx + t) / 4`.

- [ ] **Step 1: Write the failing test `src/engine/__tests__/leds.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { LEDS_PER_EDGE, LEDS_PER_FRAME, buildLeds } from "../leds";
import type { Side } from "../types";

describe("buildLeds", () => {
	const leds = buildLeds();

	it("returns exactly 24 LEDs with sequential indices", () => {
		expect(LEDS_PER_FRAME).toBe(24);
		expect(leds).toHaveLength(24);
		leds.forEach((led, i) => expect(led.index).toBe(i));
	});

	it("has 6 LEDs per side", () => {
		const sides: Side[] = ["top", "right", "bottom", "left"];
		for (const side of sides) {
			expect(leds.filter((l) => l.side === side)).toHaveLength(LEDS_PER_EDGE);
		}
	});

	it("groups each edge into two strips of 3", () => {
		for (const side of ["top", "right", "bottom", "left"] as const) {
			const edge = leds.filter((l) => l.side === side);
			expect(edge.filter((l) => l.strip === 0)).toHaveLength(3);
			expect(edge.filter((l) => l.strip === 1)).toHaveLength(3);
			expect(edge.map((l) => l.strip)).toEqual([0, 0, 0, 1, 1, 1]);
		}
	});

	it("has unique ids in EdgeCode+Number form", () => {
		const ids = leds.map((l) => l.id);
		expect(new Set(ids).size).toBe(24);
		expect(ids.slice(0, 6)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6"]);
		expect(ids[6]).toBe("R1");
		expect(ids[12]).toBe("B1");
		expect(ids[18]).toBe("L1");
	});

	it("places every LED on the frame border", () => {
		for (const led of leds) {
			const onBorder =
				led.position.x === 0 ||
				led.position.x === 1 ||
				led.position.y === 0 ||
				led.position.y === 1;
			expect(onBorder).toBe(true);
		}
	});

	it("has inward-pointing unit normals", () => {
		for (const led of leds) {
			const inner = {
				x: led.position.x + led.normal.x * 0.5,
				y: led.position.y + led.normal.y * 0.5,
			};
			expect(inner.x).toBeGreaterThan(0);
			expect(inner.x).toBeLessThan(1);
			expect(inner.y).toBeGreaterThan(0);
			expect(inner.y).toBeLessThan(1);
			expect(Math.hypot(led.normal.x, led.normal.y)).toBe(1);
		}
	});

	it("has strictly increasing perimeter coordinate u in [0, 1)", () => {
		for (let i = 1; i < leds.length; i++) {
			expect(leds[i].u).toBeGreaterThan(leds[i - 1].u);
		}
		expect(leds[0].u).toBeGreaterThanOrEqual(0);
		expect(leds[leds.length - 1].u).toBeLessThan(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/leds.test.ts`
Expected: FAIL — cannot resolve `../leds`.

- [ ] **Step 3: Create `src/engine/leds.ts`**

```ts
import type { Led, Point, Side } from "./types";

export const LEDS_PER_FRAME = 24;
export const LEDS_PER_EDGE = 6;

/**
 * Each edge carries two cut strips of 3 LEDs (matching a real LED-strip
 * installation): strip centers at 0.27 / 0.73 along the edge, LEDs offset
 * −0.085 / 0 / +0.085 within a strip. From the design reference.
 */
const GROUP_CENTERS = [0.27, 0.73] as const;
const WITHIN_GROUP = [-0.085, 0, 0.085] as const;

interface EdgeDef {
	side: Side;
	code: string;
	point: (t: number) => { position: Point; normal: Point };
}

const EDGES: EdgeDef[] = [
	{
		side: "top",
		code: "T",
		point: (t) => ({ position: { x: t, y: 0 }, normal: { x: 0, y: 1 } }),
	},
	{
		side: "right",
		code: "R",
		point: (t) => ({ position: { x: 1, y: t }, normal: { x: -1, y: 0 } }),
	},
	{
		side: "bottom",
		code: "B",
		point: (t) => ({ position: { x: 1 - t, y: 1 }, normal: { x: 0, y: -1 } }),
	},
	{
		side: "left",
		code: "L",
		point: (t) => ({ position: { x: 0, y: 1 - t }, normal: { x: 1, y: 0 } }),
	},
];

export function buildLeds(): Led[] {
	const leds: Led[] = [];
	let index = 0;
	EDGES.forEach((edge, edgeIdx) => {
		for (let k = 0; k < LEDS_PER_EDGE; k++) {
			const strip = Math.floor(k / 3) as 0 | 1;
			const t = GROUP_CENTERS[strip] + WITHIN_GROUP[k % 3];
			const { position, normal } = edge.point(t);
			leds.push({
				id: `${edge.code}${k + 1}`,
				index: index++,
				position,
				normal,
				side: edge.side,
				edgeIndex: k,
				strip,
				u: (edgeIdx + t) / 4,
			});
		}
	});
	return leds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/leds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): 24-LED frame layout as two 3-LED strips per edge

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Engine fiber generation

**Files:**
- Create: `src/engine/fibers.ts`
- Test: `src/engine/__tests__/fibers.test.ts`

**Interfaces:**
- Consumes: `createRng` from `./random`; `FIBER_SAMPLES`, `countCrossings`, `polylineLength`, `sampleCubicBezier` from `./geometry`; `buildLeds` from `./leds`; `Fiber`, `Frame` from `./types`.
- Produces: `MIN_ENDPOINT_DISTANCE = 0.42`; `MAX_PICK_TRIES = 14`; `generateFrame(seed: number, density: number): Frame` — deterministic; fibers connect two LEDs on different edges, ≥0.42 apart, no duplicate unordered pairs (all within a 14-try budget per fiber; on exhaustion the last candidate is accepted so fiber count always equals density).

- [ ] **Step 1: Write the failing test `src/engine/__tests__/fibers.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { generateFrame } from "../fibers";
import { FIBER_SAMPLES } from "../geometry";

describe("generateFrame", () => {
	it("is deterministic: same seed and density produce identical frames", () => {
		expect(generateFrame(7431, 16)).toEqual(generateFrame(7431, 16));
	});

	it("different seeds produce different layouts", () => {
		const a = generateFrame(1, 16);
		const b = generateFrame(2, 16);
		expect(a.fibers.map((f) => f.path)).not.toEqual(b.fibers.map((f) => f.path));
	});

	it("produces exactly `density` fibers", () => {
		expect(generateFrame(7431, 8).fibers).toHaveLength(8);
		expect(generateFrame(7431, 24).fibers).toHaveLength(24);
	});

	it("every fiber references two valid LEDs and spans them exactly", () => {
		const frame = generateFrame(2024, 18);
		for (const fiber of frame.fibers) {
			const a = frame.leds[fiber.startLedIndex];
			const b = frame.leds[fiber.endLedIndex];
			expect(a).toBeDefined();
			expect(b).toBeDefined();
			expect(fiber.path).toHaveLength(FIBER_SAMPLES);
			expect(fiber.path[0]).toEqual(a.position);
			const last = fiber.path[fiber.path.length - 1];
			expect(last.x).toBeCloseTo(b.position.x, 10);
			expect(last.y).toBeCloseTo(b.position.y, 10);
			expect(fiber.length).toBeGreaterThan(0);
			expect(fiber.thickness).toBeGreaterThanOrEqual(0.85);
			expect(fiber.thickness).toBeLessThan(1.35);
		}
	});

	it("routing constraints hold across seeds 1–30 at density 16", () => {
		for (let seed = 1; seed <= 30; seed++) {
			const frame = generateFrame(seed, 16);
			const pairs = new Set<string>();
			for (const fiber of frame.fibers) {
				const a = frame.leds[fiber.startLedIndex];
				const b = frame.leds[fiber.endLedIndex];
				expect(a.side).not.toBe(b.side);
				expect(
					Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y),
				).toBeGreaterThanOrEqual(0.42);
				const key =
					fiber.startLedIndex < fiber.endLedIndex
						? `${fiber.startLedIndex}-${fiber.endLedIndex}`
						: `${fiber.endLedIndex}-${fiber.startLedIndex}`;
				expect(pairs.has(key)).toBe(false);
				pairs.add(key);
			}
		}
	});

	it("counts crossings deterministically", () => {
		const frame = generateFrame(7431, 16);
		expect(frame.crossings).toBe(generateFrame(7431, 16).crossings);
		expect(frame.crossings).toBeGreaterThanOrEqual(0);
	});
});
```

Note on the seeds 1–30 test: generation is deterministic, so this either always passes or always fails. If a particular seed exhausts the 14-try budget and violates a constraint, that is the designed carve-out (spec §6) — verify the loop logic is exactly as written in Step 3 before relaxing anything, and if the implementation is correct but a seed genuinely exhausts the budget, exclude that seed with a comment explaining why.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`
Expected: FAIL — cannot resolve `../fibers`.

- [ ] **Step 3: Create `src/engine/fibers.ts`**

```ts
import {
	FIBER_SAMPLES,
	countCrossings,
	polylineLength,
	sampleCubicBezier,
} from "./geometry";
import { buildLeds } from "./leds";
import { createRng } from "./random";
import type { Fiber, Frame } from "./types";

/** Endpoints closer than this are rejected (no tiny or single-edge fibers). */
export const MIN_ENDPOINT_DISTANCE = 0.42;
/** Retry budget per fiber; on exhaustion the last candidate is accepted. */
export const MAX_PICK_TRIES = 14;

const CONTROL_MIN = 0.34;
const CONTROL_RANGE = 0.42;

function pairKey(a: number, b: number): string {
	return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Deterministically generate one frame's fiber layout from a seed.
 * Ported from the design reference, plus a no-duplicate-pairs constraint
 * (spec §6). Fibers always connect exactly two LEDs.
 */
export function generateFrame(seed: number, density: number): Frame {
	const rnd = createRng(seed);
	const leds = buildLeds();
	const fibers: Fiber[] = [];
	const usedPairs = new Set<string>();

	for (let f = 0; f < density; f++) {
		const startIndex = Math.floor(rnd() * leds.length);
		const start = leds[startIndex];
		let endIndex = startIndex;
		let end = start;
		let tries = 0;
		do {
			endIndex = Math.floor(rnd() * leds.length);
			end = leds[endIndex];
			tries++;
		} while (
			(end.side === start.side ||
				Math.hypot(
					start.position.x - end.position.x,
					start.position.y - end.position.y,
				) < MIN_ENDPOINT_DISTANCE ||
				usedPairs.has(pairKey(startIndex, endIndex))) &&
			tries < MAX_PICK_TRIES
		);
		usedPairs.add(pairKey(startIndex, endIndex));

		const dA = CONTROL_MIN + rnd() * CONTROL_RANGE;
		const dB = CONTROL_MIN + rnd() * CONTROL_RANGE;
		const p1 = {
			x: start.position.x + start.normal.x * dA,
			y: start.position.y + start.normal.y * dA,
		};
		const p2 = {
			x: end.position.x + end.normal.x * dB,
			y: end.position.y + end.normal.y * dB,
		};
		const path = sampleCubicBezier(start.position, p1, p2, end.position, FIBER_SAMPLES);

		fibers.push({
			id: `${seed}-${f}`,
			startLedIndex: startIndex,
			endLedIndex: endIndex,
			path,
			length: polylineLength(path),
			thickness: 0.85 + rnd() * 0.5,
			hueBase: (start.u + end.u) / 2,
		});
	}

	return {
		seed,
		leds,
		fibers,
		crossings: countCrossings(fibers.map((fiber) => fiber.path)),
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/fibers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): deterministic constrained fiber generation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Engine wall assembly

**Files:**
- Create: `src/engine/wall.ts`
- Test: `src/engine/__tests__/wall.test.ts`

**Interfaces:**
- Consumes: `generateFrame` from `./fibers`; `Frame`, `WallConfig` from `./types`.
- Produces: `deriveFrameSeeds(masterSeed: number, count: number): number[]` (exact formula `((masterSeed * 2654435761 + i * 40503) >>> 0) % 100000`); `generateWall(config: WallConfig): Frame[]`.

- [ ] **Step 1: Write the failing test `src/engine/__tests__/wall.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { deriveFrameSeeds, generateWall } from "../wall";

describe("deriveFrameSeeds", () => {
	it("matches the reference formula", () => {
		const seeds = deriveFrameSeeds(7431, 9);
		for (let i = 0; i < 9; i++) {
			expect(seeds[i]).toBe(((7431 * 2654435761 + i * 40503) >>> 0) % 100000);
		}
	});

	it("is deterministic and length-correct", () => {
		expect(deriveFrameSeeds(42, 36)).toEqual(deriveFrameSeeds(42, 36));
		expect(deriveFrameSeeds(42, 36)).toHaveLength(36);
	});
});

describe("generateWall", () => {
	it("generates one frame per seed with the requested density", () => {
		const frameSeeds = deriveFrameSeeds(7431, 4);
		const frames = generateWall({ gridSize: 2, fiberDensity: 12, frameSeeds });
		expect(frames).toHaveLength(4);
		frames.forEach((frame, i) => {
			expect(frame.seed).toBe(frameSeeds[i]);
			expect(frame.fibers).toHaveLength(12);
		});
	});

	it("replacing one frame seed changes only that frame", () => {
		const seeds = deriveFrameSeeds(7431, 4);
		const before = generateWall({ gridSize: 2, fiberDensity: 12, frameSeeds: seeds });
		const reseeded = [...seeds];
		reseeded[2] = 12345;
		const after = generateWall({ gridSize: 2, fiberDensity: 12, frameSeeds: reseeded });
		expect(after[0]).toEqual(before[0]);
		expect(after[1]).toEqual(before[1]);
		expect(after[3]).toEqual(before[3]);
		expect(after[2]).not.toEqual(before[2]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/wall.test.ts`
Expected: FAIL — cannot resolve `../wall`.

- [ ] **Step 3: Create `src/engine/wall.ts`**

```ts
import { generateFrame } from "./fibers";
import type { Frame, WallConfig } from "./types";

/** Per-frame seeds derived from the master seed (reference formula). */
export function deriveFrameSeeds(masterSeed: number, count: number): number[] {
	return Array.from(
		{ length: count },
		(_, i) => ((masterSeed * 2654435761 + i * 40503) >>> 0) % 100000,
	);
}

export function generateWall(config: WallConfig): Frame[] {
	return config.frameSeeds.map((seed) => generateFrame(seed, config.fiberDensity));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/wall.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): wall assembly from master-seed-derived frame seeds

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Engine animation patterns

**Files:**
- Create: `src/engine/animation.ts`
- Test: `src/engine/__tests__/animation.test.ts`

**Interfaces:**
- Consumes: `hash` from `./random`; `Palette`, `samplePalette` from `./palettes`; `AnimationId`, `Led`, `LedLight` from `./types`.
- Produces: `interface AnimationDef { id: AnimationId; name: string }`; `ANIMATIONS: AnimationDef[]` (order: Flowing, Rainbow, Pulse, Breathing, Sparkle, Gradient); `ledColor(led: Led, gpos: number, time: number, anim: AnimationId, speed: number, palette: Palette): LedLight`. `gpos` is the frame's position gradient across the wall (0–1); `time` may be negative (delayed sampling) — formulas must accept it unchanged.

- [ ] **Step 1: Write the failing test `src/engine/__tests__/animation.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ANIMATIONS, ledColor } from "../animation";
import { buildLeds } from "../leds";
import { PALETTES } from "../palettes";

const leds = buildLeds();
const sunset = PALETTES.sunset;

describe("ANIMATIONS", () => {
	it("lists the six patterns in design order", () => {
		expect(ANIMATIONS.map((a) => a.id)).toEqual([
			"flow",
			"rainbow",
			"pulse",
			"breathe",
			"sparkle",
			"gradient",
		]);
		expect(ANIMATIONS.map((a) => a.name)).toEqual([
			"Flowing",
			"Rainbow",
			"Pulse",
			"Breathing",
			"Sparkle",
			"Gradient",
		]);
	});
});

describe("ledColor", () => {
	it("is deterministic", () => {
		for (const anim of ANIMATIONS) {
			expect(ledColor(leds[3], 0.5, 4.2, anim.id, 1, sunset)).toEqual(
				ledColor(leds[3], 0.5, 4.2, anim.id, 1, sunset),
			);
		}
	});

	it("flow and rainbow run at full brightness", () => {
		expect(ledColor(leds[0], 0, 1, "flow", 1, sunset).brightness).toBe(1);
		expect(ledColor(leds[0], 0, 1, "rainbow", 1, sunset).brightness).toBe(1);
	});

	it("pulse brightness stays within [0.22, 1]", () => {
		for (let t = 0; t < 12; t += 0.25) {
			const b = ledColor(leds[5], 0.3, t, "pulse", 1.5, sunset).brightness;
			expect(b).toBeGreaterThanOrEqual(0.22);
			expect(b).toBeLessThanOrEqual(1);
		}
	});

	it("breathe brightness stays within [0.2, 1]", () => {
		for (let t = 0; t < 12; t += 0.25) {
			const b = ledColor(leds[5], 0.3, t, "breathe", 1, sunset).brightness;
			expect(b).toBeGreaterThanOrEqual(0.2);
			expect(b).toBeLessThanOrEqual(1);
		}
	});

	it("flow color changes over time", () => {
		expect(ledColor(leds[0], 0, 0, "flow", 1, sunset).color).not.toEqual(
			ledColor(leds[0], 0, 2, "flow", 1, sunset).color,
		);
	});

	it("accepts negative time (delayed sampling) without throwing", () => {
		for (const anim of ANIMATIONS) {
			const out = ledColor(leds[7], 0.5, -1.3, anim.id, 1, sunset);
			expect(out.color).toHaveLength(3);
			expect(Number.isFinite(out.brightness)).toBe(true);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/animation.test.ts`
Expected: FAIL — cannot resolve `../animation`.

- [ ] **Step 3: Create `src/engine/animation.ts`**

Formulas ported verbatim from the design reference (including its quirks — e.g. `breathe` hue drifts with unscaled time, sparkle brightness may exceed 1 for negative time; keep them):

```ts
import type { Palette } from "./palettes";
import { samplePalette } from "./palettes";
import { hash } from "./random";
import type { AnimationId, Led, LedLight } from "./types";

export interface AnimationDef {
	id: AnimationId;
	name: string;
}

export const ANIMATIONS: AnimationDef[] = [
	{ id: "flow", name: "Flowing" },
	{ id: "rainbow", name: "Rainbow" },
	{ id: "pulse", name: "Pulse" },
	{ id: "breathe", name: "Breathing" },
	{ id: "sparkle", name: "Sparkle" },
	{ id: "gradient", name: "Gradient" },
];

/**
 * Animated color+brightness of one LED at a moment in time.
 * `gpos`: frame position gradient across the wall (0–1).
 * `time` may be negative — fibers sample LEDs at delayed times.
 */
export function ledColor(
	led: Led,
	gpos: number,
	time: number,
	anim: AnimationId,
	speed: number,
	palette: Palette,
): LedLight {
	const u = led.u;
	let huePhase = u;
	let brightness = 1;

	if (anim === "flow") {
		huePhase = u * 1.5 + time * speed * 0.11;
	} else if (anim === "rainbow") {
		huePhase = u * 3 + time * speed * 0.08;
	} else if (anim === "pulse") {
		huePhase = u * 0.6 + time * speed * 0.03;
		brightness = 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(time * speed * 2.6 + u * 6.283));
	} else if (anim === "breathe") {
		huePhase = u * 0.4 + time * 0.02;
		brightness = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(time * speed * 1.0));
	} else if (anim === "sparkle") {
		const cycle = Math.floor(time * speed * 1.8);
		const h = hash(cycle * 61 + led.index * 7 + Math.floor(gpos * 13) * 131);
		const phase = (time * speed * 1.8) % 1;
		brightness = h > 0.66 ? Math.max(0.06, 1 - phase) : 0.06;
		huePhase = u + h;
	} else if (anim === "gradient") {
		const g = 0.5 + 0.5 * Math.sin(time * speed * 0.55 - (gpos * 3.2 + u * 1.4));
		huePhase = gpos * 0.5 + u * 0.5 + time * speed * 0.02;
		brightness = 0.15 + 0.85 * g;
	}

	return { color: samplePalette(palette, huePhase), brightness };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/animation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): six LED drive animation patterns

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Engine light propagation

**Files:**
- Create: `src/engine/light.ts`
- Test: `src/engine/__tests__/light.test.ts`

**Interfaces:**
- Consumes: `LedLight`, `RGB` from `./types`.
- Produces: `TRAVEL = 1.15`; `DECAY = 1.95`; `MIN_SEGMENT_INTENSITY = 0.05`; `interface SegmentLight { color: RGB; intensity: number; visible: boolean }`; `blendSegment(start: LedLight, end: LedLight, um: number): SegmentLight` (um = normalized distance along fiber from start, 0–1); `delayedTime(time: number, distance: number): number` (= `time - distance * TRAVEL`).

- [ ] **Step 1: Write the failing test `src/engine/__tests__/light.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { TRAVEL, blendSegment, delayedTime } from "../light";
import type { LedLight } from "../types";

const red: LedLight = { color: [255, 0, 0], brightness: 1 };
const blue: LedLight = { color: [0, 0, 255], brightness: 1 };
const dark: LedLight = { color: [255, 255, 255], brightness: 0 };

describe("blendSegment", () => {
	it("blends toward purple at the midpoint of a red↔blue fiber", () => {
		const mid = blendSegment(red, blue, 0.5);
		expect(mid.visible).toBe(true);
		expect(mid.color[0]).toBeGreaterThan(0);
		expect(mid.color[2]).toBeGreaterThan(0);
		expect(mid.color[0]).toBeCloseTo(mid.color[2], 6);
		expect(mid.color[1]).toBeCloseTo(0, 6);
	});

	it("is dominated by the nearer LED", () => {
		const nearRed = blendSegment(red, blue, 0.1);
		expect(nearRed.color[0]).toBeGreaterThan(nearRed.color[2]);
		const nearBlue = blendSegment(red, blue, 0.9);
		expect(nearBlue.color[2]).toBeGreaterThan(nearBlue.color[0]);
	});

	it("intensity is higher near an endpoint than at the midpoint", () => {
		expect(blendSegment(red, blue, 0.05).intensity).toBeGreaterThan(
			blendSegment(red, blue, 0.5).intensity,
		);
	});

	it("fades monotonically toward a dark end", () => {
		let prev = Number.POSITIVE_INFINITY;
		for (const um of [0.1, 0.3, 0.5, 0.7, 0.9]) {
			const seg = blendSegment(red, dark, um);
			expect(seg.intensity).toBeLessThan(prev);
			prev = seg.intensity;
		}
	});

	it("reports invisible when both ends are off", () => {
		const seg = blendSegment(dark, dark, 0.5);
		expect(seg.visible).toBe(false);
		expect(seg.intensity).toBe(0);
	});

	it("clamps intensity to 1", () => {
		expect(blendSegment(red, blue, 0.02).intensity).toBeLessThanOrEqual(1);
	});
});

describe("delayedTime", () => {
	it("subtracts travel delay proportional to distance", () => {
		expect(delayedTime(10, 2)).toBeCloseTo(10 - 2 * TRAVEL, 10);
		expect(delayedTime(0, 1)).toBeCloseTo(-TRAVEL, 10);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/light.test.ts`
Expected: FAIL — cannot resolve `../light`.

- [ ] **Step 3: Create `src/engine/light.ts`**

```ts
import type { LedLight, RGB } from "./types";

/** Seconds of color travel delay per unit of fibre length (design reference). */
export const TRAVEL = 1.15;
/** Exponential brightness fall-off from an LED into the fibre. */
export const DECAY = 1.95;
/** Segments dimmer than this (sum of both contributions) are not drawn. */
export const MIN_SEGMENT_INTENSITY = 0.05;

export interface SegmentLight {
	color: RGB;
	/** 0–1, before the user brightness multiplier */
	intensity: number;
	visible: boolean;
}

/** Time at which a fiber point "sees" an LED `distance` away along the fiber. */
export function delayedTime(time: number, distance: number): number {
	return time - distance * TRAVEL;
}

/**
 * Light at normalized position `um` (0 = start LED, 1 = end LED) of a passive
 * fiber fed from both ends. Each LED's contribution decays exponentially with
 * distance; colors blend weighted by contribution.
 */
export function blendSegment(start: LedLight, end: LedLight, um: number): SegmentLight {
	const iA = start.brightness * Math.exp(-um * DECAY);
	const iB = end.brightness * Math.exp(-(1 - um) * DECAY);
	const total = iA + iB;
	if (total <= MIN_SEGMENT_INTENSITY) {
		return { color: [0, 0, 0], intensity: 0, visible: false };
	}
	const color: RGB = [
		(start.color[0] * iA + end.color[0] * iB) / total,
		(start.color[1] * iA + end.color[1] * iB) / total,
		(start.color[2] * iA + end.color[2] * iB) / total,
	];
	return { color, intensity: Math.min(1, total), visible: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/light.test.ts`
Expected: PASS. Then run the whole suite once: `npx vitest run` — all engine tests PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(engine): passive fiber light propagation with travel delay and decay

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Renderer — viewport, wall, connection map

**Files:**
- Create: `src/renderer/viewport.ts`
- Create: `src/renderer/wallRenderer.ts`
- Create: `src/renderer/mapRenderer.ts`

No unit tests (spec §11 limits automated tests to the engine). Verification is `npx tsc --noEmit` here plus browser verification in Task 15. Everything visual is ported 1:1 from `docs/reference/filament-studio.dc.html` `drawFrame`/`draw`/`drawMap` — compare against it, not your intuition.

**Interfaces:**
- Consumes: engine — `ledColor`, `Palette`, `samplePalette`, `blendSegment`, `delayedTime`, and types.
- Produces (used by Task 14):
  - `computeWallLayout(input: ViewportInput): WallLayout`, `frameRect(layout: WallLayout, index: number): FrameRect`, `frameGradientPos(index: number, gridSize: number): number`, `pickFrame(layout: WallLayout, frameCount: number, mx: number, my: number): number | null`
  - `drawWall(ctx: CanvasRenderingContext2D, width: number, height: number, state: WallDrawState): void`, `drawShowcaseFrame(ctx, width, height, frame: Frame, opts: ShowcaseOptions): void`
  - `drawConnectionMap(ctx, width, height, frame: Frame, selectedFiber: number | null, palette: Palette): MapGeometry`, `pickMapFiber(frame: Frame, x: number, y: number): number | null` (x/y normalized to map frame coords)

- [ ] **Step 1: Create `src/renderer/viewport.ts`**

```ts
import type { Point } from "@/engine/types";

export interface ViewportInput {
	gridSize: number;
	frameSize: number;
	zoom: number;
	pan: Point;
	canvasWidth: number;
	canvasHeight: number;
}

export interface WallLayout {
	gap: number;
	scale: number;
	tx: number;
	ty: number;
	frameSize: number;
	gridSize: number;
}

/** Wall fills 82% of the canvas at zoom 1, centered plus pan offset. */
export function computeWallLayout(input: ViewportInput): WallLayout {
	const { gridSize, frameSize, zoom, pan, canvasWidth, canvasHeight } = input;
	const gap = frameSize * 0.09;
	const wall = gridSize * frameSize + (gridSize - 1) * gap;
	const base = Math.min((canvasWidth * 0.82) / wall, (canvasHeight * 0.82) / wall);
	const scale = base * zoom;
	return {
		gap,
		scale,
		frameSize,
		gridSize,
		tx: canvasWidth / 2 + pan.x - (scale * wall) / 2,
		ty: canvasHeight / 2 + pan.y - (scale * wall) / 2,
	};
}

export interface FrameRect {
	x: number;
	y: number;
	size: number;
}

export function frameRect(layout: WallLayout, index: number): FrameRect {
	const gx = index % layout.gridSize;
	const gy = Math.floor(index / layout.gridSize);
	return {
		x: layout.tx + gx * (layout.frameSize + layout.gap) * layout.scale,
		y: layout.ty + gy * (layout.frameSize + layout.gap) * layout.scale,
		size: layout.frameSize * layout.scale,
	};
}

/** Diagonal position gradient of a frame across the wall, 0–1 (drives gradient/sparkle). */
export function frameGradientPos(index: number, gridSize: number): number {
	const gd = Math.max(1, gridSize - 1);
	const gx = index % gridSize;
	const gy = Math.floor(index / gridSize);
	return (gx + gy) / (2 * gd);
}

export function pickFrame(
	layout: WallLayout,
	frameCount: number,
	mx: number,
	my: number,
): number | null {
	for (let index = 0; index < frameCount; index++) {
		const rect = frameRect(layout, index);
		if (
			mx >= rect.x &&
			mx <= rect.x + rect.size &&
			my >= rect.y &&
			my <= rect.y + rect.size
		) {
			return index;
		}
	}
	return null;
}
```

- [ ] **Step 2: Create `src/renderer/wallRenderer.ts`**

```ts
import { ledColor } from "@/engine/animation";
import { blendSegment, delayedTime } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, Point } from "@/engine/types";
import { computeWallLayout, frameGradientPos, frameRect } from "./viewport";

/** Global glow multiplier (design prop default). */
const GLOW = 1;

export interface WallDrawState {
	frames: Frame[];
	gridSize: number;
	frameSize: number;
	zoom: number;
	pan: Point;
	mode: "edit" | "sim";
	selectedFrame: number | null;
	selectedFiber: number | null;
	time: number;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: Palette;
}

interface FrameDrawOptions {
	selected: boolean;
	selectedFiber: number | null;
	edit: boolean;
	gpos: number;
	time: number;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: Palette;
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

export function drawWall(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	state: WallDrawState,
): void {
	const layout = computeWallLayout({
		gridSize: state.gridSize,
		frameSize: state.frameSize,
		zoom: state.zoom,
		pan: state.pan,
		canvasWidth: width,
		canvasHeight: height,
	});
	const edit = state.mode === "edit";
	for (let index = 0; index < state.frames.length; index++) {
		const rect = frameRect(layout, index);
		const selected = index === state.selectedFrame;
		drawFrame(ctx, rect.x, rect.y, rect.size, state.frames[index], {
			selected,
			selectedFiber: selected ? state.selectedFiber : null,
			edit,
			gpos: frameGradientPos(index, state.gridSize),
			time: state.time,
			anim: state.anim,
			speed: state.speed,
			brightness: state.brightness,
			palette: state.palette,
		});
	}
}

export interface ShowcaseOptions {
	time: number;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: Palette;
}

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

function drawFrame(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	sz: number,
	frame: Frame,
	opts: FrameDrawOptions,
): void {
	const { selected, selectedFiber, edit, gpos, time, anim, speed, brightness, palette } =
		opts;
	const r = sz * 0.045;

	// bezel
	ctx.save();
	roundRect(ctx, x - sz * 0.03, y - sz * 0.03, sz * 1.06, sz * 1.06, r * 1.5);
	ctx.fillStyle = edit ? "#181a20" : "#141519";
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.05)";
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.restore();

	// panel + fibres (clipped)
	ctx.save();
	roundRect(ctx, x, y, sz, sz, r);
	ctx.clip();
	ctx.fillStyle = "#07080b";
	ctx.fillRect(x, y, sz, sz);
	const amb = samplePalette(palette, (time * 0.03) % 1);
	const ambientGradient = ctx.createRadialGradient(
		x + sz * 0.5,
		y + sz * 0.55,
		sz * 0.05,
		x + sz * 0.5,
		y + sz * 0.55,
		sz * 0.75,
	);
	ambientGradient.addColorStop(0, `rgba(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0},0.14)`);
	ambientGradient.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = ambientGradient;
	ctx.fillRect(x, y, sz, sz);

	ctx.globalCompositeOperation = "lighter";
	ctx.lineCap = "round";
	for (const fiber of frame.fibers) {
		const pts = fiber.path;
		const n = pts.length;
		const ledA = frame.leds[fiber.startLedIndex];
		const ledB = frame.leds[fiber.endLedIndex];

		// passive plastic light-guide (faint tinted body — continuous, no dots)
		const bodyColor = samplePalette(palette, fiber.hueBase);
		ctx.beginPath();
		for (let i = 0; i < n; i++) {
			const px = x + pts[i].x * sz;
			const py = y + pts[i].y * sz;
			if (i) ctx.lineTo(px, py);
			else ctx.moveTo(px, py);
		}
		ctx.strokeStyle = `rgba(${bodyColor[0] | 0},${bodyColor[1] | 0},${bodyColor[2] | 0},0.07)`;
		ctx.lineWidth = fiber.thickness * sz * 0.028;
		ctx.stroke();
		ctx.strokeStyle = "rgba(180,190,210,0.05)";
		ctx.lineWidth = fiber.thickness * sz * 0.01;
		ctx.stroke();

		// injected light from both LED ends
		let prevX = x + pts[0].x * sz;
		let prevY = y + pts[0].y * sz;
		for (let i = 1; i < n; i++) {
			const px = x + pts[i].x * sz;
			const py = y + pts[i].y * sz;
			const um = (i - 0.5) / (n - 1);
			const lightA = ledColor(
				ledA,
				gpos,
				delayedTime(time, um * fiber.length),
				anim,
				speed,
				palette,
			);
			const lightB = ledColor(
				ledB,
				gpos,
				delayedTime(time, (1 - um) * fiber.length),
				anim,
				speed,
				palette,
			);
			const seg = blendSegment(lightA, lightB, um);
			if (seg.visible) {
				const [cr, cg, cb] = seg.color;
				const inten = seg.intensity * brightness;
				ctx.beginPath();
				ctx.moveTo(prevX, prevY);
				ctx.lineTo(px, py);
				ctx.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(inten * 0.16 * GLOW).toFixed(3)})`;
				ctx.lineWidth = fiber.thickness * sz * 0.05 * GLOW;
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(prevX, prevY);
				ctx.lineTo(px, py);
				ctx.strokeStyle = `rgba(${Math.min(255, cr + 70) | 0},${Math.min(255, cg + 70) | 0},${Math.min(255, cb + 70) | 0},${Math.min(1, inten).toFixed(3)})`;
				ctx.lineWidth = fiber.thickness * sz * 0.014;
				ctx.stroke();
			}
			prevX = px;
			prevY = py;
		}
	}
	ctx.globalCompositeOperation = "source-over";

	// selected fibre highlight (edit mode)
	if (edit && selected && selectedFiber != null && frame.fibers[selectedFiber]) {
		const pts = frame.fibers[selectedFiber].path;
		ctx.beginPath();
		for (let i = 0; i < pts.length; i++) {
			const px = x + pts[i].x * sz;
			const py = y + pts[i].y * sz;
			if (i) ctx.lineTo(px, py);
			else ctx.moveTo(px, py);
		}
		ctx.strokeStyle = "rgba(255,255,255,0.85)";
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 5]);
		ctx.stroke();
		ctx.setLineDash([]);
	}
	ctx.restore();

	// panel border
	ctx.save();
	roundRect(ctx, x, y, sz, sz, r);
	if (selected) {
		ctx.strokeStyle = "rgba(155,140,255,0.9)";
		ctx.lineWidth = 2;
		ctx.shadowColor = "rgba(155,140,255,0.7)";
		ctx.shadowBlur = 16;
	} else {
		ctx.strokeStyle = "rgba(255,255,255,0.09)";
		ctx.lineWidth = 1;
	}
	ctx.stroke();
	ctx.restore();

	// LEDs embedded in the border — edit mode only
	if (edit) {
		// 3-LED strip backings (real cut LED-strip segments)
		ctx.save();
		for (let s = 0; s < frame.leds.length; s += 3) {
			const first = frame.leds[s];
			const last = frame.leds[s + 2];
			const ax = x + first.position.x * sz - first.normal.x * sz * 0.03;
			const ay = y + first.position.y * sz - first.normal.y * sz * 0.03;
			const cx = x + last.position.x * sz - last.normal.x * sz * 0.03;
			const cy = y + last.position.y * sz - last.normal.y * sz * 0.03;
			ctx.beginPath();
			ctx.moveTo(ax, ay);
			ctx.lineTo(cx, cy);
			ctx.strokeStyle = "rgba(255,255,255,0.14)";
			ctx.lineWidth = sz * 0.012;
			ctx.lineCap = "round";
			ctx.stroke();
		}
		ctx.restore();

		const selFiber =
			selected && selectedFiber != null ? frame.fibers[selectedFiber] : null;
		for (const led of frame.leds) {
			const light = ledColor(led, gpos, time, anim, speed, palette);
			const [lr, lg, lb] = light.color;
			const bx = x + led.position.x * sz - led.normal.x * sz * 0.03;
			const by = y + led.position.y * sz - led.normal.y * sz * 0.03;
			ctx.beginPath();
			ctx.arc(bx, by, sz * 0.017, 0, 6.283);
			ctx.fillStyle = "#0a0b0e";
			ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.12)";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(bx, by, sz * 0.0095, 0, 6.283);
			ctx.shadowColor = `rgba(${lr | 0},${lg | 0},${lb | 0},0.9)`;
			ctx.shadowBlur = sz * 0.03 * (0.4 + 0.6 * light.brightness);
			ctx.fillStyle = `rgba(${lr | 0},${lg | 0},${lb | 0},${0.4 + 0.6 * light.brightness})`;
			ctx.fill();
			ctx.shadowBlur = 0;
			if (
				selFiber &&
				(selFiber.startLedIndex === led.index || selFiber.endLedIndex === led.index)
			) {
				ctx.beginPath();
				ctx.arc(bx, by, sz * 0.022, 0, 6.283);
				ctx.strokeStyle = "#fff";
				ctx.lineWidth = 1.6;
				ctx.stroke();
			}
		}
	}
}
```

- [ ] **Step 3: Create `src/renderer/mapRenderer.ts`**

```ts
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { Frame } from "@/engine/types";

export interface MapGeometry {
	s: number;
	ox: number;
	oy: number;
}

/** Inspector connection map. Returns the geometry needed to hit-test clicks. */
export function drawConnectionMap(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: Frame,
	selectedFiber: number | null,
	palette: Palette,
): MapGeometry {
	ctx.clearRect(0, 0, width, height);
	const s = Math.min(width, height) * 0.84;
	const ox = (width - s) / 2;
	const oy = (height - s) / 2;

	ctx.strokeStyle = "rgba(255,255,255,0.08)";
	ctx.lineWidth = 1;
	ctx.strokeRect(ox, oy, s, s);

	ctx.globalCompositeOperation = "lighter";
	ctx.lineCap = "round";
	frame.fibers.forEach((fiber, fi) => {
		const active = fi === selectedFiber;
		const c = samplePalette(palette, fiber.hueBase);
		ctx.beginPath();
		fiber.path.forEach((p, i) => {
			const px = ox + p.x * s;
			const py = oy + p.y * s;
			if (i) ctx.lineTo(px, py);
			else ctx.moveTo(px, py);
		});
		ctx.strokeStyle = active
			? "rgba(255,255,255,0.95)"
			: `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0.45)`;
		ctx.lineWidth = active ? 2.2 : 1.2;
		ctx.stroke();
	});
	ctx.globalCompositeOperation = "source-over";

	const selFiber = selectedFiber != null ? frame.fibers[selectedFiber] : null;
	for (const led of frame.leds) {
		const on =
			!!selFiber &&
			(selFiber.startLedIndex === led.index || selFiber.endLedIndex === led.index);
		ctx.beginPath();
		ctx.arc(ox + led.position.x * s, oy + led.position.y * s, on ? 3 : 1.6, 0, 6.283);
		ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.3)";
		ctx.fill();
	}

	return { s, ox, oy };
}

/**
 * Nearest fiber to a point in normalized map-frame coordinates
 * (caller converts from pixels using MapGeometry). Threshold 0.05.
 */
export function pickMapFiber(frame: Frame, x: number, y: number): number | null {
	let best = -1;
	let bestDist = 0.05;
	frame.fibers.forEach((fiber, fi) => {
		for (let i = 0; i < fiber.path.length; i += 2) {
			const d = Math.hypot(fiber.path[i].x - x, fiber.path[i].y - y);
			if (d < bestDist) {
				bestDist = d;
				best = fi;
			}
		}
	});
	return best >= 0 ? best : null;
}
```

- [ ] **Step 4: Verify typecheck and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all engine tests still PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(renderer): wall/frame canvas renderer, viewport math, connection map

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: React hooks and persistence

**Files:**
- Create: `src/components/filament/useAnimationLoop.ts`
- Create: `src/components/filament/useCanvasInteraction.ts`
- Create: `src/components/filament/storage.ts`

No unit tests (UI layer). Verify with `npx tsc --noEmit`.

**Interfaces:**
- Produces (used by Task 14):
  - `useAnimationLoop(step: (dt: number) => void): void` — rAF loop with dt clamped to 0.05 s, plus a 40 ms interval fallback that calls `step(0.04)` while the tab is hidden. `step` must be referentially stable (the effect re-subscribes when it changes).
  - `useCanvasInteraction(canvasRef: RefObject<HTMLCanvasElement | null>, interaction: CanvasInteraction): void` with `interface CanvasInteraction { getPan(): Point; setPan(x: number, y: number): void; onZoomFactor(factor: number): void; onClickAt(x: number, y: number): void; onResize(width: number, height: number, dpr: number): void }` — handlers read via a ref, so callers may pass fresh objects every render.
  - `saveProject(snapshot: ProjectSnapshot): boolean`; `loadProject(): ProjectSnapshot | null` — localStorage key `"filament.project"`, both swallow storage errors.

- [ ] **Step 1: Create `src/components/filament/useAnimationLoop.ts`**

```ts
import { useEffect } from "react";

/**
 * Drives the simulation: requestAnimationFrame while visible, plus an
 * interval fallback so the wall keeps animating when the tab is hidden
 * (rAF is paused by browsers on hidden tabs).
 */
export function useAnimationLoop(step: (dt: number) => void): void {
	useEffect(() => {
		let last: number | null = null;
		let rafId = 0;
		const tick = () => {
			const now = performance.now();
			const dt = last === null ? 0.016 : Math.min(0.05, (now - last) / 1000);
			last = now;
			if (!document.hidden) step(dt);
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		const fallback = window.setInterval(() => {
			if (document.hidden) step(0.04);
		}, 40);
		return () => {
			cancelAnimationFrame(rafId);
			window.clearInterval(fallback);
		};
	}, [step]);
}
```

- [ ] **Step 2: Create `src/components/filament/useCanvasInteraction.ts`**

```ts
import { type RefObject, useEffect, useRef } from "react";
import type { Point } from "@/engine/types";

export interface CanvasInteraction {
	getPan: () => Point;
	setPan: (x: number, y: number) => void;
	onZoomFactor: (factor: number) => void;
	onClickAt: (x: number, y: number) => void;
	onResize: (width: number, height: number, dpr: number) => void;
}

/**
 * Wall-canvas interaction, ported from the design reference:
 * drag pans (a 4px movement threshold distinguishes a click), release
 * without movement selects, wheel zooms (×1.12 / ×0.89), and a
 * ResizeObserver keeps the backing store sized to the parent at DPR ≤ 1.75.
 */
export function useCanvasInteraction(
	canvasRef: RefObject<HTMLCanvasElement | null>,
	interaction: CanvasInteraction,
): void {
	const interactionRef = useRef(interaction);
	interactionRef.current = interaction;

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent) return;

		const resize = () => {
			const rect = parent.getBoundingClientRect();
			const dpr = Math.min(1.75, window.devicePixelRatio || 1);
			canvas.width = Math.round(rect.width * dpr);
			canvas.height = Math.round(rect.height * dpr);
			interactionRef.current.onResize(rect.width, rect.height, dpr);
		};
		const observer = new ResizeObserver(resize);
		observer.observe(parent);
		resize();

		let dragging = false;
		let moved = false;
		let startX = 0;
		let startY = 0;
		let panX = 0;
		let panY = 0;

		const onPointerDown = (e: PointerEvent) => {
			dragging = true;
			moved = false;
			startX = e.clientX;
			startY = e.clientY;
			const pan = interactionRef.current.getPan();
			panX = pan.x;
			panY = pan.y;
			canvas.setPointerCapture(e.pointerId);
			canvas.style.cursor = "grabbing";
		};
		const onPointerMove = (e: PointerEvent) => {
			if (!dragging) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
			interactionRef.current.setPan(panX + dx, panY + dy);
		};
		const onPointerUp = (e: PointerEvent) => {
			dragging = false;
			canvas.style.cursor = "grab";
			if (!moved) {
				const rect = canvas.getBoundingClientRect();
				interactionRef.current.onClickAt(e.clientX - rect.left, e.clientY - rect.top);
			}
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			interactionRef.current.onZoomFactor(e.deltaY < 0 ? 1.12 : 0.89);
		};

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			observer.disconnect();
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerUp);
			canvas.removeEventListener("wheel", onWheel);
		};
	}, [canvasRef]);
}
```

- [ ] **Step 3: Create `src/components/filament/storage.ts`**

```ts
import type { ProjectSnapshot } from "@/engine/types";

const STORAGE_KEY = "filament.project";

export function saveProject(snapshot: ProjectSnapshot): boolean {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
		return true;
	} catch {
		return false;
	}
}

export function loadProject(): ProjectSnapshot | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as ProjectSnapshot) : null;
	} catch {
		return null;
	}
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(ui): animation loop, canvas interaction hooks, localStorage persistence

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Presentational components — Header, LeftPanel, EmptyState

**Files:**
- Create: `src/components/filament/Header.tsx`
- Create: `src/components/filament/LeftPanel.tsx`
- Create: `src/components/filament/EmptyState.tsx`

Pure presentational components (props in, callbacks out — no engine imports, no state beyond props). All classes are Tailwind arbitrary-value conversions of the design file's inline styles — compare against `docs/reference/filament-studio.dc.html` when in doubt. `.font-grotesk`/`.font-smono` come from Task 1's CSS. Verify with `npx tsc --noEmit` (unused-export warnings do not occur; components are wired up in Task 14).

**Interfaces:**
- Produces (consumed by Task 14): `Header(props: HeaderProps)`, `LeftPanel(props: LeftPanelProps)`, `EmptyState({ onStart }: { onStart: () => void })` — exact prop shapes below.

- [ ] **Step 1: Create `src/components/filament/Header.tsx`**

```tsx
export interface HeaderProps {
	mode: "edit" | "sim";
	onModeChange: (mode: "edit" | "sim") => void;
	wallLabel: string;
	zoomPct: string;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
}

export function Header({
	mode,
	onModeChange,
	wallLabel,
	zoomPct,
	onZoomIn,
	onZoomOut,
	onFit,
}: HeaderProps) {
	return (
		<header className="z-20 flex h-[54px] flex-none items-center justify-between border-b border-white/[0.06] bg-[rgba(14,15,20,0.6)] px-[18px] backdrop-blur-[14px]">
			<div className="flex items-center gap-3">
				<div className="h-[26px] w-[26px] rounded-lg shadow-[0_0_18px_rgba(155,140,255,0.5)] [background:conic-gradient(from_210deg,#ff6b9d,#ffb36b,#9b8cff,#6bd8ff,#ff6b9d)]" />
				<div className="flex flex-col leading-[1.05]">
					<span className="text-sm font-semibold tracking-[0.01em]">Filament</span>
					<span className="text-[10px] tracking-[0.06em] text-[rgba(233,234,240,0.42)]">
						FIBRE OPTIC WALL STUDIO
					</span>
				</div>
			</div>
			<div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.02] p-[3px]">
				<ModeButton
					active={mode === "edit"}
					label="◧  Edit"
					onClick={() => onModeChange("edit")}
				/>
				<ModeButton
					active={mode === "sim"}
					label="▶  Simulate"
					onClick={() => onModeChange("sim")}
				/>
			</div>
			<div className="flex items-center gap-2.5">
				<span className="font-smono rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-[5px] text-[11px] text-[rgba(233,234,240,0.55)]">
					{wallLabel}
				</span>
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={onZoomOut}
						className="h-[30px] w-[30px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] text-[15px] leading-none text-[#e9eaf0] hover:bg-white/[0.07]"
					>
						–
					</button>
					<button
						type="button"
						onClick={onFit}
						className="font-smono h-[30px] min-w-[52px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 text-[11px] text-[rgba(233,234,240,0.75)] hover:bg-white/[0.07]"
					>
						{zoomPct}
					</button>
					<button
						type="button"
						onClick={onZoomIn}
						className="h-[30px] w-[30px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] text-[15px] leading-none text-[#e9eaf0] hover:bg-white/[0.07]"
					>
						+
					</button>
				</div>
			</div>
		</header>
	);
}

function ModeButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={
				active
					? "cursor-pointer rounded-lg bg-[rgba(155,140,255,0.22)] px-3.5 py-1.5 text-xs font-medium text-white"
					: "cursor-pointer rounded-lg bg-transparent px-3.5 py-1.5 text-xs font-medium text-[rgba(233,234,240,0.55)]"
			}
		>
			{label}
		</button>
	);
}
```

- [ ] **Step 2: Create `src/components/filament/LeftPanel.tsx`**

```tsx
import type { ReactNode } from "react";

const GRID_OPTIONS = [1, 2, 3, 4, 5, 6];
const LED_DOTS = Array.from({ length: 12 }, (_, i) => `dot-${i}`);

export interface LeftPanelProps {
	gridSize: number;
	onGridSize: (n: number) => void;
	frameSize: number;
	onFrameSize: (n: number) => void;
	fiberDensity: number;
	onFiberDensity: (n: number) => void;
	onReroute: () => void;
	onGenerate: () => void;
	onSave: () => void;
	onLoad: () => void;
	saveHint: string;
}

export function LeftPanel(props: LeftPanelProps) {
	return (
		<aside className="z-10 flex w-[264px] flex-none flex-col gap-3.5 overflow-y-auto border-r border-white/[0.05] bg-[rgba(12,13,17,0.4)] px-3.5 py-4">
			<SectionLabel>WALL</SectionLabel>

			<div className="flex flex-col gap-[9px]">
				<div className="text-xs text-[rgba(233,234,240,0.7)]">Grid size</div>
				<div className="flex gap-[5px]">
					{GRID_OPTIONS.map((n) => (
						<button
							key={n}
							type="button"
							onClick={() => props.onGridSize(n)}
							className={
								n === props.gridSize
									? "h-8 flex-1 cursor-pointer rounded-lg border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.16)] text-xs text-white"
									: "h-8 flex-1 cursor-pointer rounded-lg border border-white/[0.09] bg-white/[0.02] text-xs text-[rgba(233,234,240,0.65)]"
							}
						>
							{n}
						</button>
					))}
				</div>
			</div>

			<SliderRow label="Frame size" value={`${props.frameSize}px`}>
				<input
					type="range"
					min={150}
					max={340}
					step={2}
					value={props.frameSize}
					onChange={(e) => props.onFrameSize(Number(e.target.value))}
					className="w-full"
				/>
			</SliderRow>

			<Divider />
			<SectionLabel>FIBRES &amp; LEDS</SectionLabel>

			<div className="flex items-center gap-2.5 rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
				<div className="grid grid-cols-[repeat(6,4px)] grid-rows-[repeat(2,4px)] gap-[2px]">
					{LED_DOTS.map((id) => (
						<span key={id} className="h-1 w-1 rounded-full bg-[#9b8cff] opacity-70" />
					))}
				</div>
				<div className="leading-[1.3]">
					<div className="text-xs text-[#e9eaf0]">24 LEDs / frame</div>
					<div className="text-[10px] text-[rgba(233,234,240,0.4)]">6 per edge · fixed</div>
				</div>
			</div>

			<SliderRow label="Fibre runs / frame" value={String(props.fiberDensity)}>
				<input
					type="range"
					min={8}
					max={24}
					step={1}
					value={props.fiberDensity}
					onChange={(e) => props.onFiberDensity(Number(e.target.value))}
					className="w-full"
				/>
			</SliderRow>

			<div className="mt-1 flex flex-col gap-2">
				<button
					type="button"
					onClick={props.onReroute}
					className="flex h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.03] text-[12.5px] font-medium text-[#e9eaf0] hover:bg-white/[0.08]"
				>
					↻ Re-route fibres
				</button>
				<button
					type="button"
					onClick={props.onGenerate}
					className="h-10 cursor-pointer rounded-[10px] border border-[rgba(155,140,255,0.4)] bg-gradient-to-b from-[rgba(155,140,255,0.22)] to-[rgba(155,140,255,0.1)] text-[12.5px] font-semibold text-white shadow-[0_4px_18px_rgba(155,140,255,0.18)] hover:from-[rgba(155,140,255,0.32)] hover:to-[rgba(155,140,255,0.16)]"
				>
					✦ Generate new wall
				</button>
			</div>

			<Divider />
			<SectionLabel>PROJECT</SectionLabel>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={props.onSave}
					className="h-[34px] flex-1 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-xs text-[#e9eaf0] hover:bg-white/[0.08]"
				>
					Save
				</button>
				<button
					type="button"
					onClick={props.onLoad}
					className="h-[34px] flex-1 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-xs text-[#e9eaf0] hover:bg-white/[0.08]"
				>
					Load
				</button>
			</div>
			<div className="text-[10.5px] leading-normal text-[rgba(233,234,240,0.3)]">
				{props.saveHint}
			</div>

			<div className="flex-1" />
			<div className="border-t border-white/[0.05] pt-2.5 text-[9.5px] leading-relaxed tracking-[0.05em] text-[rgba(233,234,240,0.22)]">
				SOON · Draw fibres · Move LEDs · Layers · ESP32 live · DMX
			</div>
		</aside>
	);
}

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="text-[10px] font-semibold tracking-[0.14em] text-[rgba(233,234,240,0.34)]">
			{children}
		</div>
	);
}

function Divider() {
	return <div className="my-[2px] h-px bg-white/[0.05]" />;
}

function SliderRow({
	label,
	value,
	children,
}: {
	label: string;
	value: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-[7px]">
			<div className="flex items-baseline justify-between">
				<span className="text-xs text-[rgba(233,234,240,0.7)]">{label}</span>
				<span className="font-smono text-[11px] text-[#9b8cff]">{value}</span>
			</div>
			{children}
		</div>
	);
}
```

- [ ] **Step 3: Create `src/components/filament/EmptyState.tsx`**

```tsx
export function EmptyState({ onStart }: { onStart: () => void }) {
	return (
		<div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-[26px] [background:radial-gradient(60%_60%_at_50%_45%,rgba(10,11,14,0.2),rgba(10,11,14,0.75))]">
			<div className="flex animate-[fil-float_6s_ease-in-out_infinite] flex-col items-center gap-2.5 text-center">
				<div className="text-[26px] font-semibold tracking-[-0.01em]">
					Design light that flows.
				</div>
				<div className="max-w-[400px] text-[13.5px] leading-relaxed text-[rgba(233,234,240,0.5)]">
					Hidden LEDs around each frame inject colour into passive side-glow fibres.
					Generate a wall and watch the light travel.
				</div>
			</div>
			<button
				type="button"
				onClick={onStart}
				className="h-[46px] cursor-pointer rounded-xl border border-[rgba(155,140,255,0.5)] bg-gradient-to-b from-[rgba(155,140,255,0.28)] to-[rgba(155,140,255,0.12)] px-[26px] text-sm font-semibold text-white shadow-[0_8px_30px_rgba(155,140,255,0.28)] hover:from-[rgba(155,140,255,0.4)] hover:to-[rgba(155,140,255,0.2)]"
			>
				Create New Wall
			</button>
		</div>
	);
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(ui): header, left control panel, empty-state hero

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Presentational components — InspectorPanel, TransportBar

**Files:**
- Create: `src/components/filament/InspectorPanel.tsx`
- Create: `src/components/filament/TransportBar.tsx`

Same conventions as Task 12. The inspector reads display data straight from the selected `Frame` (stats, fiber inspect line); the connection-map canvas itself is drawn by the parent every tick — the inspector only hosts the `<canvas>` and forwards clicks.

**Interfaces:**
- Consumes: `ANIMATIONS` from `@/engine/animation`; `PALETTE_IDS`, `PALETTES` from `@/engine/palettes`; types.
- Produces (consumed by Task 14): `InspectorPanel(props: InspectorPanelProps)`, `TransportBar(props: TransportBarProps)` — exact prop shapes below.

- [ ] **Step 1: Create `src/components/filament/InspectorPanel.tsx`**

```tsx
import type { MouseEvent, ReactNode, RefObject } from "react";
import { ANIMATIONS } from "@/engine/animation";
import { PALETTE_IDS, PALETTES } from "@/engine/palettes";
import type { AnimationId, Frame, PaletteId } from "@/engine/types";

export interface InspectorPanelProps {
	frame: Frame | null;
	/** 0-based index of the selected frame in the wall, or null */
	frameNumber: number | null;
	empty: boolean;
	selectedFiber: number | null;
	mapCanvasRef: RefObject<HTMLCanvasElement | null>;
	onMapClick: (e: MouseEvent<HTMLCanvasElement>) => void;
	onReseed: () => void;
	anim: AnimationId;
	onAnim: (anim: AnimationId) => void;
	speed: number;
	onSpeed: (v: number) => void;
	brightness: number;
	onBrightness: (v: number) => void;
	palette: PaletteId;
	onPalette: (p: PaletteId) => void;
}

export function InspectorPanel(props: InspectorPanelProps) {
	const { frame, frameNumber } = props;
	return (
		<aside className="z-10 flex w-[288px] flex-none flex-col overflow-y-auto border-l border-white/[0.05] bg-[rgba(12,13,17,0.4)]">
			{frame && frameNumber != null ? (
				<SelectedFrame {...props} frame={frame} frameNumber={frameNumber} />
			) : !props.empty ? (
				<div className="flex h-full flex-1 flex-col items-center justify-center gap-2.5 p-[30px] text-center">
					<div className="h-[38px] w-[38px] rounded-[10px] border border-dashed border-white/[0.14]" />
					<div className="text-[12.5px] leading-relaxed text-[rgba(233,234,240,0.4)]">
						Select a frame on the wall
						<br />
						to edit its fibres &amp; LED pattern
					</div>
				</div>
			) : null}
		</aside>
	);
}

function SelectedFrame(
	props: InspectorPanelProps & { frame: Frame; frameNumber: number },
) {
	const { frame } = props;
	const avgLen = (
		(frame.fibers.reduce((acc, f) => acc + f.length, 0) / frame.fibers.length) *
		100
	).toFixed(0);

	let fiberInspect = "Click a fibre in the map to trace which LEDs feed it.";
	if (props.selectedFiber != null && frame.fibers[props.selectedFiber]) {
		const fiber = frame.fibers[props.selectedFiber];
		const a = frame.leds[fiber.startLedIndex];
		const b = frame.leds[fiber.endLedIndex];
		fiberInspect = `Fibre ${props.selectedFiber + 1}:  LED ${a.id}  →  LED ${b.id}   (fed from both ends)`;
	}

	return (
		<div className="flex flex-col gap-4 px-3.5 py-4">
			<div className="flex items-center justify-between">
				<div className="flex flex-col leading-[1.1]">
					<span className="text-[15px] font-semibold">
						Frame {String(props.frameNumber + 1).padStart(2, "0")}
					</span>
					<span className="font-smono text-[10.5px] text-[rgba(233,234,240,0.4)]">
						seed {frame.seed}
					</span>
				</div>
				<button
					type="button"
					onClick={props.onReseed}
					className="h-8 w-8 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-sm text-[#e9eaf0] hover:bg-white/[0.08]"
				>
					⟳
				</button>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<StatCard value={String(frame.fibers.length)} label="FIBRE RUNS" />
				<StatCard value="24" label="LEDS" />
				<StatCard value={String(frame.crossings)} label="CROSSINGS" />
				<StatCard value={avgLen} label="AVG LEN" />
			</div>

			<div>
				<div className="mb-[9px] flex items-center justify-between">
					<span className="text-[10px] font-semibold tracking-[0.14em] text-[rgba(233,234,240,0.34)]">
						CONNECTION MAP
					</span>
					<span className="text-[9.5px] text-[rgba(233,234,240,0.3)]">click a fibre</span>
				</div>
				<canvas
					ref={props.mapCanvasRef}
					onClick={props.onMapClick}
					className="block h-[150px] w-full cursor-pointer rounded-xl border border-white/[0.07] bg-[#08090c]"
				/>
				<div className="font-smono mt-2 text-[11px] leading-normal text-[rgba(233,234,240,0.5)]">
					{fiberInspect}
				</div>
			</div>

			<div>
				<div className="mb-[9px] text-[10px] font-semibold tracking-[0.14em] text-[rgba(233,234,240,0.34)]">
					LED DRIVE PATTERN
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					{ANIMATIONS.map((a) => (
						<button
							key={a.id}
							type="button"
							onClick={() => props.onAnim(a.id)}
							className={
								a.id === props.anim
									? "h-[34px] cursor-pointer rounded-[9px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.16)] text-[11.5px] text-white"
									: "h-[34px] cursor-pointer rounded-[9px] border border-white/[0.08] bg-white/[0.02] text-[11.5px] text-[rgba(233,234,240,0.62)]"
							}
						>
							{a.name}
						</button>
					))}
				</div>
			</div>

			<SliderRow label="Animation speed" value={`${props.speed.toFixed(1)}×`}>
				<input
					type="range"
					min={0.1}
					max={3}
					step={0.1}
					value={props.speed}
					onChange={(e) => props.onSpeed(Number(e.target.value))}
					className="w-full"
				/>
			</SliderRow>
			<SliderRow label="LED brightness" value={`${Math.round(props.brightness * 100)}%`}>
				<input
					type="range"
					min={0.2}
					max={1}
					step={0.02}
					value={props.brightness}
					onChange={(e) => props.onBrightness(Number(e.target.value))}
					className="w-full"
				/>
			</SliderRow>

			<div>
				<div className="mb-[9px] text-[10px] font-semibold tracking-[0.14em] text-[rgba(233,234,240,0.34)]">
					COLOUR PALETTE
				</div>
				<div className="flex flex-col gap-1.5">
					{PALETTE_IDS.map((id) => {
						const p = PALETTES[id];
						const gradient = `linear-gradient(90deg, ${p.stops
							.map(
								(c, i) =>
									`rgb(${c[0]},${c[1]},${c[2]}) ${Math.round((i / (p.stops.length - 1)) * 100)}%`,
							)
							.join(", ")})`;
						const active = id === props.palette;
						return (
							<button
								key={id}
								type="button"
								onClick={() => props.onPalette(id)}
								className={
									active
										? "flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[10px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.12)] px-[11px] text-left text-xs text-white"
										: "flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-[11px] text-left text-xs text-[rgba(233,234,240,0.7)]"
								}
							>
								<span
									className="inline-block h-3.5 w-11 rounded-[5px] shadow-[0_0_10px_rgba(255,255,255,0.08)]"
									style={{ background: gradient }}
								/>
								<span>{p.name}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function StatCard({ value, label }: { value: string; label: string }) {
	return (
		<div className="rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-[11px]">
			<div className="font-smono text-[19px] font-semibold text-[#e9eaf0]">{value}</div>
			<div className="mt-[2px] text-[10px] text-[rgba(233,234,240,0.42)]">{label}</div>
		</div>
	);
}

function SliderRow({
	label,
	value,
	children,
}: {
	label: string;
	value: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-[7px]">
			<div className="flex items-baseline justify-between">
				<span className="text-xs text-[rgba(233,234,240,0.7)]">{label}</span>
				<span className="font-smono text-[11px] text-[#9b8cff]">{value}</span>
			</div>
			{children}
		</div>
	);
}
```

- [ ] **Step 2: Create `src/components/filament/TransportBar.tsx`**

```tsx
import type { RefObject } from "react";

const SPEED_PRESETS = [0.5, 1, 1.5, 2];

export interface TransportBarProps {
	playing: boolean;
	onPlayPause: () => void;
	onStop: () => void;
	loop: boolean;
	onLoop: () => void;
	speed: number;
	onSpeedPreset: (v: number) => void;
	onScrub: (value: number) => void;
	timeRef: RefObject<HTMLSpanElement | null>;
	scrubRef: RefObject<HTMLInputElement | null>;
	duration: number;
}

export function TransportBar(props: TransportBarProps) {
	return (
		<footer className="z-20 flex h-[74px] flex-none items-center gap-[18px] border-t border-white/[0.06] bg-[rgba(14,15,20,0.6)] px-[18px] backdrop-blur-[14px]">
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					onClick={props.onPlayPause}
					className={
						props.playing
							? "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.05] text-[13px] text-white"
							: "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.2)] text-[13px] text-white"
					}
				>
					{props.playing ? "❚❚" : "▶"}
				</button>
				<button
					type="button"
					onClick={props.onStop}
					className="h-9 w-9 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-xs text-[#e9eaf0] hover:bg-white/[0.08]"
				>
					◼
				</button>
				<button
					type="button"
					onClick={props.onLoop}
					className={
						props.loop
							? "h-9 w-9 cursor-pointer rounded-[9px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.16)] text-sm text-[#c9beff]"
							: "h-9 w-9 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-sm text-[rgba(233,234,240,0.6)]"
					}
				>
					↺
				</button>
			</div>
			<span
				ref={props.timeRef}
				className="font-smono min-w-[88px] text-xs text-[rgba(233,234,240,0.6)]"
			>
				0:00 / 0:12
			</span>
			<div className="flex flex-1 flex-col gap-[5px]">
				<input
					ref={props.scrubRef}
					type="range"
					min={0}
					max={1000}
					step={1}
					defaultValue={0}
					onInput={(e) => props.onScrub(Number(e.currentTarget.value))}
					className="w-full"
				/>
				<div className="font-smono flex justify-between text-[9px] tracking-[0.05em] text-[rgba(233,234,240,0.22)]">
					<span>KEYFRAMES · SOON</span>
					<span>LOOP {props.duration}s</span>
				</div>
			</div>
			<div className="flex items-center gap-2.5">
				<span className="text-[11px] text-[rgba(233,234,240,0.5)]">Speed</span>
				<div className="flex gap-1">
					{SPEED_PRESETS.map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => props.onSpeedPreset(v)}
							className={
								Math.abs(v - props.speed) < 0.01
									? "font-smono h-[26px] min-w-[34px] cursor-pointer rounded-[7px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.16)] px-1.5 text-[11px] text-white"
									: "font-smono h-[26px] min-w-[34px] cursor-pointer rounded-[7px] border border-white/[0.08] bg-white/[0.02] px-1.5 text-[11px] text-[rgba(233,234,240,0.6)]"
							}
						>
							{v}×
						</button>
					))}
				</div>
			</div>
		</footer>
	);
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(ui): frame inspector panel and transport bar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: FilamentStudio integration + route

**Files:**
- Create: `src/components/filament/FilamentStudio.tsx`
- Modify: `src/routes/index.tsx` (replace entirely)

Wires everything together: UI state, refs for per-tick mutables, the draw pipeline, and all control actions. Frames live in refs (regenerated only on config/seed changes); the clock/scrubber update the DOM imperatively so React does not re-render per animation frame.

**Interfaces:**
- Consumes: everything produced by Tasks 5–13 (exact names as defined there).
- Produces: `FilamentStudio(): JSX element` — the full-screen app, mounted at route `/`.

- [ ] **Step 1: Create `src/components/filament/FilamentStudio.tsx`**

```tsx
import { useCallback, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { generateFrame } from "@/engine/fibers";
import { PALETTES } from "@/engine/palettes";
import type {
	AnimationId,
	Frame,
	PaletteId,
	Point,
	ProjectSnapshot,
} from "@/engine/types";
import { deriveFrameSeeds, generateWall } from "@/engine/wall";
import type { MapGeometry } from "@/renderer/mapRenderer";
import { drawConnectionMap, pickMapFiber } from "@/renderer/mapRenderer";
import { computeWallLayout, pickFrame } from "@/renderer/viewport";
import { drawShowcaseFrame, drawWall } from "@/renderer/wallRenderer";
import { EmptyState } from "./EmptyState";
import { Header } from "./Header";
import { InspectorPanel } from "./InspectorPanel";
import { LeftPanel } from "./LeftPanel";
import { loadProject, saveProject } from "./storage";
import { TransportBar } from "./TransportBar";
import { useAnimationLoop } from "./useAnimationLoop";
import { useCanvasInteraction } from "./useCanvasInteraction";

const DURATION = 12;

interface StudioState {
	empty: boolean;
	mode: "edit" | "sim";
	gridSize: number;
	frameSize: number;
	fiberDensity: number;
	masterSeed: number;
	selectedFrame: number | null;
	selectedFiber: number | null;
	playing: boolean;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: PaletteId;
	loop: boolean;
	zoom: number;
	saved: boolean;
}

const INITIAL_STATE: StudioState = {
	empty: true,
	mode: "sim",
	gridSize: 3,
	frameSize: 236,
	fiberDensity: 16,
	masterSeed: 7431,
	selectedFrame: null,
	selectedFiber: null,
	playing: true,
	anim: "flow",
	speed: 1,
	brightness: 0.92,
	palette: "sunset",
	loop: true,
	zoom: 1,
	saved: false,
};

function randomSeed(): number {
	return Math.floor(Math.random() * 99999);
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const r = Math.floor(seconds % 60);
	return `${m}:${String(r).padStart(2, "0")}`;
}

export function FilamentStudio() {
	const [ui, setUi] = useState<StudioState>(INITIAL_STATE);
	const uiRef = useRef(ui);
	uiRef.current = ui;

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const scrubRef = useRef<HTMLInputElement | null>(null);
	const timeRef = useRef<HTMLSpanElement | null>(null);

	const tRef = useRef(0);
	const panRef = useRef<Point>({ x: 0, y: 0 });
	const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
	const framesRef = useRef<Frame[]>([]);
	const seedsRef = useRef<number[]>([]);
	const showcaseRef = useRef<Frame | null>(null);
	const mapGeoRef = useRef<MapGeometry | null>(null);

	const patch = useCallback((partial: Partial<StudioState>) => {
		setUi((prev) => ({ ...prev, ...partial }));
	}, []);

	const rebuild = useCallback(
		(gridSize: number, fiberDensity: number, masterSeed: number, seeds?: number[]) => {
			const count = gridSize * gridSize;
			seedsRef.current =
				seeds && seeds.length === count ? seeds : deriveFrameSeeds(masterSeed, count);
			framesRef.current = generateWall({
				gridSize,
				fiberDensity,
				frameSeeds: seedsRef.current,
			});
		},
		[],
	);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const { width, height, dpr } = sizeRef.current;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const s = uiRef.current;
		const palette = PALETTES[s.palette];
		if (s.empty) {
			if (!showcaseRef.current) showcaseRef.current = generateFrame(2024, 18);
			drawShowcaseFrame(ctx, width, height, showcaseRef.current, {
				time: tRef.current,
				anim: s.anim,
				speed: s.speed,
				brightness: s.brightness,
				palette,
			});
			return;
		}
		drawWall(ctx, width, height, {
			frames: framesRef.current,
			gridSize: s.gridSize,
			frameSize: s.frameSize,
			zoom: s.zoom,
			pan: panRef.current,
			mode: s.mode,
			selectedFrame: s.selectedFrame,
			selectedFiber: s.selectedFiber,
			time: tRef.current,
			anim: s.anim,
			speed: s.speed,
			brightness: s.brightness,
			palette,
		});
		const mapCanvas = mapCanvasRef.current;
		const frame =
			s.selectedFrame != null ? (framesRef.current[s.selectedFrame] ?? null) : null;
		if (mapCanvas && frame) {
			const rect = mapCanvas.getBoundingClientRect();
			if (rect.width > 0) {
				const mdpr = Math.min(2, window.devicePixelRatio || 1);
				if (mapCanvas.width !== Math.round(rect.width * mdpr)) {
					mapCanvas.width = Math.round(rect.width * mdpr);
					mapCanvas.height = Math.round(rect.height * mdpr);
				}
				const mctx = mapCanvas.getContext("2d");
				if (mctx) {
					mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
					mapGeoRef.current = drawConnectionMap(
						mctx,
						rect.width,
						rect.height,
						frame,
						s.selectedFiber,
						palette,
					);
				}
			}
		}
	}, []);

	const step = useCallback(
		(dt: number) => {
			const s = uiRef.current;
			if (s.playing) {
				tRef.current += dt;
				if (tRef.current >= DURATION) {
					if (s.loop) {
						tRef.current -= DURATION;
					} else {
						tRef.current = DURATION;
						setUi((prev) => ({ ...prev, playing: false }));
					}
				}
			}
			const scrub = scrubRef.current;
			if (scrub && document.activeElement !== scrub) {
				scrub.value = String(Math.round((tRef.current / DURATION) * 1000));
			}
			const timeEl = timeRef.current;
			if (timeEl) {
				timeEl.textContent = `${formatTime(tRef.current)} / ${formatTime(DURATION)}`;
			}
			draw();
		},
		[draw],
	);

	useAnimationLoop(step);

	useCanvasInteraction(canvasRef, {
		getPan: () => panRef.current,
		setPan: (x, y) => {
			panRef.current = { x, y };
		},
		onZoomFactor: (factor) =>
			setUi((prev) => ({
				...prev,
				zoom: Math.min(4, Math.max(0.3, prev.zoom * factor)),
			})),
		onClickAt: (x, y) => {
			const s = uiRef.current;
			if (s.empty) return;
			const layout = computeWallLayout({
				gridSize: s.gridSize,
				frameSize: s.frameSize,
				zoom: s.zoom,
				pan: panRef.current,
				canvasWidth: sizeRef.current.width,
				canvasHeight: sizeRef.current.height,
			});
			const index = pickFrame(layout, framesRef.current.length, x, y);
			setUi((prev) => ({ ...prev, selectedFrame: index, selectedFiber: null }));
		},
		onResize: (width, height, dpr) => {
			sizeRef.current = { width, height, dpr };
		},
	});

	const handleGridSize = (n: number) => {
		rebuild(n, ui.fiberDensity, ui.masterSeed);
		patch({ gridSize: n, selectedFrame: null, selectedFiber: null });
	};
	const handleDensity = (n: number) => {
		rebuild(ui.gridSize, n, ui.masterSeed, seedsRef.current);
		patch({ fiberDensity: n });
	};
	const handleReroute = () => {
		const seed = randomSeed();
		rebuild(ui.gridSize, ui.fiberDensity, seed);
		patch({ masterSeed: seed });
	};
	const handleGenerate = () => {
		const seed = randomSeed();
		rebuild(ui.gridSize, ui.fiberDensity, seed);
		patch({
			masterSeed: seed,
			empty: false,
			selectedFrame: null,
			selectedFiber: null,
		});
	};
	const handleReseed = () => {
		const s = uiRef.current;
		if (s.selectedFrame == null) return;
		const seed = randomSeed();
		seedsRef.current[s.selectedFrame] = seed;
		framesRef.current[s.selectedFrame] = generateFrame(seed, s.fiberDensity);
		patch({ selectedFiber: null });
	};
	const handleSave = () => {
		const s = uiRef.current;
		const snapshot: ProjectSnapshot = {
			gridSize: s.gridSize,
			frameSize: s.frameSize,
			fiberDensity: s.fiberDensity,
			masterSeed: s.masterSeed,
			seeds: seedsRef.current,
			anim: s.anim,
			speed: s.speed,
			brightness: s.brightness,
			palette: s.palette,
			mode: s.mode,
		};
		if (saveProject(snapshot)) patch({ saved: true });
	};
	const handleLoad = () => {
		const d = loadProject();
		if (!d) return;
		rebuild(d.gridSize, d.fiberDensity, d.masterSeed, d.seeds);
		patch({
			gridSize: d.gridSize,
			frameSize: d.frameSize,
			fiberDensity: d.fiberDensity,
			masterSeed: d.masterSeed,
			anim: d.anim,
			speed: d.speed,
			brightness: d.brightness,
			palette: d.palette,
			mode: d.mode ?? "sim",
			empty: false,
			selectedFrame: null,
			selectedFiber: null,
		});
	};
	const handleMapClick = (e: MouseEvent<HTMLCanvasElement>) => {
		const s = uiRef.current;
		const geo = mapGeoRef.current;
		if (s.selectedFrame == null || !geo) return;
		const frame = framesRef.current[s.selectedFrame];
		if (!frame) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - rect.left - geo.ox) / geo.s;
		const y = (e.clientY - rect.top - geo.oy) / geo.s;
		patch({ selectedFiber: pickMapFiber(frame, x, y) });
	};

	const selectedFrame =
		ui.selectedFrame != null ? (framesRef.current[ui.selectedFrame] ?? null) : null;
	const wallLabel = `${ui.gridSize} × ${ui.gridSize}  ·  ${ui.gridSize * ui.gridSize} frames  ·  ${ui.gridSize * ui.gridSize * 24} LEDs`;

	return (
		<div className="font-grotesk flex h-screen w-screen select-none flex-col overflow-hidden text-[#e9eaf0] [background:radial-gradient(140%_120%_at_50%_-20%,#14151b_0%,#0b0c0f_60%)]">
			<Header
				mode={ui.mode}
				onModeChange={(mode) => patch({ mode })}
				wallLabel={wallLabel}
				zoomPct={`${Math.round(ui.zoom * 100)}%`}
				onZoomIn={() =>
					setUi((prev) => ({ ...prev, zoom: Math.min(4, prev.zoom * 1.15) }))
				}
				onZoomOut={() =>
					setUi((prev) => ({ ...prev, zoom: Math.max(0.3, prev.zoom / 1.15) }))
				}
				onFit={() => {
					panRef.current = { x: 0, y: 0 };
					patch({ zoom: 1 });
				}}
			/>
			<div className="relative flex min-h-0 flex-1">
				<LeftPanel
					gridSize={ui.gridSize}
					onGridSize={handleGridSize}
					frameSize={ui.frameSize}
					onFrameSize={(n) => patch({ frameSize: n })}
					fiberDensity={ui.fiberDensity}
					onFiberDensity={handleDensity}
					onReroute={handleReroute}
					onGenerate={handleGenerate}
					onSave={handleSave}
					onLoad={handleLoad}
					saveHint={
						ui.saved ? "Saved to this browser ✓" : "Stores the current wall in this browser."
					}
				/>
				<section className="relative min-w-0 flex-1 overflow-hidden bg-[#0a0b0e]">
					<canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab" />
					{ui.empty ? <EmptyState onStart={handleGenerate} /> : null}
					<div className="font-smono pointer-events-none absolute bottom-3.5 left-3.5 z-[6] flex gap-1.5 text-[10px] text-[rgba(233,234,240,0.35)]">
						<HintChip>scroll · zoom</HintChip>
						<HintChip>drag · pan</HintChip>
						<HintChip>click · select</HintChip>
					</div>
					<div className="font-smono pointer-events-none absolute bottom-3.5 right-3.5 z-[6] rounded-md border border-white/[0.08] bg-[rgba(12,13,17,0.6)] px-[9px] py-1 text-[10px] text-[rgba(233,234,240,0.4)]">
						{ui.mode === "edit" ? "EDIT · LEDS VISIBLE" : "SIMULATE · INSTALLATION VIEW"}
					</div>
				</section>
				<InspectorPanel
					frame={selectedFrame}
					frameNumber={ui.selectedFrame}
					empty={ui.empty}
					selectedFiber={ui.selectedFiber}
					mapCanvasRef={mapCanvasRef}
					onMapClick={handleMapClick}
					onReseed={handleReseed}
					anim={ui.anim}
					onAnim={(anim) => patch({ anim })}
					speed={ui.speed}
					onSpeed={(speed) => patch({ speed })}
					brightness={ui.brightness}
					onBrightness={(brightness) => patch({ brightness })}
					palette={ui.palette}
					onPalette={(palette) => patch({ palette })}
				/>
			</div>
			<TransportBar
				playing={ui.playing}
				onPlayPause={() => patch({ playing: !ui.playing })}
				onStop={() => {
					tRef.current = 0;
					patch({ playing: false });
				}}
				loop={ui.loop}
				onLoop={() => patch({ loop: !ui.loop })}
				speed={ui.speed}
				onSpeedPreset={(speed) => patch({ speed })}
				onScrub={(value) => {
					tRef.current = (value / 1000) * DURATION;
				}}
				timeRef={timeRef}
				scrubRef={scrubRef}
				duration={DURATION}
			/>
		</div>
	);
}

function HintChip({ children }: { children: string }) {
	return (
		<span className="rounded-md border border-white/[0.06] bg-[rgba(12,13,17,0.55)] px-2 py-1">
			{children}
		</span>
	);
}
```

- [ ] **Step 2: Replace `src/routes/index.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { FilamentStudio } from "@/components/filament/FilamentStudio";

export const Route = createFileRoute("/")({ component: FilamentStudio });
```

- [ ] **Step 3: Verify typecheck, tests, and build**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: all pass, build succeeds.

- [ ] **Step 4: Smoke-check in the dev server**

Run `npm run dev` (port 3000), open `http://localhost:3000`, and confirm: dark UI renders with header/panels/transport; the empty state shows an animated showcase frame behind the hero text; "Create New Wall" reveals a 3×3 animated wall. Stop the server. (Full behavioural verification is Task 15.)

- [ ] **Step 5: Commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "feat(ui): FilamentStudio integration and index route

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: Full verification

**Files:** none created — this is the acceptance pass. Fix anything found (small fixes inline; regressions go back to the owning task's approach).

- [ ] **Step 1: Run the full automated gate**

```bash
npx vitest run && npx tsc --noEmit && npm run check && npx vite build
```

Expected: engine test files all green; no type errors; Biome clean; production build succeeds.

- [ ] **Step 2: Behavioural walkthrough in the browser**

Start `npm run dev` and verify against the design reference (`docs/reference/filament-studio.dc.html` behaviour list, spec §9):

1. **Empty state:** showcase frame animates behind "Design light that flows."; Create New Wall generates a 3×3 wall and hides the overlay.
2. **Fibers look right:** continuous glowing curves, brighter near frame edges (LED ends), dimmer mid-span; colors travel along fibers over time; no dotted-LED look.
3. **Modes:** Simulate hides all LED hardware; Edit shows strip backings + glowing LED dots; mode tag bottom-right updates.
4. **Selection:** clicking a frame shows violet border + inspector (stats, seed); clicking empty canvas deselects; reseed ⟳ changes only that frame; clicking a fibre in the connection map highlights it (white dashed on wall in edit mode, white in map, endpoint rings) and shows "Fibre N: LED Xn → LED Yn".
5. **Controls:** grid buttons 1–6 regenerate the wall and update the header label; frame-size slider rescales without regenerating layouts; density slider changes fibre count while keeping each frame's character (same seeds); Re-route/Generate produce new layouts.
6. **Animations & look:** all six patterns visibly differ; palette switch recolors wall + map + swatches; speed and brightness sliders take effect.
7. **Transport:** play/pause/stop/loop behave; scrubbing moves time (drag scrubber while paused — wall updates); time readout counts `0:00 / 0:12`; speed presets highlight.
8. **Viewport:** wheel zoom, drag pan, +/− buttons, Fit resets; zoom % updates.
9. **Persistence:** Save → hint shows "Saved to this browser ✓"; change grid/palette, then Load restores the saved wall exactly (same fibre layouts).
10. **Performance:** at 6×6 the animation stays visually smooth; no console errors anywhere.

- [ ] **Step 3: Fix anything found, re-run Step 1, commit**

```bash
npx biome check --write src vite.config.ts
git add -A
git commit -m "chore: verification fixes for Filament Studio

Co-Authored-By: Claude <noreply@anthropic.com>"
```

(Skip the commit if there was nothing to fix.)

---

## Plan Self-Review Notes

- **Spec coverage:** §1–2 (Tasks 5, 6, 9, 10), §3 decisions (LED strips → Task 5; grid 1–6 → Task 12; engine-only tests → Tasks 2–9; Tailwind conversion → Tasks 12–14; localStorage → Task 11; six animations → Task 8), §4 architecture (layering enforced by Global Constraints), §5 data model (Task 2), §6 generation (Tasks 6–7), §7 light/animation (Tasks 8–9), §8 rendering (Task 10), §9 UI behaviour (Tasks 12–14, verified in 15), §10 state (Task 14), §11 testing (Tasks 2–9 + gate in 15), §12 out of scope (nothing added).
- **Known intentional quirks kept from the reference:** breathe hue uses unscaled time; sparkle brightness can exceed 1 at negative (delayed) times; `pickMapFiber` samples every 2nd path point; fiber pair constraints are best-effort within a 14-try budget.





