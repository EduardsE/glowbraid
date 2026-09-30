import { cn } from "@/lib/utils";
import type { DimId } from "@/renderer/dimensions";
import {
  POUR_PALETTE_IDS,
  POUR_PALETTES,
  type PourPaletteId,
} from "@/renderer/pourField";
import { DEFAULT_BOARD_COLOR } from "@/renderer/wallDefaults";
import { ColorSwatchPicker, finishName } from "./ColorSwatchPicker";
import {
  ActionButton,
  FieldLabel,
  ScheduleRow,
  SectionTitle,
  Segmented,
} from "./controls";

const GRID_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({
  value: n,
  label: String(n),
  ariaLabel: `${n} by ${n} frames`,
}));

const ART_OPTIONS: { value: "none" | "pour"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "pour", label: "Pour" },
];

/** Key letters, in schedule order; the same letter rides the wall's dimension line. */
export const DIM_MARKS: Record<Exclude<DimId, "overall">, string> = {
  boardPadding: "A",
  frameSize: "B",
  frameGap: "C",
  frameWidth: "D",
  cornerRadius: "E",
  frameOffset: "F",
};

export interface SchedulePanelProps {
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
  boardColor: string;
  onBoardColor: (c: string) => void;
  boardArt: "none" | "pour";
  onBoardArt: (mode: "none" | "pour") => void;
  boardArtPalette: PourPaletteId;
  onBoardArtPalette: (id: PourPaletteId) => void;
  onBoardArtReroll: () => void;
  curviness: number;
  onCurviness: (v: number) => void;
  randomness: number;
  onRandomness: (v: number) => void;
  socketDepth: number;
  onSocketDepth: (v: number) => void;
  onReroute: () => void;
  onGenerate: () => void;
  /** Dimension currently drawn live on the wall. */
  activeDim: DimId | null;
  onDimAttention: (id: DimId, on: boolean) => void;
}

export function SchedulePanel(props: SchedulePanelProps) {
  const dim = (id: Exclude<DimId, "overall">) => ({
    mark: DIM_MARKS[id],
    active: props.activeDim === id,
    onAttention: (on: boolean) => props.onDimAttention(id, on),
  });

  return (
    <aside
      aria-label="Wall schedule"
      className="gb-schedule flex flex-col px-4 pb-5 pt-4"
    >
      <section>
        <SectionTitle>Board</SectionTitle>
        <div className="grid h-10 grid-cols-[17px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-rule max-md:h-12">
          <span aria-hidden="true" />
          <span className="text-[13.5px]">Grid</span>
          <Segmented
            ariaLabel="Grid size"
            options={GRID_OPTIONS}
            value={props.gridSize}
            onChange={props.onGridSize}
            className="w-[186px] max-md:w-[228px]"
          />
        </div>
        <ScheduleRow
          label="Board padding"
          unit="cm"
          min={0}
          max={20}
          step={1}
          value={props.boardPadding}
          onChange={props.onBoardPadding}
          {...dim("boardPadding")}
        />
        <div className="pl-[27px]">
          <FieldLabel
            value={
              props.boardArt === "pour"
                ? "Covered by art"
                : finishName(props.boardColor, DEFAULT_BOARD_COLOR)
            }
          >
            Board colour
          </FieldLabel>
          <ColorSwatchPicker
            value={props.boardColor}
            onChange={props.onBoardColor}
            ariaLabel="Board colour"
          />
          <FieldLabel
            value={
              props.boardArt === "pour"
                ? POUR_PALETTES[props.boardArtPalette].name
                : undefined
            }
          >
            Board art
          </FieldLabel>
          <Segmented
            ariaLabel="Board art"
            options={ART_OPTIONS}
            value={props.boardArt}
            onChange={props.onBoardArt}
          />
          {props.boardArt === "pour" ? (
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="flex gap-2">
                {POUR_PALETTE_IDS.map((id) => {
                  const p = POUR_PALETTES[id];
                  const on = id === props.boardArtPalette;
                  const gradient = `linear-gradient(135deg, ${p.stops
                    .map(([r, g, b]) => `rgb(${r},${g},${b})`)
                    .join(", ")})`;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={p.name}
                      aria-label={`Pour palette: ${p.name}`}
                      aria-pressed={on}
                      onClick={() => props.onBoardArtPalette(id)}
                      style={{ background: gradient }}
                      className={cn(
                        "h-6 w-6 flex-none border border-ink/45 outline-offset-2 focus-visible:outline-redline max-md:h-9 max-md:w-9",
                        on
                          ? "outline outline-2 outline-ink"
                          : "hover:border-ink",
                      )}
                    />
                  );
                })}
              </div>
              <ActionButton
                onClick={props.onBoardArtReroll}
                className="h-[30px] px-2.5 text-[13px]"
              >
                Reroll artwork
              </ActionButton>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle>Frames</SectionTitle>
        <ScheduleRow
          label="Frame size"
          unit="cm"
          min={10}
          max={40}
          step={1}
          value={props.frameSize}
          onChange={props.onFrameSize}
          {...dim("frameSize")}
        />
        <ScheduleRow
          label="Frame spacing"
          unit="mm"
          min={0}
          max={30}
          step={1}
          value={props.frameGap}
          onChange={props.onFrameGap}
          {...dim("frameGap")}
        />
        <ScheduleRow
          label="Frame width"
          unit="mm"
          min={1}
          max={props.frameSize * 5 - 1}
          step={1}
          value={props.frameWidth}
          onChange={props.onFrameWidth}
          {...dim("frameWidth")}
        />
        <ScheduleRow
          label="Corner radius"
          unit="mm"
          min={0}
          max={props.frameSize * 5}
          step={1}
          value={props.cornerRadius}
          onChange={props.onCornerRadius}
          {...dim("cornerRadius")}
        />
        <ScheduleRow
          label="Frame offset"
          unit="cm"
          min={0}
          max={10}
          step={0.5}
          decimals={1}
          value={props.frameOffset}
          onChange={props.onFrameOffset}
          {...dim("frameOffset")}
        />
      </section>

      <section className="mt-6">
        <SectionTitle>Fibres</SectionTitle>
        <ScheduleRow
          label="Curviness"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={Math.round(props.curviness * 100)}
          onChange={(v) => props.onCurviness(v / 100)}
        />
        <ScheduleRow
          label="Randomness"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={Math.round(props.randomness * 100)}
          onChange={(v) => props.onRandomness(v / 100)}
        />
        <ScheduleRow
          label="Socket depth"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={Math.round(props.socketDepth * 100)}
          onChange={(v) => props.onSocketDepth(v / 100)}
        />
        <p className="pb-3 pl-[27px] pt-2.5 text-[12.5px] leading-snug text-ink-2">
          Fixed per frame: 24 LEDs, 6 to an edge, feeding 12 fibre runs. Each
          run is lit from both ends.
        </p>
        <div className="grid grid-cols-2 gap-2 pl-[27px]">
          <ActionButton
            onClick={props.onReroute}
            title="New routing for every frame from a fresh seed. Keeps the selection; resets frame colours."
          >
            Re-route fibres
          </ActionButton>
          <ActionButton
            primary
            onClick={props.onGenerate}
            title="New wall from a fresh seed. Clears the selection and frame colours."
          >
            New wall
          </ActionButton>
        </div>
      </section>
    </aside>
  );
}
