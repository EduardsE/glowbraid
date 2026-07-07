import type { MouseEvent } from "react";
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
  Point,
  ProjectSnapshot,
} from "@/engine/types";
import { deriveFrameSeeds, generateWall } from "@/engine/wall";
import type { MapGeometry } from "@/renderer/mapRenderer";
import { drawConnectionMap, pickMapFiber } from "@/renderer/mapRenderer";
import { POUR_PALETTES, type PourPaletteId } from "@/renderer/pourField";
import { computeWallLayout, pickFrame } from "@/renderer/viewport";
import { DEFAULT_BOARD_COLOR, drawWall } from "@/renderer/wallRenderer";
import type { Wall3D } from "@/renderer3d/wall3d";
import { Header } from "./Header";
import { InspectorPanel } from "./InspectorPanel";
import { LeftPanel } from "./LeftPanel";
import { loadProject, saveProject } from "./storage";
import { TransportBar } from "./TransportBar";
import { useAnimationLoop } from "./useAnimationLoop";
import { useCanvasInteraction } from "./useCanvasInteraction";

const DURATION = 12;

interface StudioState {
  mode: "edit" | "sim" | "3d";
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
  showMeasurements: boolean;
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
  zoom: number;
}

const INITIAL_STATE: StudioState = {
  mode: "sim",
  gridSize: 3,
  frameSize: 25,
  frameGap: 20,
  boardPadding: 4,
  cornerRadius: 15,
  frameWidth: 8,
  frameOffset: 2,
  boardColor: DEFAULT_BOARD_COLOR,
  boardArt: "none",
  boardArtSeed: deriveBoardArtSeed(7431),
  boardArtPalette: "tidal",
  frameColors: [],
  showMeasurements: false,
  curviness: DEFAULT_FIBER_STYLE.curviness,
  randomness: DEFAULT_FIBER_STYLE.randomness,
  socketDepth: DEFAULT_FIBER_STYLE.socketDepth,
  masterSeed: 7431,
  geometryVersion: 0,
  selectedFrame: null,
  selectedFiber: null,
  playing: true,
  anim: "flow",
  speed: 1,
  brightness: 0.92,
  palette: "sunset",
  loop: true,
  zoom: 1,
};

function randomSeed(): number {
  return Math.floor(Math.random() * 99999);
}

