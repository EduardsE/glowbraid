import { Minus, Plus, Ruler } from "lucide-react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANIMATIONS } from "@/engine/animation";
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
import { LEDS_PER_FRAME } from "@/engine/leds";
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
import { cn } from "@/lib/utils";
import type { DimId } from "@/renderer/dimensions";
import type { MapGeometry } from "@/renderer/mapRenderer";
import { drawConnectionMap, pickMapFiber } from "@/renderer/mapRenderer";
import { POUR_PALETTES, type PourPaletteId } from "@/renderer/pourField";
import { DEFAULT_BOARD_COLOR } from "@/renderer/wallDefaults";
import { computeWorldLayout } from "@/renderer/wallLayout";
import type { Wall3D } from "@/renderer3d/wall3d";
import {
  DimensionOverlay,
  type OverlayHandle,
  type OverlayView,
} from "./DimensionOverlay";
import { DIM_MARKS, SchedulePanel } from "./SchedulePanel";
import { SpecsPanel } from "./SpecsPanel";
import { loadProject, saveProject } from "./storage";
import { formatCm, TitleBlock } from "./TitleBlock";
import { TransportBar } from "./TransportBar";
import { useAnimationLoop } from "./useAnimationLoop";

const DURATION = 12;
/** Max pointer travel (client px) between down and up to count as a click, not an orbit-drag. */
const CLICK_DRAG_PX = 4;
/** How long a live dimension lingers on the wall after its row loses attention, ms. */
const DIM_LINGER_MS = 1000;

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
  /** Session-only: the always-on overall dimension and frame marker overlay. */
  showDims: boolean;
  /** Session-only: schedule row whose dimension is drawn live on the wall. */
  activeDim: DimId | null;
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
  showDims: true,
  activeDim: null,
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

