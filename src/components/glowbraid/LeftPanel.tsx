import type { ReactNode } from "react";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

const GRID_OPTIONS = [1, 2, 3, 4, 5, 6];
const LED_DOTS = Array.from({ length: 12 }, (_, i) => `dot-${i}`);

export interface LeftPanelProps {
  gridSize: number;
  onGridSize: (n: number) => void;
  frameSize: number;
  onFrameSize: (n: number) => void;
  frameGap: number;
  onFrameGap: (n: number) => void;
  boardPadding: number;
  onBoardPadding: (n: number) => void;
  cornerRadius: number;
  onCornerRadius: (n: number) => void;
  frameWidth: number;
  onFrameWidth: (n: number) => void;
  frameOffset: number;
  onFrameOffset: (n: number) => void;
  showMeasurements: boolean;
  onShowMeasurements: (v: boolean) => void;
  boardColor: string;
  onBoardColor: (c: string) => void;
  curviness: number;
  onCurviness: (v: number) => void;
  randomness: number;
  onRandomness: (v: number) => void;
  socketDepth: number;
  onSocketDepth: (v: number) => void;
  onReroute: () => void;
  onGenerate: () => void;
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

      <SliderRow label="Frame size" value={`${props.frameSize} cm`}>
        <input
          type="range"
          aria-label="Frame size"
          min={10}
          max={40}
          step={1}
          value={props.frameSize}
          onChange={(e) => props.onFrameSize(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Frame spacing" value={`${props.frameGap} mm`}>
        <input
          type="range"
          aria-label="Frame spacing"
          min={0}
          max={30}
          step={1}
          value={props.frameGap}
          onChange={(e) => props.onFrameGap(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Board padding" value={`${props.boardPadding} cm`}>
        <input
          type="range"
          aria-label="Board padding"
          min={0}
          max={20}
          step={1}
          value={props.boardPadding}
          onChange={(e) => props.onBoardPadding(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Frame width" value={`${props.frameWidth} mm`}>
        <input
          type="range"
          aria-label="Frame width"
          min={1}
          max={props.frameSize * 5 - 1}
          step={1}
          value={props.frameWidth}
          onChange={(e) => props.onFrameWidth(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Corner radius" value={`${props.cornerRadius} mm`}>
        <input
          type="range"
          aria-label="Corner radius"
          min={0}
          max={props.frameSize * 5}
          step={1}
          value={props.cornerRadius}
          onChange={(e) => props.onCornerRadius(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Frame offset" value={`${props.frameOffset} cm`}>
        <input
          type="range"
          aria-label="Frame offset"
          min={0}
          max={10}
          step={0.5}
          value={props.frameOffset}
          onChange={(e) => props.onFrameOffset(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-xs text-[rgba(233,234,240,0.7)]">
          Show measurements
        </span>
        <input
          type="checkbox"
          aria-label="Show measurements"
          checked={props.showMeasurements}
          onChange={(e) => props.onShowMeasurements(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-[#9b8cff]"
        />
      </label>

      <div className="flex flex-col gap-[7px]">
        <div className="text-xs text-[rgba(233,234,240,0.7)]">Board color</div>
        <ColorSwatchPicker
          value={props.boardColor}
          onChange={props.onBoardColor}
          ariaLabel="Board color"
        />
      </div>

      <Divider />
      <SectionLabel>FIBRES &amp; LEDS</SectionLabel>

      <div className="flex items-center gap-2.5 rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        <div className="grid grid-cols-[repeat(6,4px)] grid-rows-[repeat(2,4px)] gap-[2px]">
          {LED_DOTS.map((id) => (
            <span
              key={id}
              className="h-1 w-1 rounded-full bg-[#9b8cff] opacity-70"
            />
          ))}
        </div>
        <div className="leading-[1.3]">
          <div className="text-xs text-[#e9eaf0]">24 LEDs / frame</div>
          <div className="text-[10px] text-[rgba(233,234,240,0.4)]">
            6 per edge · fixed
          </div>
        </div>
      </div>

      <div className="rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 leading-[1.3]">
        <div className="text-xs text-[#e9eaf0]">12 fibre runs / frame</div>
        <div className="text-[10px] text-[rgba(233,234,240,0.4)]">
          one per LED · fixed
        </div>
      </div>

      <SliderRow
        label="Curviness"
        value={`${Math.round(props.curviness * 100)}%`}
      >
        <input
          type="range"
          aria-label="Curviness"
          min={0}
          max={1}
          step={0.01}
          value={props.curviness}
          onChange={(e) => props.onCurviness(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow
        label="Randomness"
        value={`${Math.round(props.randomness * 100)}%`}
      >
        <input
          type="range"
          aria-label="Randomness"
          min={0}
          max={1}
          step={0.01}
          value={props.randomness}
          onChange={(e) => props.onRandomness(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow
        label="Socket depth"
        value={`${Math.round(props.socketDepth * 100)}%`}
      >
        <input
          type="range"
          aria-label="Socket depth"
          min={0}
          max={1}
          step={0.01}
          value={props.socketDepth}
          onChange={(e) => props.onSocketDepth(Number(e.target.value))}
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