/** Spec'd fallback: board-art seed derived deterministically from the wall's master seed. */
function deriveBoardArtSeed(masterSeed: number): number {
  return Math.floor(hash(masterSeed) * 2 ** 31);
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
  // drawWall throws every frame). Kept minimal, not a full schema check.
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
  const boardArtSeed = Number.isFinite(Number(d.boardArtSeed))
    ? Math.floor(Number(d.boardArtSeed))
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
  const mode: StudioState["mode"] =
    d.mode === "edit" || d.mode === "3d" ? d.mode : "sim";
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
      showMeasurements: d.showMeasurements === true,
      masterSeed: d.masterSeed,
      curviness,
      randomness,
      socketDepth,
      anim,
      speed: d.speed,
      brightness: d.brightness,
      palette,
      mode,
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wall3dRef = useRef<Wall3D | null>(null);
  const disposedRef = useRef(false);
  const noticeTimerRef = useRef(0);
  const saveTimerRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrubRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  const tRef = useRef(0);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
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
      setUi((prev) => (prev.mode === "3d" ? { ...prev, mode: "sim" } : prev));
      setNotice("3D view unavailable");
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
    }
  }, []);

  const handleMode = useCallback(
    (mode: StudioState["mode"]) => {
      patch({ mode });
      if (mode === "3d") void ensure3D();
    },
    [patch, ensure3D],
  );

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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const s = uiRef.current;
    const palette = PALETTES[s.palette];
    if (s.mode === "3d") {
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
        time: tRef.current,
        anim: s.anim,
        speed: s.speed,
        brightness: s.brightness,
        palette,
      });
    } else {
      drawWall(ctx, width, height, {
        frames: framesRef.current,
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        cornerRadius: s.cornerRadius,
        frameWidth: s.frameWidth,
        frameGap: s.frameGap,
        boardPadding: s.boardPadding,
        boardColor: s.boardColor,
        boardArt: s.boardArt,
        boardArtSeed: s.boardArtSeed,
        boardArtPalette: s.boardArtPalette,
        frameColors: s.frameColors,
        showMeasurements: s.showMeasurements,
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
      const layout = computeWallLayout({
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap / 10,
        boardPadding: s.boardPadding,
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
    if (uiRef.current.mode === "3d") void ensure3D();
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
        showMeasurements: s.showMeasurements,
        masterSeed: s.masterSeed,
        seeds: seedsRef.current,
        anim: s.anim,
        speed: s.speed,
        brightness: s.brightness,
        palette: s.palette,
        curviness: s.curviness,
        randomness: s.randomness,
        socketDepth: s.socketDepth,
        mode: s.mode,
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
    ui.showMeasurements,
    ui.masterSeed,
    ui.geometryVersion,
    ui.anim,
    ui.speed,
    ui.brightness,
    ui.palette,
    ui.curviness,
    ui.randomness,
    ui.socketDepth,
    ui.mode,
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
  const mode3dActive = ui.mode === "3d";

  return (
    <div className="font-grotesk flex h-dvh w-screen select-none flex-col overflow-hidden text-ink [background:radial-gradient(140%_120%_at_50%_-20%,#15141c_0%,#0b0c0f_60%)]">
      <div
        aria-hidden="true"
        className="grain pointer-events-none fixed inset-0 z-50"
      />
      <Header
        mode={ui.mode}
        onModeChange={handleMode}
        wallLabel={wallLabel}
        zoomPct={ui.mode === "3d" ? "3D" : `${Math.round(ui.zoom * 100)}%`}
        onZoomIn={() => {
          if (uiRef.current.mode === "3d") {
            wall3dRef.current?.dollyIn();
            return;
          }
          setUi((prev) => ({ ...prev, zoom: Math.min(4, prev.zoom * 1.15) }));
        }}
        onZoomOut={() => {
          if (uiRef.current.mode === "3d") {
            wall3dRef.current?.dollyOut();
            return;
          }
          setUi((prev) => ({ ...prev, zoom: Math.max(0.3, prev.zoom / 1.15) }));
        }}
        onFit={() => {
          if (uiRef.current.mode === "3d") {
            wall3dRef.current?.resetCamera();
            return;
          }
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
          showMeasurements={ui.showMeasurements}
          onShowMeasurements={(v) => patch({ showMeasurements: v })}
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
            ref={canvasRef}
            className={`absolute inset-0 block h-full w-full cursor-grab ${mode3dActive ? "hidden" : ""}`}
          />
          <canvas
            ref={glCanvasRef}
            className={`absolute inset-0 block h-full w-full cursor-grab ${mode3dActive ? "" : "hidden"}`}
          />
          <div className="font-smono pointer-events-none absolute bottom-3.5 left-3.5 z-[6] flex gap-1.5 text-[10px] text-ink/35">
            {ui.mode === "3d" ? (
              <>
                <HintChip>drag · orbit</HintChip>
                <HintChip>right-drag · pan</HintChip>
                <HintChip>scroll · dolly</HintChip>
              </>
            ) : (
              <>
                <HintChip>scroll · zoom</HintChip>
                <HintChip>drag · pan</HintChip>
                <HintChip>click · select</HintChip>
              </>
            )}
          </div>
          <div className="font-smono pointer-events-none absolute bottom-3.5 right-3.5 z-[6] rounded-md border border-white/[0.08] bg-[rgba(12,13,17,0.6)] px-[9px] py-1 text-[10px] text-ink/40">
            {ui.mode === "edit"
              ? "EDIT · LEDS VISIBLE"
              : ui.mode === "sim"
                ? "SIMULATE · INSTALLATION VIEW"
                : "3D · INSTALLATION VIEW"}
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
