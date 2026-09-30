import type { MouseEvent, RefObject } from "react";
import { ANIMATIONS } from "@/engine/animation";
import { LEDS_PER_FRAME } from "@/engine/leds";
import { PALETTE_IDS, PALETTES } from "@/engine/palettes";
import type { AnimationId, Frame, PaletteId } from "@/engine/types";
import { cn } from "@/lib/utils";
import { ColorSwatchPicker, finishName } from "./ColorSwatchPicker";
import {
  ActionButton,
  FieldLabel,
  ScheduleRow,
  SectionTitle,
  Segmented,
} from "./controls";

const ANIMATION_OPTIONS = ANIMATIONS.map((a) => ({
  value: a.id,
  label: a.name,
}));

export interface SpecsPanelProps {
  anim: AnimationId;
  onAnim: (anim: AnimationId) => void;
  speed: number;
  onSpeed: (v: number) => void;
  brightness: number;
  onBrightness: (v: number) => void;
  palette: PaletteId;
  onPalette: (p: PaletteId) => void;

  frame: Frame | null;
  /** 0-based index of the selected frame in the wall, or null */
  frameNumber: number | null;
  /** Light-panel edge in cm, to report fibre runs at real length. */
  panelSize: number;
  selectedFiber: number | null;
  mapCanvasRef: RefObject<HTMLCanvasElement | null>;
  onMapClick: (e: MouseEvent<HTMLCanvasElement>) => void;
  onReseed: () => void;
  frameColor: string | null;
  onFrameColor: (c: string) => void;
  onApplyToAll: () => void;
}

export function SpecsPanel(props: SpecsPanelProps) {
  const { frame, frameNumber } = props;
  return (
    <aside
      aria-label="Light and frame detail"
      className="gb-specs flex flex-col px-4 pb-5 pt-4 max-lg:pt-1"
    >
      <Light {...props} />
      <section className="mt-6" aria-live="polite">
        {frame && frameNumber != null ? (
          <FrameDetail {...props} frame={frame} frameNumber={frameNumber} />
        ) : (
          <>
            <SectionTitle>Frame detail</SectionTitle>
            <p className="max-w-[34ch] pt-2 text-[13.5px] leading-snug text-ink-2">
              <span className="pointer-coarse:hidden">Click</span>
              <span className="pointer-fine:hidden">Tap</span> a frame on the
              wall to open its detail: the wiring map, its seed and its frame
              colour.
            </p>
          </>
        )}
      </section>
    </aside>
  );
}

function Light(props: SpecsPanelProps) {
  return (
    <section>
      <SectionTitle>Light</SectionTitle>
      <FieldLabel>Drive pattern</FieldLabel>
      <Segmented
        ariaLabel="LED drive pattern"
        options={ANIMATION_OPTIONS}
        value={props.anim}
        onChange={props.onAnim}
        columns={3}
      />
      <FieldLabel>Palette</FieldLabel>
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset defaults fight the joined-row layout; role=group carries the same semantics */}
      <div
        role="group"
        aria-label="Colour palette"
        className="grid gap-px border border-ink bg-ink"
      >
        {PALETTE_IDS.map((id) => {
          const p = PALETTES[id];
          const on = id === props.palette;
          const gradient = `linear-gradient(90deg, ${p.stops
            .map(
              (c, i) =>
                `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round((i / (p.stops.length - 1)) * 100)}%`,
            )
            .join(", ")})`;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => props.onPalette(id)}
              className={cn(
                "flex h-[28px] items-center gap-3 pl-1 pr-2.5 text-left text-[13px] max-md:h-10",
                on
                  ? "bg-ink font-semibold text-paper"
                  : "bg-paper text-ink hover:bg-paper-2 active:bg-rule",
              )}
            >
              <span
                aria-hidden="true"
                className="h-[20px] w-[120px] flex-none max-md:h-8"
                style={{ background: gradient }}
              />
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 border-t border-rule">
        <ScheduleRow
          bare
          label="Speed"
          unit="×"
          min={0.1}
          max={3}
          step={0.1}
          decimals={1}
          value={props.speed}
          onChange={props.onSpeed}
        />
        <ScheduleRow
          bare
          label="Brightness"
          unit="%"
          min={20}
          max={100}
          step={2}
          value={Math.round(props.brightness * 100)}
          onChange={(v) => props.onBrightness(v / 100)}
        />
      </div>
    </section>
  );
}

function FrameDetail(
  props: SpecsPanelProps & { frame: Frame; frameNumber: number },
) {
  const { frame } = props;
  const number = String(props.frameNumber + 1).padStart(2, "0");
  const avgRun =
    (frame.fibers.reduce((acc, f) => acc + f.length, 0) / frame.fibers.length) *
    props.panelSize;

  const fiber =
    props.selectedFiber != null ? frame.fibers[props.selectedFiber] : null;

  return (
    <>
      <SectionTitle
        aside={
          <span className="text-[13px] text-ink-2">
            seed <span className="font-semibold text-ink">{frame.seed}</span>
          </span>
        }
      >
        <span className="flex items-center gap-2">
          Frame
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-[1.5px] border-redline px-1 text-[12.5px] leading-none tracking-normal text-redline">
            {number}
          </span>
        </span>
      </SectionTitle>

      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3 pt-2">
        <canvas
          ref={props.mapCanvasRef}
          onClick={props.onMapClick}
          aria-label="Wiring map. Click a fibre to trace the LEDs that feed it."
          className="block aspect-square w-full cursor-crosshair"
        />
        <dl className="self-start text-[13px]">
          <Stat label="Fibre runs" value={String(frame.fibers.length)} />
          <Stat label="LEDs" value={String(LEDS_PER_FRAME)} />
          <Stat label="Crossings" value={String(frame.crossings)} />
          <Stat label="Avg run" value={`${avgRun.toFixed(1)} cm`} />
        </dl>
      </div>
      <p className="min-h-[2.6em] pt-1.5 text-[13px] leading-snug text-ink-2">
        {fiber && props.selectedFiber != null ? (
          <>
            <span className="font-semibold text-redline">
              Fibre {props.selectedFiber + 1}
            </span>{" "}
            runs from LED {frame.leds[fiber.startLedIndex].id} to LED{" "}
            {frame.leds[fiber.endLedIndex].id}, lit from both ends.
          </>
        ) : (
          "Click a fibre in the map to trace the two LEDs that feed it."
        )}
      </p>

      <FieldLabel value={finishName(props.frameColor)}>Frame colour</FieldLabel>
      <ColorSwatchPicker
        value={props.frameColor}
        onChange={props.onFrameColor}
        ariaLabel="Frame colour"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ActionButton
          onClick={props.onApplyToAll}
          disabled={props.frameColor == null}
          title={
            props.frameColor == null
              ? "Pick a frame colour first"
              : "Give every frame this colour"
          }
        >
          Apply to all
        </ActionButton>
        <ActionButton
          onClick={props.onReseed}
          title="New fibre routing for this frame only"
        >
          Re-seed frame
        </ActionButton>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-rule py-[5px]">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
