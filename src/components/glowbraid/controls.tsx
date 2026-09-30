import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Schedule heading: a heavy object line with the section name lettered under it. */
export function SectionTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t-2 border-ink pt-2 pb-1">
      <h2 className="font-cond text-[15px] font-extrabold uppercase tracking-[0.06em]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Dimension key letter; matches the letter on the wall's dimension line. */
export function Mark({
  children,
  active,
}: {
  children?: string;
  active?: boolean;
}) {
  if (!children) return <span aria-hidden="true" />;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-cond flex h-[17px] w-[17px] items-center justify-center rounded-full border text-[11px] font-bold leading-none",
        active
          ? "border-redline bg-redline text-paper"
          : "border-ink-3 text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function snap(n: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((n - min) / step) * step;
  // Trim float noise from fractional steps (0.1 + 0.2 …).
  return clamp(Number(stepped.toFixed(6)), min, max);
}

export interface NumberFieldProps {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onCommit: (v: number) => void;
  className?: string;
}

/**
 * Typed value. Edits stay a local draft until Enter or blur so a half-typed
 * number never clamps mid-keystroke; arrow keys step and commit at once.
 */
export function NumberField({
  ariaLabel,
  value,
  min,
  max,
  step,
  decimals = 0,
  onCommit,
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value.toFixed(decimals);

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (raw.trim() !== "" && Number.isFinite(n)) {
      onCommit(snap(n, min, max, step));
    }
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      autoComplete="off"
      spellCheck={false}
      value={draft ?? shown}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        if (draft != null) commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(e.currentTarget.value);
          e.currentTarget.select();
        } else if (e.key === "Escape") {
          setDraft(null);
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const dir = e.key === "ArrowUp" ? 1 : -1;
          const mult = e.shiftKey ? 10 : 1;
          onCommit(snap(value + dir * step * mult, min, max, step));
          setDraft(null);
        }
      }}
      className={cn("gb-field", className)}
    />
  );
}

export interface ScheduleRowProps {
  label: string;
  /** Dimension key letter when this row is drawn on the wall. */
  mark?: string;
  /** True while this row's dimension line is showing on the wall. */
  active?: boolean;
  /** Drop the key-letter column (rows outside the dimension schedule). */
  bare?: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals?: number;
  onChange: (v: number) => void;
  /** Row gained or lost pointer/keyboard attention (drives the live dimension). */
  onAttention?: (on: boolean) => void;
}

/** One schedule line: key letter, name, scale-rule slider, typed value, unit. */
export function ScheduleRow({
  label,
  mark,
  active,
  bare,
  value,
  min,
  max,
  step,
  unit,
  decimals = 0,
  onChange,
  onAttention,
}: ScheduleRowProps) {
  const fraction = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only previews the row's dimension on the wall; the controls inside are the interactive elements
    <div
      onPointerEnter={onAttention ? () => onAttention(true) : undefined}
      onPointerLeave={onAttention ? () => onAttention(false) : undefined}
      onFocus={onAttention ? () => onAttention(true) : undefined}
      onBlur={onAttention ? () => onAttention(false) : undefined}
      className={cn(
        "grid h-8 items-center gap-x-2.5 border-b border-rule max-md:h-11",
        bare
          ? "grid-cols-[minmax(0,1fr)_92px_58px]"
          : "grid-cols-[17px_minmax(0,1fr)_92px_58px]",
      )}
    >
      {bare ? null : <Mark active={active}>{mark}</Mark>}
      <span
        className={cn(
          "truncate text-[13.5px]",
          active ? "font-semibold text-redline" : "text-ink",
        )}
      >
        {label}
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        style={{ "--p": fraction } as CSSProperties}
        className="gb-rule max-md:h-11"
      />
      <span className="flex items-baseline justify-end gap-1">
        <NumberField
          ariaLabel={`${label}, ${unit === "%" ? "percent" : unit}`}
          value={value}
          min={min}
          max={max}
          step={step}
          decimals={decimals}
          onCommit={onChange}
          className="text-[14px]"
        />
        <span className="w-[21px] flex-none text-[12px] text-ink-2">
          {unit}
        </span>
      </span>
    </div>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
}

/**
 * A full set of options as joined table cells; the chosen cell is inked solid.
 * Every option stays visible — nothing hides in a dropdown.
 */
export function Segmented<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
  columns,
  className,
}: {
  ariaLabel: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Cells per row; defaults to one row. */
  columns?: number;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset's legend/border defaults fight the joined-cell layout; role=group carries the same semantics
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
      }}
      className={cn("grid gap-px border border-ink bg-ink", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-[30px] min-w-0 truncate px-1.5 text-[13px] max-md:h-10",
              on
                ? "bg-ink font-semibold text-paper"
                : "bg-paper text-ink hover:bg-paper-2 active:bg-rule",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Label line for a control that needs more than one schedule row. */
export function FieldLabel({
  children,
  value,
}: {
  children: ReactNode;
  /** Current choice, lettered at the right like a schedule value. */
  value?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-1.5 pt-2.5">
      <span className="text-[13.5px] text-ink">{children}</span>
      {value != null ? (
        <span className="truncate text-[13px] font-semibold text-ink">
          {value}
        </span>
      ) : null}
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  primary,
  disabled,
  title,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  /** Solid ink: the one action a section exists for. */
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-[34px] items-center justify-center gap-2 border border-ink px-3 text-[13.5px] font-semibold max-md:h-11",
        primary
          ? "bg-ink text-paper hover:bg-ink-2 active:bg-ink-3"
          : "bg-paper text-ink hover:bg-paper-2 active:bg-rule",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper disabled:text-ink-3",
        className,
      )}
    >
      {children}
    </button>
  );
}
