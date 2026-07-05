import type { ReactNode } from "react";

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
  curviness: number;
  onCurviness: (v: number) => void;
  randomness: number;
  onRandomness: (v: number) => void;
  socketDepth: number;
  onSocketDepth: (v: number) => void;
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
          aria-label="Frame size"
          min={150}
          max={340}
          step={2}
          value={props.frameSize}
          onChange={(e) => props.onFrameSize(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Frame spacing" value={`${props.frameGap}px`}>
        <input
          type="range"
          aria-label="Frame spacing"
          min={0}
          max={80}
          step={2}
          value={props.frameGap}
          onChange={(e) => props.onFrameGap(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

      <SliderRow label="Board padding" value={`${props.boardPadding}px`}>
        <input
          type="range"
          aria-label="Board padding"
          min={0}
          max={120}
          step={2}
          value={props.boardPadding}
          onChange={(e) => props.onBoardPadding(Number(e.target.value))}
          className="w-full"
        />
      </SliderRow>

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
