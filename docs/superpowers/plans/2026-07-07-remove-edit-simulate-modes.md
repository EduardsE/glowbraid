# Remove Edit/Simulate Modes (3D-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Edit/Simulate tabs so the app is 3D-only, and delete the 2D canvas rendering stack that only Edit/Simulate drove.

**Architecture:** No engine changes. UI layer (`GlowbraidStudio.tsx`, `Header.tsx`, `LeftPanel.tsx`) drops the `mode` state machine and always renders the existing 3D view. Once nothing calls into the 2D canvas path, its renderer modules (`wallRenderer.ts`, `viewport.ts`'s layout/hit-testing, `dimensions.ts`, `lightMapping.ts`, `useCanvasInteraction.ts`) become dead code and are deleted or trimmed to the pieces the 3D renderer still imports.

**Tech Stack:** React 19, TanStack Start, Vitest, Biome, TypeScript, three.js (3D renderer, untouched).

## Global Constraints

- Layering is engine → renderer → UI; imports point left only (CLAUDE.md). No task touches `src/engine/` logic, only the `ProjectSnapshot` type.
- `ProjectSnapshot` field removals must not break loading legacy saves — removed fields are simply no longer read (CLAUDE.md's "tolerate absence" pattern, applied in reverse: tolerate presence of now-ignored extra keys).
- `renderer3d/wall3d.ts` must stay dynamically imported (`import("@/renderer3d/wall3d")`) — never add a static import of it or anything that transitively imports `three`, or three.js re-enters the initial bundle.
- Vitest only picks up `src/**/*.test.ts` (no `.tsx`/jsdom component tests today, per CLAUDE.md) — there is no automated test coverage for `GlowbraidStudio.tsx`/`Header.tsx`/`LeftPanel.tsx`. Verification for UI-layer tasks is `npx tsc --noEmit`, `npm run check`, and a manual `npm run dev` pass.
- Spec: `docs/superpowers/specs/2026-07-07-remove-edit-simulate-modes-design.md`.

---

## Task 1: Make the app 3D-only in the UI layer

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/components/glowbraid/Header.tsx`
- Modify: `src/components/glowbraid/LeftPanel.tsx`
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx`

**Interfaces:**
- Consumes: nothing new — all existing exports (`Wall3D`, `POUR_PALETTES`, `DEFAULT_BOARD_COLOR` from the *current* `@/renderer/wallRenderer` path, `computeWallLayout`/`pickFrame` from `@/renderer/viewport`, `useCanvasInteraction`) are still present on disk at the start of this task; Task 2 is what deletes/renames them.
- Produces: `Header` with props `{ wallLabel, zoomPct, onZoomIn, onZoomOut, onFit }` (no `mode`/`onModeChange`). `LeftPanel` with `showMeasurements`/`onShowMeasurements` removed from `LeftPanelProps`. `ProjectSnapshot` without `mode`/`showMeasurements`. These are the shapes Task 2 and Task 3 build on.

- [ ] **Step 1: Update `ProjectSnapshot` in `src/engine/types.ts`**

Remove the `showMeasurements` field (and its doc comment) and the `mode` field (and its doc comment). Reword the `frameColors` doc comment, which currently references the removed edit/sim distinction.

Replace:
```ts
  /** Pour palette id — validated against the renderer's POUR_PALETTES at load. Absent/unknown → "tidal". */
  boardArtPalette?: string;
  /** Blueprint dimension overlay toggle. Absent in legacy saves → loader defaults to false. */
  showMeasurements: boolean;
  masterSeed: number;
  seeds: number[];
  /** Per-frame bezel color (hex), parallel to `seeds`; null = use the default edit/sim pair. Absent or length-mismatched → loader defaults to all null. */
  frameColors?: (string | null)[];
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: PaletteId;
  /** FiberStyle axes, 0–1. Absent in legacy saves → loader defaults to 0.5. */
  curviness: number;
  randomness: number;
  /** FiberStyle socket depth, 0–1. Absent in legacy saves → loader defaults to 0.4. */
  socketDepth: number;
  /** Unknown values in legacy/hand-edited saves → loader falls back to "sim". */
  mode: "edit" | "sim" | "3d";
}
```

With:
```ts
  /** Pour palette id — validated against the renderer's POUR_PALETTES at load. Absent/unknown → "tidal". */
  boardArtPalette?: string;
  masterSeed: number;
  seeds: number[];
  /** Per-frame bezel color (hex), parallel to `seeds`; null = use the default bezel color. Absent or length-mismatched → loader defaults to all null. */
  frameColors?: (string | null)[];
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: PaletteId;
  /** FiberStyle axes, 0–1. Absent in legacy saves → loader defaults to 0.5. */
  curviness: number;
  randomness: number;
  /** FiberStyle socket depth, 0–1. Absent in legacy saves → loader defaults to 0.4. */
  socketDepth: number;
}
```

- [ ] **Step 2: Rewrite `src/components/glowbraid/Header.tsx`**

Remove the mode-switcher pill, its `ModeButton` sub-component, and the now-unused `PencilRuler`/`Play`/`Box` icon imports. Header keeps brand, wall label, and zoom controls only.

Replace the entire file contents with:
```tsx
import { Minus, Plus } from "lucide-react";
import { BrandMark } from "./BrandMark";

export interface HeaderProps {
  wallLabel: string;
  zoomPct: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function Header({
  wallLabel,
  zoomPct,
  onZoomIn,
  onZoomOut,
  onFit,
}: HeaderProps) {
  return (
    <header className="z-20 flex h-[54px] flex-none items-center justify-between border-b border-white/[0.06] bg-[rgba(14,15,20,0.6)] px-[18px] backdrop-blur-[14px]">
      <div className="flex items-center gap-3">
        <BrandMark size={26} />
        <div className="flex flex-col leading-[1.05]">
          <span className="text-sm font-semibold tracking-[0.01em]">
            Glowbraid
          </span>
          <span className="text-[10px] tracking-[0.06em] text-ink/40">
            FIBRE OPTIC WALL STUDIO
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="font-smono rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-[5px] text-[11px] text-ink/55">
          {wallLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-ink hover:bg-white/[0.07]"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onFit}
            className="font-smono h-[30px] min-w-[52px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 text-[11px] text-ink/75 hover:bg-white/[0.07] hover:text-ink"
          >
            {zoomPct}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-ink hover:bg-white/[0.07]"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Remove the measurements toggle from `src/components/glowbraid/LeftPanel.tsx`**

Three edits in this file:

1. Remove the two props from `LeftPanelProps`:

Replace:
```tsx
  frameOffset: number;
  onFrameOffset: (n: number) => void;
  showMeasurements: boolean;
  onShowMeasurements: (v: boolean) => void;
  boardColor: string;
```
With:
```tsx
  frameOffset: number;
  onFrameOffset: (n: number) => void;
  boardColor: string;
```

2. Remove the "Show measurements" row from the JSX:

Replace:
```tsx
      </SliderRow>

      <div className="flex items-center justify-between">
        <span className="text-xs text-ink/70">Show measurements</span>
        <Switch
          checked={props.showMeasurements}
          onChange={props.onShowMeasurements}
          ariaLabel="Show measurements"
        />
      </div>

      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-ink/70">Board color</div>
```
With:
```tsx
      </SliderRow>

      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-ink/70">Board color</div>
```

3. Remove the now-unused `Switch` component (its only caller was the row just deleted):

Replace:
```tsx
}

function Switch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={
        checked
          ? "relative h-[18px] w-8 cursor-pointer rounded-full border border-glow/60 bg-glow/30"
          : "relative h-[18px] w-8 cursor-pointer rounded-full border border-white/10 bg-white/[0.04] hover:border-white/20"
      }
    >
      <span
        className={
          checked
            ? "absolute left-0 top-[2px] h-3 w-3 translate-x-4 rounded-full bg-[#cfc6ff] transition-transform duration-200"
            : "absolute left-0 top-[2px] h-3 w-3 translate-x-[2px] rounded-full bg-ink/40 transition-transform duration-200"
        }
      />
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
```
With:
```tsx
}

