import type { MouseEvent, ReactNode, RefObject } from "react";
import { ANIMATIONS } from "@/engine/animation";
import { PALETTE_IDS, PALETTES } from "@/engine/palettes";
import type { AnimationId, Frame, PaletteId } from "@/engine/types";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

export interface InspectorPanelProps {
  frame: Frame | null;
  /** 0-based index of the selected frame in the wall, or null */
  frameNumber: number | null;
  empty: boolean;
  selectedFiber: number | null;
  mapCanvasRef: RefObject<HTMLCanvasElement | null>;
  onMapClick: (e: MouseEvent<HTMLCanvasElement>) => void;
  onReseed: () => void;
  frameColor: string | null;
  onFrameColor: (c: string) => void;
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
          aria-label="Re-seed frame"
          onClick={props.onReseed}
          className="h-8 w-8 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-sm text-[#e9eaf0] hover:bg-white/[0.08]"
        >
          ⟳
        </button>
      </div>

      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-[rgba(233,234,240,0.7)]">Frame color</div>
        <ColorSwatchPicker
          value={props.frameColor}
          onChange={props.onFrameColor}
          ariaLabel="Frame color"
        />
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
          <span className="text-[9.5px] text-[rgba(233,234,240,0.3)]">
            click a fibre
          </span>
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
          aria-label="Animation speed"
          min={0.1}
          max={3}
          step={0.1}
          value={props.speed}
          onChange={(e) => props.onSpeed(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>
      <SliderRow
        label="LED brightness"
        value={`${Math.round(props.brightness * 100)}%`}
      >
        <input
          type="range"
          aria-label="LED brightness"
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
      <div className="font-smono text-[19px] font-semibold text-[#e9eaf0]">
        {value}
      </div>
      <div className="mt-[2px] text-[10px] text-[rgba(233,234,240,0.42)]">
        {label}
      </div>
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