/** Value lettered on the wall beside a live dimension line. */
function dimLabel(s: StudioState, id: DimId): string {
  switch (id) {
    case "boardPadding":
      return `${s.boardPadding} cm`;
    case "frameSize":
      return `${s.frameSize} cm`;
    case "frameGap":
      return `${s.frameGap} mm`;
    case "frameWidth":
      return `${s.frameWidth} mm`;
    case "cornerRadius":
      return `R ${s.cornerRadius} mm`;
    case "frameOffset":
      return `${s.frameOffset} cm`;
    case "overall":
      return "";
  }
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
  const overlayRef = useRef<OverlayHandle | null>(null);
  const overlayViewRef = useRef<OverlayView | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const disposedRef = useRef(false);
  const dimTimerRef = useRef(0);
  const saveTimerRef = useRef(0);
  const [view, setView] = useState<"loading" | "ready" | "failed">("loading");
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
        setView("ready");
      }
    } catch {
      if (!disposedRef.current) setView("failed");
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

  const layout = useMemo(
    () =>
      computeWorldLayout(
        ui.gridSize,
        ui.frameSize,
        ui.frameGap,
        ui.boardPadding,
        ui.frameWidth,
        ui.cornerRadius,
        ui.frameOffset,
      ),
    [
      ui.gridSize,
      ui.frameSize,
      ui.frameGap,
      ui.boardPadding,
      ui.frameWidth,
      ui.cornerRadius,
      ui.frameOffset,
    ],
  );
  // Read by draw() every tick; rebuilt only when React state changes.
  overlayViewRef.current = {
    layout,
    showOverall: ui.showDims,
    overallLabel: `${formatCm(layout.boardSize)} cm`,
    live:
      ui.activeDim && ui.activeDim !== "overall"
        ? {
            id: ui.activeDim,
            mark: DIM_MARKS[ui.activeDim],
            label: dimLabel(ui, ui.activeDim),
          }
        : null,
    selectedFrame: ui.showDims ? ui.selectedFrame : null,
  };

  const draw = useCallback(() => {
    const s = uiRef.current;
    const palette = PALETTES[s.palette];
    const wall3d = wall3dRef.current;
    wall3d?.render({
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
    if (overlayViewRef.current) {
      overlayRef.current?.update(
        wall3d ? wall3d.project : null,
        overlayViewRef.current,
      );
    }
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

  const togglePlay = useCallback(() => {
    // A finished, non-looping run restarts from the top instead of stalling at the end.
    if (!uiRef.current.playing && tRef.current >= DURATION) tRef.current = 0;
    setUi((prev) => ({ ...prev, playing: !prev.playing }));
  }, []);

  useEffect(() => {
    // Reset on every effect setup: React can run this effect's cleanup and
    // re-run it on the same instance (StrictMode-style double-invocation;
    // TanStack Start does this for client-only routes). Without the reset,
    // the flag latches true and ensure3D never creates the renderer.
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      window.clearTimeout(dimTimerRef.current);
      wall3dRef.current?.dispose();
      wall3dRef.current = null;
    };
  }, []);

  useEffect(() => {
    void ensure3D();
  }, [ensure3D]);

  // Studio shortcuts. Typing in a field or stepping a slider never triggers one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      const s = uiRef.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === " ") {
        if (tag === "BUTTON") return; // Space presses the focused button
        e.preventDefault();
        togglePlay();
      } else if (key === "f") {
        wall3dRef.current?.resetCamera();
      } else if (key === "d") {
        setUi((prev) => ({ ...prev, showDims: !prev.showDims }));
      } else if (key === "Escape") {
        if (s.selectedFrame != null) {
          setUi((prev) => ({
            ...prev,
            selectedFrame: null,
            selectedFiber: null,
          }));
        }
      } else if (key.startsWith("Arrow") && s.selectedFrame == null) {
        // First arrow press opens frame 01, so frame work never needs a pointer.
        e.preventDefault();
        setUi((prev) => ({ ...prev, selectedFrame: 0, selectedFiber: null }));
      } else if (key.startsWith("Arrow") && s.selectedFrame != null) {
        const n = s.gridSize;
        const col = s.selectedFrame % n;
        const row = Math.floor(s.selectedFrame / n);
        const next =
          key === "ArrowLeft" && col > 0
            ? s.selectedFrame - 1
            : key === "ArrowRight" && col < n - 1
              ? s.selectedFrame + 1
              : key === "ArrowUp" && row > 0
                ? s.selectedFrame - n
                : key === "ArrowDown" && row < n - 1
                  ? s.selectedFrame + n
                  : s.selectedFrame;
        e.preventDefault();
        if (next !== s.selectedFrame) {
          setUi((prev) => ({
            ...prev,
            selectedFrame: next,
            selectedFiber: null,
          }));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

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
  /** Typed seed: the same wall-wide regeneration as Re-route, from a chosen seed. */
  const handleSeed = (seed: number) => {
    // Re-typing the current seed still restores frames that were re-seeded on their own.
    if (seed === ui.masterSeed && reseededFrames === 0) return;
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
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
  const handleDimAttention = useCallback((id: DimId, on: boolean) => {
    window.clearTimeout(dimTimerRef.current);
    if (on) {
      setUi((prev) =>
        prev.activeDim === id ? prev : { ...prev, activeDim: id },
      );
    } else {
      dimTimerRef.current = window.setTimeout(() => {
        setUi((prev) =>
          prev.activeDim === id ? { ...prev, activeDim: null } : prev,
        );
      }, DIM_LINGER_MS);
    }
  }, []);

  const frames = framesRef.current;
  const derivedSeeds = deriveFrameSeeds(ui.masterSeed, frames.length);
  let reseededFrames = 0;
  for (let i = 0; i < frames.length; i++) {
    if (seedsRef.current[i] !== derivedSeeds[i]) reseededFrames++;
  }
  const selectedFrame =
    ui.selectedFrame != null ? (frames[ui.selectedFrame] ?? null) : null;
  let fibreRuns = 0;
  let fibreUnits = 0;
  for (const frame of frames) {
    fibreRuns += frame.fibers.length;
    for (const fiber of frame.fibers) fibreUnits += fiber.length;
  }

  return (
    <div className="gb-sheet select-none">
      <TitleBlock
        gridSize={ui.gridSize}
        boardSize={layout.boardSize}
        frames={frames.length}
        leds={frames.length * LEDS_PER_FRAME}
        fibreRuns={fibreRuns}
        fibreMetres={(fibreUnits * layout.panelSize) / 100}
        masterSeed={ui.masterSeed}
        reseededFrames={reseededFrames}
        onSeed={handleSeed}
      />
      <section className="gb-view" aria-label="Wall, 3D view">
        <canvas
          ref={glCanvasRef}
          onPointerDown={handleGlPointerDown}
          onPointerUp={handleGlPointerUp}
          className="absolute inset-0 block h-full w-full cursor-grab active:cursor-grabbing"
        />
        <DimensionOverlay ref={overlayRef} />
        {view === "ready" ? (
          <p
            className={cn(
              "pointer-events-none absolute left-3.5 top-3 max-w-[calc(100%-13rem)] text-[12.5px] leading-snug text-paper/70 transition-opacity duration-[160ms] ease-out-expo",
              // Step aside for the live dimension lettering along the wall's top edge.
              ui.activeDim ? "opacity-0" : "opacity-100",
            )}
          >
            <span className="pointer-coarse:hidden">
              Drag to orbit, right-drag to pan, scroll to dolly. Click a frame
              for its detail.
            </span>
            <span className="pointer-fine:hidden">
              Drag to orbit, pinch to zoom. Tap a frame for its detail.
            </span>
          </p>
        ) : null}
        {view === "loading" ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13.5px] text-paper/70">
            Setting up the 3D view
          </p>
        ) : null}
        {view === "failed" ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center text-paper"
          >
            <p className="text-[16px] font-bold">The 3D view could not start</p>
            <p className="max-w-[44ch] text-[13.5px] leading-snug text-paper/75">
              Glowbraid draws the wall with WebGL. Turn on hardware acceleration
              in your browser settings, then reload. Your wall is saved.
            </p>
          </div>
        ) : null}
        <div className="absolute right-3 top-3 flex gap-2">
          <ViewKey
            label={ui.showDims ? "Hide dimensions" : "Show dimensions"}
            title="Dimensions (D)"
            pressed={ui.showDims}
            onClick={() => patch({ showDims: !ui.showDims })}
          >
            <Ruler size={15} aria-hidden="true" />
          </ViewKey>
          <div className="flex">
            <ViewKey
              label="Zoom out"
              onClick={() => wall3dRef.current?.dollyOut()}
            >
              <Minus size={15} aria-hidden="true" />
            </ViewKey>
            <ViewKey
              title="Fit the wall in view (F)"
              className="-ml-px px-2.5"
              onClick={() => wall3dRef.current?.resetCamera()}
            >
              Fit
            </ViewKey>
            <ViewKey
              label="Zoom in"
              className="-ml-px"
              onClick={() => wall3dRef.current?.dollyIn()}
            >
              <Plus size={15} aria-hidden="true" />
            </ViewKey>
          </div>
        </div>
      </section>
      <TransportBar
        playing={ui.playing}
        onPlayPause={togglePlay}
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
      <div className="gb-side">
        <SchedulePanel
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
          activeDim={ui.activeDim}
          onDimAttention={handleDimAttention}
        />
        <SpecsPanel
          anim={ui.anim}
          onAnim={(anim) => patch({ anim })}
          speed={ui.speed}
          onSpeed={(speed) => patch({ speed })}
          brightness={ui.brightness}
          onBrightness={(brightness) => patch({ brightness })}
          palette={ui.palette}
          onPalette={(palette) => patch({ palette })}
          frame={selectedFrame}
          frameNumber={ui.selectedFrame}
          panelSize={layout.panelSize}
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
        />
      </div>
    </div>
  );
}

/** Control drawn on the dark view: paper line on black, inverted when pressed. */
function ViewKey({
  children,
  label,
  title,
  pressed,
  onClick,
  className,
}: {
  children: ReactNode;
  label?: string;
  title?: string;
  pressed?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center border border-paper/60 text-[13px] font-semibold max-md:h-10 max-md:min-w-10",
        pressed
          ? "bg-paper text-ink hover:bg-paper-2"
          : "bg-view/75 text-paper hover:bg-paper hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
