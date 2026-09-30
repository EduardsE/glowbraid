import { Pause, Play, Repeat, Square } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import { Segmented } from "./controls";

const SPEED_PRESETS = [0.5, 1, 1.5, 2];
/** Numbered graduations on the scrub ruler, seconds. */
const RULER_STEP = 3;

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

const KEY =
  "flex h-9 w-9 flex-none items-center justify-center border border-ink max-md:h-11 max-md:w-11";
const KEY_OFF = "bg-paper text-ink hover:bg-paper-2 active:bg-rule";
const KEY_ON = "bg-ink text-paper hover:bg-ink-2";

export function TransportBar(props: TransportBarProps) {
  const marks = Array.from(
    { length: Math.floor(props.duration / RULER_STEP) + 1 },
    (_, i) => i * RULER_STEP,
  );
  const presetValue =
    SPEED_PRESETS.find((v) => Math.abs(v - props.speed) < 0.01) ?? -1;

  return (
    <footer className="gb-transport flex items-center gap-4 px-4 py-2.5 max-md:gap-3 max-md:px-3">
      <div className="flex">
        <button
          type="button"
          aria-label={props.playing ? "Pause" : "Play"}
          aria-keyshortcuts="Space"
          title={props.playing ? "Pause (Space)" : "Play (Space)"}
          onClick={props.onPlayPause}
          className={cn(KEY, props.playing ? KEY_OFF : KEY_ON)}
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
          aria-label="Stop and rewind"
          title="Stop and rewind"
          onClick={props.onStop}
          className={cn(KEY, KEY_OFF, "-ml-px")}
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
          aria-label="Loop"
          aria-pressed={props.loop}
          title={props.loop ? "Loop is on" : "Loop is off"}
          onClick={props.onLoop}
          className={cn(KEY, props.loop ? KEY_ON : KEY_OFF, "-ml-px")}
        >
          <Repeat size={15} aria-hidden="true" />
        </button>
      </div>
      <span
        ref={props.timeRef}
        className="min-w-[78px] flex-none text-[14px] font-semibold text-ink"
      >
        0:00 / 0:12
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <input
          ref={props.scrubRef}
          type="range"
          aria-label="Timeline position"
          min={0}
          max={1000}
          step={1}
          defaultValue={0}
          data-live={props.playing}
          onInput={(e) => props.onScrub(Number(e.currentTarget.value))}
          className="gb-scrub"
        />
        <div
          aria-hidden="true"
          className="-mt-0.5 flex justify-between text-[11.5px] leading-none text-ink-2"
        >
          {marks.map((s, i) => (
            <span key={s} className="w-0 whitespace-nowrap">
              <span
                className={cn(
                  "inline-block",
                  i === 0
                    ? ""
                    : i === marks.length - 1
                      ? "-translate-x-full"
                      : "-translate-x-1/2",
                )}
              >
                {i === marks.length - 1 ? `${s} s` : s}
              </span>
            </span>
          ))}
        </div>
      </div>
      <Segmented
        ariaLabel="Playback speed"
        options={SPEED_PRESETS.map((v) => ({
          value: v,
          label: `${v}×`,
          ariaLabel: `${v} times speed`,
        }))}
        value={presetValue}
        onChange={props.onSpeedPreset}
        className="w-[176px] flex-none max-sm:hidden"
      />
    </footer>
  );
}
