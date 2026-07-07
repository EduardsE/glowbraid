import { Minus, Plus } from "lucide-react";
import { BrandMark } from "./BrandMark";

export interface HeaderProps {
  wallLabel: string;
  zoomPct: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function Header({
  wallLabel,
  zoomPct,
  onZoomIn,
  onZoomOut,
  onFit,
}: HeaderProps) {
  return (
    <header className="z-20 flex h-[54px] flex-none items-center justify-between border-b border-white/[0.06] bg-[rgba(14,15,20,0.6)] px-[18px] backdrop-blur-[14px]">
      <div className="flex items-center gap-3">
        <BrandMark size={26} />
        <div className="flex flex-col leading-[1.05]">
          <span className="text-sm font-semibold tracking-[0.01em]">
            Glowbraid
          </span>
          <span className="text-[10px] tracking-[0.06em] text-ink/40">
            FIBRE OPTIC WALL STUDIO
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="font-smono rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-[5px] text-[11px] text-ink/55">
          {wallLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-ink hover:bg-white/[0.07]"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onFit}
            className="font-smono h-[30px] min-w-[52px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 text-[11px] text-ink/75 hover:bg-white/[0.07] hover:text-ink"
          >
            {zoomPct}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-ink hover:bg-white/[0.07]"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