function SectionLabel({ children }: { children: ReactNode }) {
```

- [ ] **Step 4: Rewrite `src/components/glowbraid/GlowbraidStudio.tsx`**

This removes: the `mode` state machine (`StudioState.mode`, `INITIAL_STATE.mode`, the loader's `mode` derivation, the autosave snapshot's `mode`, `handleMode`, the mode-keyed `ensure3D` effect, the mode branch in `draw()`, the mode ternaries in the JSX, the bottom-right status chip); the 2D canvas and everything that only served it (`canvasRef`, `panRef`, `sizeRef`, `StudioState.zoom`/`INITIAL_STATE.zoom`, the `useCanvasInteraction` hook call, the 2D `<canvas>` element, the `drawWall`/`computeWallLayout`/`pickFrame` imports and calls); and `showMeasurements` (state field, loader field, autosave field, `LeftPanel` prop). `DEFAULT_BOARD_COLOR` keeps importing from `@/renderer/wallRenderer` in this task — Task 2 moves it to `@/renderer/wallDefaults` and updates this import then.

Replace the entire file contents with:
```tsx
import type { MouseEvent, PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANIMATIONS } from "@/engine/animation";
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
import { PALETTES } from "@/engine/palettes";
import { hash } from "@/engine/random";
import type {
  AnimationId,
  FiberStyle,
  Frame,
  PaletteId,
  ProjectSnapshot,
} from "@/engine/types";
import { deriveFrameSeeds, generateWall } from "@/engine/wall";
import type { MapGeometry } from "@/renderer/mapRenderer";
import { drawConnectionMap, pickMapFiber } from "@/renderer/mapRenderer";
import { POUR_PALETTES, type PourPaletteId } from "@/renderer/pourField";
import { DEFAULT_BOARD_COLOR } from "@/renderer/wallRenderer";
import type { Wall3D } from "@/renderer3d/wall3d";
import { Header } from "./Header";
import { InspectorPanel } from "./InspectorPanel";
import { LeftPanel } from "./LeftPanel";
import { loadProject, saveProject } from "./storage";
import { TransportBar } from "./TransportBar";
import { useAnimationLoop } from "./useAnimationLoop";

const DURATION = 12;
/** Max pointer travel (client px) between down and up to count as a click, not an orbit-drag. */
const CLICK_DRAG_PX = 4;

interface StudioState {
  gridSize: number;
  frameSize: number;
  frameGap: number;
  boardPadding: number;
  cornerRadius: number;
  frameWidth: number;
  frameOffset: number;
  boardColor: string;
  boardArt: "none" | "pour";
  boardArtSeed: number;
  boardArtPalette: PourPaletteId;
  frameColors: (string | null)[];
  curviness: number;
  randomness: number;
  socketDepth: number;
  masterSeed: number;
  geometryVersion: number;
  selectedFrame: number | null;
  selectedFiber: number | null;
  playing: boolean;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: PaletteId;
  loop: boolean;
}

const INITIAL_MASTER_SEED = 7431;

const INITIAL_STATE: StudioState = {
  gridSize: 3,
  frameSize: 25,
  frameGap: 20,
  boardPadding: 4,
  cornerRadius: 15,
  frameWidth: 8,
  frameOffset: 2,
  boardColor: DEFAULT_BOARD_COLOR,
  boardArt: "none",
  boardArtSeed: deriveBoardArtSeed(INITIAL_MASTER_SEED),
  boardArtPalette: "tidal",
  frameColors: [],
  curviness: DEFAULT_FIBER_STYLE.curviness,
  randomness: DEFAULT_FIBER_STYLE.randomness,
  socketDepth: DEFAULT_FIBER_STYLE.socketDepth,
  masterSeed: INITIAL_MASTER_SEED,
  geometryVersion: 0,
  selectedFrame: null,
  selectedFiber: null,
  playing: true,
  anim: "flow",
  speed: 1,
  brightness: 0.92,
  palette: "sunset",
  loop: true,
};

function randomSeed(): number {
  return Math.floor(Math.random() * 99999);
}

/** Spec'd fallback: board-art seed derived deterministically from the wall's master seed. */
function deriveBoardArtSeed(masterSeed: number): number {
  return Math.floor(
    hash(Number.isFinite(masterSeed) ? masterSeed : 0) * 2 ** 31,
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const r = Math.floor(seconds % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function styleOf(s: {
  curviness: number;
  randomness: number;
  socketDepth: number;
}): FiberStyle {
  return {
    curviness: s.curviness,
    randomness: s.randomness,
    socketDepth: s.socketDepth,
  };
}

/** Loader sanitizer: legacy/hand-edited snapshots → finite 0–1 or fallback. */
function styleAxis(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** Loader sanitizer: cm dimension → integer within [min, max], else fallback. */
function cmField(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
}

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

function deriveGeometry(
  gridSize: number,
  masterSeed: number,
  style: FiberStyle,
  seeds?: number[],
): { seeds: number[]; frames: Frame[] } {
  const count = gridSize * gridSize;
  const resolvedSeeds =
    seeds && seeds.length === count
      ? seeds
      : deriveFrameSeeds(masterSeed, count);
  return {
    seeds: resolvedSeeds,
    frames: generateWall({ gridSize, frameSeeds: resolvedSeeds, style }),
  };
}

interface InitialProject {
  state: StudioState;
  seeds: number[];
  frames: Frame[];
}

function buildInitialProject(): InitialProject {
  const d = loadProject();
  if (!d) {
    const { seeds, frames } = deriveGeometry(
      INITIAL_STATE.gridSize,
      INITIAL_STATE.masterSeed,
      styleOf(INITIAL_STATE),
    );
    return { state: INITIAL_STATE, seeds, frames };
  }
  // Sanitize fields that would brick the render loop if a hand-edited or
  // legacy snapshot carries an unknown value (PALETTES[bad] → undefined →
  // the 3D renderer throws every frame). Kept minimal, not a full schema check.
  const palette: PaletteId = Object.hasOwn(PALETTES, d.palette)
    ? d.palette
    : "sunset";
  const anim: AnimationId = ANIMATIONS.some((a) => a.id === d.anim)
    ? d.anim
    : "flow";
  const gridSize = Math.min(
    6,
    Math.max(1, Math.round(Number(d.gridSize) || 3)),
  );
  const frameSize = cmField(d.frameSize, 25, 10, 40);
  const frameGap = cmField(d.frameGap, 20, 0, 30);
  const boardPadding = cmField(d.boardPadding, 4, 0, 20);
  const cornerRadius = cmField(d.cornerRadius, 15, 0, frameSize * 5);
  const frameWidth = cmField(d.frameWidth, 8, 1, frameSize * 5 - 1);
  const frameOffset = numField(d.frameOffset, 2, 0, 10);
  const boardColor =
    typeof d.boardColor === "string" ? d.boardColor : DEFAULT_BOARD_COLOR;
  const boardArt: StudioState["boardArt"] =
    d.boardArt === "pour" ? "pour" : "none";
  const boardArtSeed =
    typeof d.boardArtSeed === "number" && Number.isFinite(d.boardArtSeed)
      ? Math.floor(d.boardArtSeed)
      : deriveBoardArtSeed(d.masterSeed);
  const boardArtPalette: PourPaletteId =
    typeof d.boardArtPalette === "string" &&
    Object.hasOwn(POUR_PALETTES, d.boardArtPalette)
      ? (d.boardArtPalette as PourPaletteId)
      : "tidal";
  const frameCount = gridSize * gridSize;
  const frameColors: (string | null)[] =
    Array.isArray(d.frameColors) &&
    d.frameColors.length === frameCount &&
    d.frameColors.every((c) => c === null || typeof c === "string")
      ? d.frameColors
      : Array(frameCount).fill(null);
  const curviness = styleAxis(d.curviness, DEFAULT_FIBER_STYLE.curviness);
  const randomness = styleAxis(d.randomness, DEFAULT_FIBER_STYLE.randomness);
  const socketDepth = styleAxis(d.socketDepth, DEFAULT_FIBER_STYLE.socketDepth);
  const { seeds, frames } = deriveGeometry(
    gridSize,
    d.masterSeed,
    { curviness, randomness, socketDepth },
    d.seeds,
  );
  return {
    state: {
      ...INITIAL_STATE,
      gridSize,
      frameSize,
      frameGap,
      boardPadding,
      cornerRadius,
      frameWidth,
      frameOffset,
      boardColor,
      boardArt,
      boardArtSeed,
      boardArtPalette,
      frameColors,
      masterSeed: d.masterSeed,
      curviness,
      randomness,
      socketDepth,
      anim,
      speed: d.speed,
      brightness: d.brightness,
      palette,
    },
    seeds,
    frames,
  };
}

export function GlowbraidStudio() {
  const initialRef = useRef<InitialProject | null>(null);
  if (initialRef.current === null) {
    initialRef.current = buildInitialProject();
  }
  const initial = initialRef.current;

  const [ui, setUi] = useState<StudioState>(initial.state);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wall3dRef = useRef<Wall3D | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const disposedRef = useRef(false);
  const noticeTimerRef = useRef(0);
  const saveTimerRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrubRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  const tRef = useRef(0);
  const framesRef = useRef<Frame[]>(initial.frames);
  const seedsRef = useRef<number[]>(initial.seeds);
  const mapGeoRef = useRef<MapGeometry | null>(null);

  const patch = useCallback((partial: Partial<StudioState>) => {
    setUi((prev) => ({ ...prev, ...partial }));
  }, []);

  const ensure3D = useCallback(async () => {
    if (wall3dRef.current) return;
    try {
      const mod = await import("@/renderer3d/wall3d");
      const canvas = glCanvasRef.current;
      if (!disposedRef.current && !wall3dRef.current && canvas) {
        wall3dRef.current = mod.createWall3D(canvas);
      }
    } catch {
      setNotice("3D view unavailable");
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
    }
  }, []);

  const rebuild = useCallback(
    (
      gridSize: number,
      masterSeed: number,
      style: FiberStyle,
      seeds?: number[],
    ) => {
      const geometry = deriveGeometry(gridSize, masterSeed, style, seeds);
      seedsRef.current = geometry.seeds;
      framesRef.current = geometry.frames;
    },
    [],
  );

  const draw = useCallback(() => {
    const s = uiRef.current;
    const palette = PALETTES[s.palette];
    wall3dRef.current?.render({
      frames: framesRef.current,
      gridSize: s.gridSize,
      frameSize: s.frameSize,
      frameGap: s.frameGap,
      boardPadding: s.boardPadding,
      cornerRadius: s.cornerRadius,
      frameWidth: s.frameWidth,
      frameOffset: s.frameOffset,
      boardColor: s.boardColor,
      boardArt: s.boardArt,
      boardArtSeed: s.boardArtSeed,
      boardArtPalette: s.boardArtPalette,
      frameColors: s.frameColors,
      selectedFrame: s.selectedFrame,
      time: tRef.current,
      anim: s.anim,
      speed: s.speed,
      brightness: s.brightness,
      palette,
    });
    const mapCanvas = mapCanvasRef.current;
    const frame =
      s.selectedFrame != null
        ? (framesRef.current[s.selectedFrame] ?? null)
        : null;
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

  const handleGlPointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      // Only the primary button starts a potential select; right-drag is pan.
      pointerDownRef.current =
        e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    },
    [],
  );

  const handleGlPointerUp = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || e.button !== 0) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DRAG_PX)
        return;
      const index = wall3dRef.current?.pick(e.clientX, e.clientY) ?? null;
      setUi((prev) => ({ ...prev, selectedFrame: index, selectedFiber: null }));
    },
    [],
  );

  useEffect(() => {
    // Reset on every effect setup: React can run this effect's cleanup and
    // re-run it on the same instance (StrictMode-style double-invocation;
    // TanStack Start does this for client-only routes). Without the reset,
    // the flag latches true and ensure3D never creates the renderer.
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      window.clearTimeout(noticeTimerRef.current);
      wall3dRef.current?.dispose();
      wall3dRef.current = null;
    };
  }, []);

  useEffect(() => {
    void ensure3D();
  }, [ensure3D]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: exhaustive list ensures autosave on any persisted field change
  useEffect(() => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const s = uiRef.current;
      const snapshot: ProjectSnapshot = {
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap,
        boardPadding: s.boardPadding,
        cornerRadius: s.cornerRadius,
        frameWidth: s.frameWidth,
        frameOffset: s.frameOffset,
        boardColor: s.boardColor,
        boardArt: s.boardArt,
        boardArtSeed: s.boardArtSeed,
        boardArtPalette: s.boardArtPalette,
        frameColors: s.frameColors,
        masterSeed: s.masterSeed,
        seeds: seedsRef.current,
        anim: s.anim,
        speed: s.speed,
        brightness: s.brightness,
        palette: s.palette,
        curviness: s.curviness,
        randomness: s.randomness,
        socketDepth: s.socketDepth,
      };
      saveProject(snapshot);
    }, 400);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [
    ui.gridSize,
    ui.frameSize,
    ui.frameGap,
    ui.boardPadding,
    ui.cornerRadius,
    ui.frameWidth,
    ui.frameOffset,
    ui.boardColor,
    ui.boardArt,
    ui.boardArtSeed,
    ui.boardArtPalette,
    ui.frameColors,
    ui.masterSeed,
    ui.geometryVersion,
    ui.anim,
    ui.speed,
    ui.brightness,
    ui.palette,
    ui.curviness,
    ui.randomness,
    ui.socketDepth,
  ]);

  const handleGridSize = (n: number) => {
    rebuild(n, ui.masterSeed, styleOf(ui));
    patch({
      gridSize: n,
      selectedFrame: null,
      selectedFiber: null,
      frameColors: Array(n * n).fill(null),
    });
  };
  const handleReroute = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
      frameColors: Array(ui.gridSize * ui.gridSize).fill(null),
    });
  };
  const handleGenerate = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
      selectedFrame: null,
      selectedFiber: null,
      frameColors: Array(ui.gridSize * ui.gridSize).fill(null),
    });
  };
  const handleReseed = () => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const seed = randomSeed();
    seedsRef.current[s.selectedFrame] = seed;
    const frames = [...framesRef.current];
    frames[s.selectedFrame] = generateFrame(seed, styleOf(s));
    framesRef.current = frames;
    patch({ selectedFiber: null, geometryVersion: s.geometryVersion + 1 });
  };
  const handleFrameColor = (color: string) => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const frameColors = [...s.frameColors];
    frameColors[s.selectedFrame] = color;
    patch({ frameColors });
  };
  const handleApplyColorToAll = () => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const color = s.frameColors[s.selectedFrame];
    if (color == null) return;
    patch({ frameColors: Array(s.gridSize * s.gridSize).fill(color) });
  };
  const handleStyle = (partial: Partial<FiberStyle>) => {
    const s = uiRef.current;
    const style = { ...styleOf(s), ...partial };
    rebuild(s.gridSize, s.masterSeed, style, seedsRef.current);
    patch(partial);
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
    ui.selectedFrame != null
      ? (framesRef.current[ui.selectedFrame] ?? null)
      : null;
  const wallLabel = `${ui.gridSize} × ${ui.gridSize}  ·  ${ui.gridSize * ui.gridSize} frames  ·  ${ui.gridSize * ui.gridSize * 24} LEDs`;

  return (
    <div className="font-grotesk flex h-dvh w-screen select-none flex-col overflow-hidden text-ink [background:radial-gradient(140%_120%_at_50%_-20%,#15141c_0%,#0b0c0f_60%)]">
      <div
        aria-hidden="true"
        className="grain pointer-events-none fixed inset-0 z-50"
      />
      <Header
        wallLabel={wallLabel}
        zoomPct="3D"
        onZoomIn={() => wall3dRef.current?.dollyIn()}
        onZoomOut={() => wall3dRef.current?.dollyOut()}
        onFit={() => wall3dRef.current?.resetCamera()}
      />
      <div className="relative flex min-h-0 flex-1">
        <LeftPanel
          gridSize={ui.gridSize}
          onGridSize={handleGridSize}
          frameSize={ui.frameSize}
          onFrameSize={(n) => patch({ frameSize: n })}
          frameGap={ui.frameGap}
          onFrameGap={(n) => patch({ frameGap: n })}
          boardPadding={ui.boardPadding}
          onBoardPadding={(n) => patch({ boardPadding: n })}
          cornerRadius={ui.cornerRadius}
          onCornerRadius={(n) => patch({ cornerRadius: n })}
          frameWidth={ui.frameWidth}
          onFrameWidth={(n) => patch({ frameWidth: n })}
          frameOffset={ui.frameOffset}
          onFrameOffset={(n) => patch({ frameOffset: n })}
          boardColor={ui.boardColor}
          onBoardColor={(c) => patch({ boardColor: c })}
          boardArt={ui.boardArt}
          onBoardArt={(mode) => patch({ boardArt: mode })}
          boardArtPalette={ui.boardArtPalette}
          onBoardArtPalette={(id) => patch({ boardArtPalette: id })}
          onBoardArtReroll={() => patch({ boardArtSeed: randomSeed() })}
          curviness={ui.curviness}
          onCurviness={(v) => handleStyle({ curviness: v })}
          randomness={ui.randomness}
          onRandomness={(v) => handleStyle({ randomness: v })}
          socketDepth={ui.socketDepth}
          onSocketDepth={(v) => handleStyle({ socketDepth: v })}
          onReroute={handleReroute}
          onGenerate={handleGenerate}
        />
        <section className="relative min-w-0 flex-1 overflow-hidden bg-[#0a0b0e]">
          <canvas
            ref={glCanvasRef}
            onPointerDown={handleGlPointerDown}
            onPointerUp={handleGlPointerUp}
            className="absolute inset-0 block h-full w-full cursor-grab"
          />
          <div className="font-smono pointer-events-none absolute bottom-3.5 left-3.5 z-[6] flex gap-1.5 text-[10px] text-ink/35">
            <HintChip>drag · orbit</HintChip>
            <HintChip>right-drag · pan</HintChip>
            <HintChip>scroll · dolly</HintChip>
          </div>
          {notice ? (
            <div className="font-smono pointer-events-none absolute right-3.5 top-3.5 z-[6] rounded-md border border-white/[0.08] bg-[rgba(42,18,22,0.75)] px-[9px] py-1 text-[10px] text-[rgba(255,180,180,0.85)]">
              {notice}
            </div>
          ) : null}
        </section>
        <InspectorPanel
          frame={selectedFrame}
          frameNumber={ui.selectedFrame}
          selectedFiber={ui.selectedFiber}
          mapCanvasRef={mapCanvasRef}
          onMapClick={handleMapClick}
          onReseed={handleReseed}
          frameColor={
            ui.selectedFrame != null
              ? (ui.frameColors[ui.selectedFrame] ?? null)
              : null
          }
          onFrameColor={handleFrameColor}
          onApplyToAll={handleApplyColorToAll}
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

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 6: Lint/format check**

Run: `npm run check`
Expected: passes clean — in particular no unused-import warnings for `Point`, `computeWallLayout`, `pickFrame`, `drawWall`, `useCanvasInteraction` in `GlowbraidStudio.tsx`, and no unused-import warning for `ReactNode`/`Switch` fallout in `LeftPanel.tsx`.

- [ ] **Step 7: Existing Vitest suite still passes**

Run: `npm test`
Expected: all suites pass, unchanged from before this task (this task doesn't touch any `.test.ts` file or the modules they cover).

- [ ] **Step 8: Manual check**

Run: `npm run dev`, open the app in a browser.
Expected:
- App opens straight into the 3D view — no mode-switcher pill in the header.
- Orbit-drag, right-drag pan, scroll-to-dolly, and click-to-select-a-frame all work as before.
- Header zoom buttons dolly the 3D camera; the middle button reads "3D" and resets the camera on click.
- LeftPanel has no "Show measurements" row; every other control (grid size, sliders, board color/art, re-route, generate) still works.
- Changing grid size rebuilds the wall correctly.
- Reload the page — the wall persists (autosave/load still works).

- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/components/glowbraid/Header.tsx src/components/glowbraid/LeftPanel.tsx src/components/glowbraid/GlowbraidStudio.tsx
git commit -m "feat: make the app 3D-only, remove Edit/Simulate modes"
```

---

## Task 2: Delete the dead 2D rendering stack

**Files:**
- Delete: `src/components/glowbraid/useCanvasInteraction.ts`
- Delete: `src/renderer/dimensions.ts`, `src/renderer/__tests__/dimensions.test.ts`
- Delete: `src/renderer/lightMapping.ts`, `src/renderer/__tests__/lightMapping.test.ts`
- Delete: `src/renderer/__tests__/viewport.test.ts`
- Delete: `src/renderer/wallRenderer.ts`, `src/renderer/__tests__/wallRenderer.test.ts`
- Modify: `src/renderer/viewport.ts`
- Create: `src/renderer/wallDefaults.ts`, `src/renderer/__tests__/wallDefaults.test.ts`
- Modify: `src/renderer3d/wall3d.ts`
- Modify: `src/components/glowbraid/GlowbraidStudio.tsx`

**Interfaces:**
- Consumes: Task 1's end state — nothing in `components/glowbraid/` imports `drawWall`, `computeWallLayout`, `pickFrame`, or `useCanvasInteraction` anymore; `GlowbraidStudio.tsx` still imports `DEFAULT_BOARD_COLOR` from `@/renderer/wallRenderer`; `wall3d.ts` still imports `shadeForSim` from `@/renderer/wallRenderer`.
- Produces: `src/renderer/viewport.ts` exporting only `frameGradientPos(index: number, gridSize: number): number` (used by `renderer3d/fiberColors.ts`, signature unchanged). `src/renderer/wallDefaults.ts` exporting `DEFAULT_BOARD_COLOR: string` and `shadeForSim(hex: string): string` (both unchanged behavior, new home).

- [ ] **Step 1: Delete `useCanvasInteraction.ts`**

```bash
git rm src/components/glowbraid/useCanvasInteraction.ts
```

- [ ] **Step 2: Delete `dimensions.ts` and its test**

```bash
git rm src/renderer/dimensions.ts src/renderer/__tests__/dimensions.test.ts
```

- [ ] **Step 3: Delete `lightMapping.ts` and its test**

```bash
git rm src/renderer/lightMapping.ts src/renderer/__tests__/lightMapping.test.ts
```

- [ ] **Step 4: Delete `viewport.test.ts`**

Every test in this file exercises `computeWallLayout`/`frameRect`, both removed in Step 5.

```bash
git rm src/renderer/__tests__/viewport.test.ts
```

- [ ] **Step 5: Trim `src/renderer/viewport.ts` to just `frameGradientPos`**

Replace the entire file contents with:
```ts
/** Diagonal position gradient of a frame across the wall, 0–1 (drives gradient/sparkle). */
export function frameGradientPos(index: number, gridSize: number): number {
  const gd = Math.max(1, gridSize - 1);
  const gx = index % gridSize;
  const gy = Math.floor(index / gridSize);
  return (gx + gy) / (2 * gd);
}
```

- [ ] **Step 6: Create `src/renderer/wallDefaults.ts`**

```ts
/** Default backing-board / fibre-backdrop fill, used when no boardColor is set. */
export const DEFAULT_BOARD_COLOR = "#101114";

/**
 * Approximates the darkened installation-view bezel tone (the hardcoded
 * #181a20 → #141519 pair) for an arbitrary base color, so custom/preset frame
 * colors get the same relative dimming. The original pair's per-channel
 * ratios aren't perfectly uniform (0.83/0.81/0.78) — this uses a single 0.8
 * ratio as a close approximation rather than reproducing them exactly.
 */
export function shadeForSim(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * 0.8)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
```

- [ ] **Step 7: Delete `wallRenderer.ts`**

```bash
git rm src/renderer/wallRenderer.ts
```

- [ ] **Step 8: Update the import in `src/renderer3d/wall3d.ts`**

Replace:
```ts
import { shadeForSim } from "@/renderer/wallRenderer";
```
With:
```ts
import { shadeForSim } from "@/renderer/wallDefaults";
```

- [ ] **Step 9: Update the import in `src/components/glowbraid/GlowbraidStudio.tsx`**

Replace:
```ts
import { DEFAULT_BOARD_COLOR } from "@/renderer/wallRenderer";
```
With:
```ts
import { DEFAULT_BOARD_COLOR } from "@/renderer/wallDefaults";
```

- [ ] **Step 10: Create `src/renderer/__tests__/wallDefaults.test.ts`**

Same three cases as the old `wallRenderer.test.ts`'s `shadeForSim` block, pointed at the new module:
```ts
import { describe, expect, it } from "vitest";
import { shadeForSim } from "../wallDefaults";

describe("shadeForSim", () => {
  it("scales each RGB channel to ~80%, approximating the darkened installation-view bezel tone", () => {
    expect(shadeForSim("#181a20")).toBe("#13151a");
  });

  it("scales white down without any channel overflowing", () => {
    expect(shadeForSim("#ffffff")).toBe("#cccccc");
  });

  it("leaves black unchanged", () => {
    expect(shadeForSim("#000000")).toBe("#000000");
  });
});
```

- [ ] **Step 11: Delete `wallRenderer.test.ts`**

```bash
git rm src/renderer/__tests__/wallRenderer.test.ts
```

- [ ] **Step 12: Run the full Vitest suite**

Run: `npm test`
Expected: all suites pass, including the new `wallDefaults.test.ts` and the unchanged `renderer3d/__tests__/fiberColors.test.ts` (which depends on `frameGradientPos`).

- [ ] **Step 13: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit code 0. This is what catches any remaining reference to a deleted export (`computeWallLayout`, `pickFrame`, `frameRect`, `WallLayout`, `drawWall`, `frameGeometry`, `frameCornerRadii`, `FRAME_BEZEL_RATIO`) or a stale `@/renderer/wallRenderer` import path.

- [ ] **Step 14: Lint/format check**

Run: `npm run check`
Expected: passes clean.

- [ ] **Step 15: Manual check**

Run: `npm run dev`, open the app.
Expected: identical behavior to Task 1's manual check — 3D view, orbit/pan/dolly/select, board-art rendering (try switching board art to "Pour" in LeftPanel and confirm the board texture still renders), custom frame color still darkens correctly on the 3D bezel (select a frame, set a custom color, confirm it renders shaded like the default bezel).

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "refactor: delete the 2D canvas rendering stack, trim viewport/wallRenderer to what 3D still uses"
```

---

## Task 3: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the final file layout from Task 2 (`wallDefaults.ts`, trimmed `viewport.ts`, no `wallRenderer.ts`/`dimensions.ts`/`lightMapping.ts`/`useCanvasInteraction.ts`) and the final ref list from Task 1's `GlowbraidStudio.tsx` (`tRef`, `framesRef`, `seedsRef`, `mapGeoRef`, etc. — `panRef`/`sizeRef` no longer exist).
- Produces: nothing consumed elsewhere — this is a documentation-only task.

- [ ] **Step 1: Update the `src/renderer/` and `src/renderer3d/` architecture bullets**

Replace:
```md
- `src/renderer/` — Canvas2D drawing: `wallRenderer.ts` (wall + showcase frame), `mapRenderer.ts` (inspector connection map), `viewport.ts` (layout/zoom/pan math + hit testing).
- `src/renderer3d/` — three.js 3D installation view: `wall3d.ts` (stateful scene renderer, lazy-loaded on first 3D entry), `fiberGeometry.ts`/`fiberColors.ts` (pure, GPU-free helpers with Vitest coverage). Consumes the same engine output and the shared `fiberSegmentLights` light pipeline as the 2D renderer. Frame picking via invisible per-frame pick-planes (`frameSquarePlane` + a Raycaster in `wall3d.ts`) drives the same `selectedFrame` selection the 2D view uses; camera state is session-only.
```
With:
```md
- `src/renderer/` — shared rendering support, no 2D canvas drawing (the app is 3D-only): `mapRenderer.ts` (inspector connection map), `viewport.ts` (`frameGradientPos`, the diagonal gradient position used by 3D fibre coloring), `pourField.ts`/`pourTexture.ts` (procedural board-art generation), `wallDefaults.ts` (board-color default + bezel shading, shared with the 3D renderer).
- `src/renderer3d/` — three.js 3D installation view, the only view: `wall3d.ts` (stateful scene renderer, lazy-loaded on first mount), `fiberGeometry.ts`/`fiberColors.ts` (pure, GPU-free helpers with Vitest coverage). Consumes the same engine output and the `fiberSegmentLights` light pipeline. Frame picking via invisible per-frame pick-planes (`frameSquarePlane` + a Raycaster in `wall3d.ts`) drives `selectedFrame`; camera state is session-only.
```

- [ ] **Step 2: Update the stale ref list in the "Render loop lives outside React state" section**

Replace:
```md
`GlowbraidStudio.tsx` keeps per-frame mutable data in refs (`tRef`, `panRef`, `framesRef`, `sizeRef`…) and redraws imperatively via `useAnimationLoop`; React state (`ui`) only holds things that change UI chrome. Scrub position and time readout are written directly to DOM nodes each tick — don't move animation-frequency data into `useState`.
```
With:
```md
`GlowbraidStudio.tsx` keeps per-frame mutable data in refs (`tRef`, `framesRef`, `seedsRef`…) and redraws imperatively via `useAnimationLoop`; React state (`ui`) only holds things that change UI chrome. Scrub position and time readout are written directly to DOM nodes each tick — don't move animation-frequency data into `useState`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update architecture notes for the 3D-only renderer layout"
```
