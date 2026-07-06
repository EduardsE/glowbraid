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
          onClick={() => onChange(p.hex)}
          style={{ background: p.hex }}
          className={
            value === p.hex
              ? "h-[30px] w-[30px] cursor-pointer rounded-[7px] border border-white/15 outline outline-2 outline-offset-2 outline-glow/80"
              : "h-[30px] w-[30px] cursor-pointer rounded-[7px] border border-white/15 hover:border-white/40"
          }
        />
      ))}
      <label
        title="Custom"
        aria-label={`${ariaLabel}: custom`}
        style={isCustom ? { background: value } : undefined}
        className={
          isCustom
            ? "relative flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-white/15 outline outline-2 outline-offset-2 outline-glow/80"
            : "relative flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-white/15 bg-[repeating-conic-gradient(#2a2a2e_0%_25%,#1c1c1f_0%_50%)] bg-[length:10px_10px] hover:border-white/40"
        }
      >
        {isCustom ? null : (
          <span className="pointer-events-none text-[15px] text-white/60">
            +
          </span>
        )}
        <input
          type="color"
          aria-label={`${ariaLabel} custom color`}
          value={isCustom ? (value as string) : "#9b8cff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
