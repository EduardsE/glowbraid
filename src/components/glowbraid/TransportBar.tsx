import { Pause, Play, Repeat, Square } from "lucide-react";
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
          aria-label={props.playing ? "Pause" : "Play"}
          onClick={props.onPlayPause}
          className={
            props.playing
              ? "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.05] text-white hover:bg-white/[0.09]"
              : "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-glow/50 bg-glow/20 text-white hover:bg-glow/30"
          }
        >
          {props.playing ? (
            <Pause
              size={15}
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
            />
          ) : (
            /* ml-0.5: optical centering — the play triangle reads left-heavy when mathematically centred */
            <Play
              size={15}
              fill="currentColor"
              strokeWidth={0}
              className="ml-0.5"
              aria-hidden="true"
            />
          )}
        </button>
        <button
          type="button"
          aria-label="Stop"
          onClick={props.onStop}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.03] text-ink hover:bg-white/[0.08]"
        >
          <Square
            size={11}
            fill="currentColor"
            strokeWidth={0}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          aria-label="Toggle loop"
          aria-pressed={props.loop}
          onClick={props.onLoop}
          className={
            props.loop
              ? "flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-glow/50 bg-glow/15 text-[#c9beff] hover:bg-glow/25"
              : "flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.03] text-ink/60 hover:bg-white/[0.08] hover:text-ink/90"
          }
        >
          <Repeat size={14} aria-hidden="true" />
        </button>
      </div>
      <span
        ref={props.timeRef}
        className="font-smono min-w-[88px] text-xs tabular-nums text-ink/60"
      >
        0:00 / 0:12
      </span>
      <div className="flex flex-1 flex-col gap-[5px]">
        <input
          ref={props.scrubRef}
          type="range"
          aria-label="Timeline position"
          min={0}
          max={1000}
          step={1}
          defaultValue={0}
          onInput={(e) => props.onScrub(Number(e.currentTarget.value))}
          className="w-full"
        />
        <div className="font-smono flex justify-between text-[9px] tracking-[0.05em] text-ink/20">
          <span>KEYFRAMES · SOON</span>
          <span>LOOP {props.duration}s</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-ink/50">Speed</span>
        <div className="flex gap-1">
          {SPEED_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => props.onSpeedPreset(v)}
              className={
                Math.abs(v - props.speed) < 0.01
                  ? "font-smono h-[26px] min-w-[34px] cursor-pointer rounded-[7px] border border-glow/50 bg-glow/15 px-1.5 text-[11px] text-white"
                  : "font-smono h-[26px] min-w-[34px] cursor-pointer rounded-[7px] border border-white/[0.08] bg-white/[0.02] px-1.5 text-[11px] text-ink/60 hover:bg-white/[0.06] hover:text-ink/90"
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
