import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { NumberField } from "./controls";

export interface TitleBlockProps {
  gridSize: number;
  /** Full board edge, cm. */
  boardSize: number;
  frames: number;
  leds: number;
  fibreRuns: number;
  /** Total fibre across the wall's panel faces, metres. */
  fibreMetres: number;
  masterSeed: number;
  /** Frames re-seeded on their own since the wall seed was set. */
  reseededFrames: number;
  onSeed: (seed: number) => void;
}

/** Trims a trailing ".0" so whole centimetres read as drawn. */
export function formatCm(cm: number): string {
  return String(Number(cm.toFixed(1)));
}

/**
 * The drawing's title block: name, then the wall's derived facts, then the
 * seed that regenerates it. Runs along the sheet's bottom edge on desktop.
 */
export function TitleBlock(props: TitleBlockProps) {
  const size = formatCm(props.boardSize);
  const modified = props.reseededFrames > 0;
  return (
    <header className="gb-title flex items-stretch">
      <div className="flex flex-none items-center gap-2.5 px-4 py-2 max-sm:px-3 md:w-[327px]">
        <BrandMark size={24} className="flex-none text-ink" />
        <div className="leading-none">
          <h1 className="font-cond text-[21px] font-extrabold uppercase leading-none tracking-[0.05em]">
            Glowbraid
          </h1>
          <p className="pt-[3px] text-[12px] leading-none text-ink-2 max-md:hidden">
            Fibre-optic wall studio
          </p>
        </div>
      </div>
      <dl className="flex min-w-0 flex-1 items-stretch overflow-hidden *:flex-none">
        <Cell label="Wall" className="max-sm:hidden">
          {props.gridSize} × {props.gridSize}
        </Cell>
        <Cell label="Overall">
          {size} × {size} cm
        </Cell>
        <Cell label="Frames" className="max-lg:hidden">
          {props.frames}
        </Cell>
        <Cell label="LEDs" className="max-sm:hidden">
          {props.leds}
        </Cell>
        <Cell label="Fibre runs" className="max-lg:hidden">
          {props.fibreRuns}
        </Cell>
        <Cell
          label="Fibre, approx."
          className="max-[900px]:hidden"
          title="Sum of every fibre run across the panel faces. Allow extra for the ends seated in their sockets."
        >
          {props.fibreMetres.toFixed(1)} m
        </Cell>
      </dl>
      <div
        className="flex w-[88px] flex-none flex-col justify-center border-l border-ink px-3 py-1.5 md:w-[132px] lg:w-[327px] lg:px-4"
        title={
          modified
            ? `The wall seed, plus ${props.reseededFrames} frame${props.reseededFrames === 1 ? "" : "s"} re-seeded since. The seed alone no longer recalls this wall; the autosaved project does. Type a seed to regenerate every frame from it.`
            : "The wall seed regenerates every frame of this wall. Type one to recall a wall."
        }
      >
        <span
          aria-hidden="true"
          className="whitespace-nowrap text-[11.5px] leading-none text-ink-2"
        >
          {modified ? "Seed, modified" : "Seed"}
        </span>
        <NumberField
          ariaLabel={
            modified
              ? `Wall seed, ${props.reseededFrames} frames re-seeded since`
              : "Wall seed"
          }
          value={props.masterSeed}
          min={0}
          max={99999}
          step={1}
          onCommit={props.onSeed}
          className="mt-[3px] px-0 text-left text-[15px] leading-tight"
        />
      </div>
    </header>
  );
}

function Cell({
  label,
  children,
  className,
  title,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={cn(
        "flex min-w-0 flex-col justify-center whitespace-nowrap border-l border-ink px-3 py-1.5 lg:px-4",
        className,
      )}
    >
      <dt className="text-[11.5px] leading-none text-ink-2">{label}</dt>
      <dd className="pt-[3px] text-[15px] font-bold leading-tight">
        {children}
      </dd>
    </div>
  );
}
