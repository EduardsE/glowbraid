import type { MouseEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { ANIMATIONS } from "@/engine/animation";
import { DEFAULT_FIBER_STYLE, generateFrame } from "@/engine/fibers";
import { PALETTES } from "@/engine/palettes";
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
import { computeWallLayout, pickFrame } from "@/renderer/viewport";
import { drawShowcaseFrame, drawWall } from "@/renderer/wallRenderer";
import { EmptyState, type EmptyStatePreset } from "./EmptyState";
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
  frameGap: number;
  boardPadding: number;
  curviness: number;
  randomness: number;
  socketDepth: number;
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
  frameGap: 20,
  boardPadding: 40,
  curviness: DEFAULT_FIBER_STYLE.curviness,
  randomness: DEFAULT_FIBER_STYLE.randomness,
  socketDepth: DEFAULT_FIBER_STYLE.socketDepth,
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
    (
      gridSize: number,
      masterSeed: number,
      style: FiberStyle,
      seeds?: number[],
    ) => {
      const count = gridSize * gridSize;
      seedsRef.current =
        seeds && seeds.length === count
          ? seeds
          : deriveFrameSeeds(masterSeed, count);
      framesRef.current = generateWall({
        gridSize,
        frameSeeds: seedsRef.current,
        style,
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
      if (!showcaseRef.current) {
        showcaseRef.current = generateFrame(51840, styleOf(s));
      }
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
      frameGap: s.frameGap,
      boardPadding: s.boardPadding,
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
      if (s.empty) return;
      const layout = computeWallLayout({
        gridSize: s.gridSize,
        frameSize: s.frameSize,
        frameGap: s.frameGap,
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

  const handleGridSize = (n: number) => {
    rebuild(n, ui.masterSeed, styleOf(ui));
    patch({ gridSize: n, selectedFrame: null, selectedFiber: null });
  };
  const handleReroute = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({ masterSeed: seed });
  };
  const handleGenerate = () => {
    const seed = randomSeed();
    rebuild(ui.gridSize, seed, styleOf(ui));
    patch({
      masterSeed: seed,
      empty: false,
      selectedFrame: null,
      selectedFiber: null,
    });
  };
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
  const handleReseed = () => {
    const s = uiRef.current;
    if (s.selectedFrame == null) return;
    const seed = randomSeed();
    seedsRef.current[s.selectedFrame] = seed;
    framesRef.current[s.selectedFrame] = generateFrame(seed, styleOf(s));
    patch({ selectedFiber: null });
  };
  const handleStyle = (partial: Partial<FiberStyle>) => {
    const s = uiRef.current;
    const style = { ...styleOf(s), ...partial };
    if (!s.empty) {
      rebuild(s.gridSize, s.masterSeed, style, seedsRef.current);
    }
    showcaseRef.current = null;
    patch(partial);
  };
  const handleSave = () => {
    const s = uiRef.current;
    const snapshot: ProjectSnapshot = {
      gridSize: s.gridSize,
      frameSize: s.frameSize,
      frameGap: s.frameGap,
      boardPadding: s.boardPadding,
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
    if (saveProject(snapshot)) patch({ saved: true });
  };
  const handleLoad = () => {
    const d = loadProject();
    if (!d) return;
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
    const frameGap = Number.isFinite(Number(d.frameGap))
      ? Number(d.frameGap)
      : 20;
    const boardPadding = Number.isFinite(Number(d.boardPadding))
      ? Number(d.boardPadding)
      : 40;
    const curviness = styleAxis(d.curviness, DEFAULT_FIBER_STYLE.curviness);
    const randomness = styleAxis(d.randomness, DEFAULT_FIBER_STYLE.randomness);
    const socketDepth = styleAxis(
      d.socketDepth,
      DEFAULT_FIBER_STYLE.socketDepth,
    );
    rebuild(
      gridSize,
      d.masterSeed,
      { curviness, randomness, socketDepth },
      d.seeds,
    );
    patch({
      gridSize,
      frameSize: d.frameSize,
      frameGap,
      boardPadding,
      masterSeed: d.masterSeed,
      curviness,
      randomness,
      socketDepth,
      anim,
      speed: d.speed,
      brightness: d.brightness,
      palette,
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
    ui.selectedFrame != null
      ? (framesRef.current[ui.selectedFrame] ?? null)
      : null;
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
          frameGap={ui.frameGap}
          onFrameGap={(n) => patch({ frameGap: n })}
          curviness={ui.curviness}
          onCurviness={(v) => handleStyle({ curviness: v })}
          randomness={ui.randomness}
          onRandomness={(v) => handleStyle({ randomness: v })}
          socketDepth={ui.socketDepth}
          onSocketDepth={(v) => handleStyle({ socketDepth: v })}
          onReroute={handleReroute}
          onGenerate={handleGenerate}
          onSave={handleSave}
          onLoad={handleLoad}
          saveHint={
            ui.saved
              ? "Saved to this browser ✓"
              : "Stores the current wall in this browser."
          }
        />
        <section className="relative min-w-0 flex-1 overflow-hidden bg-[#0a0b0e]">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full cursor-grab"
          />
          {ui.empty ? (
            <EmptyState onPreset={handlePreset} onStart={handleGenerate} />
          ) : null}
          <div className="font-smono pointer-events-none absolute bottom-3.5 left-3.5 z-[6] flex gap-1.5 text-[10px] text-[rgba(233,234,240,0.35)]">
            <HintChip>scroll · zoom</HintChip>
            <HintChip>drag · pan</HintChip>
            <HintChip>click · select</HintChip>
          </div>
          <div className="font-smono pointer-events-none absolute bottom-3.5 right-3.5 z-[6] rounded-md border border-white/[0.08] bg-[rgba(12,13,17,0.6)] px-[9px] py-1 text-[10px] text-[rgba(233,234,240,0.4)]">
            {ui.mode === "edit"
              ? "EDIT · LEDS VISIBLE"
              : "SIMULATE · INSTALLATION VIEW"}
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
