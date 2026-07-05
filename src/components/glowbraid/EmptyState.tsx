import { PALETTES } from "@/engine/palettes";
import type { AnimationId, PaletteId } from "@/engine/types";

export interface EmptyStatePreset {
  gridSize: number;
  palette: PaletteId;
  anim: AnimationId;
}

interface PresetDef extends EmptyStatePreset {
  name: string;
  sub: string;
}

const PRESET_DEFS: PresetDef[] = [
  {
    name: "Aurora Loft",
    gridSize: 3,
    palette: "aurora",
    anim: "flow",
    sub: "3×3 · Flowing",
  },
  {
    name: "Neon Booth",
    gridSize: 2,
    palette: "neon",
    anim: "rainbow",
    sub: "2×2 · Rainbow",
  },
  {
    name: "Sunset Hall",
    gridSize: 4,
    palette: "sunset",
    anim: "gradient",
    sub: "4×4 · Gradient",
  },
  {
    name: "Ember Nook",
    gridSize: 2,
    palette: "ember",
    anim: "breathe",
    sub: "2×2 · Breathing",
  },
];

/** Vertical CSS gradient across a palette's stops, for the preset bar. */
function verticalGradient(paletteId: PaletteId): string {
  const stops = PALETTES[paletteId].stops;
  const stopList = stops
    .map(
      ([r, g, b], i) =>
        `rgb(${r},${g},${b}) ${Math.round((i / (stops.length - 1)) * 100)}%`,
    )
    .join(",");
  return `linear-gradient(180deg,${stopList})`;
}

export function EmptyState({
  onPreset,
  onStart,
}: {
  onPreset: (preset: EmptyStatePreset) => void;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center p-7 [background:radial-gradient(70%_70%_at_50%_45%,rgba(10,11,14,0.05),rgba(10,11,14,0.62))]">
      <div className="flex w-[min(548px,94%)] flex-col gap-4 rounded-[20px] border border-white/[0.09] bg-[rgba(11,12,16,0.74)] px-[26px] pt-6 pb-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-[18px]">
        <div className="flex flex-col gap-[9px]">
          <span className="font-smono self-start rounded-full border border-[rgba(155,140,255,0.35)] px-[11px] py-[5px] text-[10px] tracking-[0.16em] text-[#c1b6ff]">
            NEW PROJECT
          </span>
          <div className="text-2xl leading-[1.12] font-semibold tracking-[-0.01em]">
            Design light that flows.
          </div>
          <div className="max-w-[440px] text-[12.5px] leading-[1.55] text-[rgba(233,234,240,0.55)]">
            Hidden LEDs around each frame inject colour into passive side-glow
            fibres. Pick a starting point below — you can reshape the wall
            anytime.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[10px]">
          {PRESET_DEFS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onPreset(preset)}
              className="flex min-h-[56px] cursor-pointer items-stretch gap-[11px] rounded-[13px] border border-white/[0.08] bg-white/[0.02] px-3 py-[11px] text-left transition-colors hover:border-[rgba(155,140,255,0.5)] hover:bg-[rgba(155,140,255,0.08)]"
            >
              <span
                className="block w-1.5 flex-none rounded-md shadow-[0_0_14px_rgba(155,140,255,0.25)]"
                style={{ background: verticalGradient(preset.palette) }}
              />
              <span className="flex flex-col items-start justify-center gap-[3px]">
                <span className="text-[13px] font-semibold text-white">
                  {preset.name}
                </span>
                <span className="font-smono text-[10.5px] tracking-[0.02em] text-[rgba(233,234,240,0.45)]">
                  {preset.sub}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onStart}
          className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-dashed border-white/[0.16] text-[12.5px] font-medium text-[rgba(233,234,240,0.72)] transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          ✦&nbsp; Start from a blank random wall
        </button>
      </div>
    </div>
  );
}
