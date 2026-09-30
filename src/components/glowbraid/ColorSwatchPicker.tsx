import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColorSwatchPickerProps {
  value: string | null;
  onChange: (color: string) => void;
  ariaLabel: string;
}

export const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#181a20" },
  { name: "Graphite", hex: "#4a4a4a" },
  { name: "White", hex: "#e8e4d8" },
  { name: "Walnut", hex: "#6b4a32" },
  { name: "Oak", hex: "#c9a066" },
];

/** Schedule name for a finish: preset name, "Default", or the custom hex. */
export function finishName(value: string | null, defaultHex?: string): string {
  if (value == null || value === defaultHex) return "Default";
  const preset = PRESET_COLORS.find((p) => p.hex === value);
  return preset ? preset.name : value.toUpperCase();
}

const CHIP =
  "h-6 w-6 flex-none border border-ink/45 max-md:h-9 max-md:w-9 outline-offset-2 focus-visible:outline-redline";
const CHIP_ON = "outline outline-2 outline-ink";

export function ColorSwatchPicker(props: ColorSwatchPickerProps) {
  const { value, onChange, ariaLabel } = props;
  const isPreset = PRESET_COLORS.some((p) => p.hex === value);
  const isCustom = value != null && !isPreset;

  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((p) => (
        <button
          key={p.hex}
          type="button"
          title={p.name}
          aria-label={`${ariaLabel}: ${p.name}`}
          aria-pressed={value === p.hex}
          onClick={() => onChange(p.hex)}
          style={{ background: p.hex }}
          className={cn(CHIP, value === p.hex ? CHIP_ON : "hover:border-ink")}
        />
      ))}
      <label
        title="Custom colour"
        style={isCustom ? { background: value } : undefined}
        className={cn(
          CHIP,
          "relative flex cursor-pointer items-center justify-center has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-redline",
          isCustom ? CHIP_ON : "bg-paper-2 text-ink-2 hover:border-ink",
        )}
      >
        {isCustom ? null : <Plus size={13} aria-hidden="true" />}
        <input
          type="color"
          aria-label={`${ariaLabel}: custom colour`}
          value={isCustom ? (value as string) : "#6b4a32"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
