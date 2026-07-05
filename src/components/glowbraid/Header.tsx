import { BrandMark } from "./BrandMark";

export interface HeaderProps {
  mode: "edit" | "sim" | "3d";
  onModeChange: (mode: "edit" | "sim" | "3d") => void;
  wallLabel: string;
  zoomPct: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function Header({
  mode,
  onModeChange,
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
          <span className="text-[10px] tracking-[0.06em] text-[rgba(233,234,240,0.42)]">
            FIBRE OPTIC WALL STUDIO
          </span>
        </div>
      </div>
      <div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.02] p-[3px]">
        <ModeButton
          active={mode === "edit"}
          label="◧  Edit"
          onClick={() => onModeChange("edit")}
        />
        <ModeButton
          active={mode === "sim"}
          label="▶  Simulate"
          onClick={() => onModeChange("sim")}
        />
        <ModeButton
          active={mode === "3d"}
          label="◈  3D"
          onClick={() => onModeChange("3d")}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <span className="font-smono rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-[5px] text-[11px] text-[rgba(233,234,240,0.55)]">
          {wallLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className="h-[30px] w-[30px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] text-[15px] leading-none text-[#e9eaf0] hover:bg-white/[0.07]"
          >
            –
          </button>
          <button
            type="button"
            onClick={onFit}
            className="font-smono h-[30px] min-w-[52px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 text-[11px] text-[rgba(233,234,240,0.75)] hover:bg-white/[0.07]"
          >
            {zoomPct}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="h-[30px] w-[30px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] text-[15px] leading-none text-[#e9eaf0] hover:bg-white/[0.07]"
          >
            +
          </button>
        </div>
      </div>
    </header>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "cursor-pointer rounded-lg bg-[rgba(155,140,255,0.22)] px-3.5 py-1.5 text-xs font-medium text-white"
          : "cursor-pointer rounded-lg bg-transparent px-3.5 py-1.5 text-xs font-medium text-[rgba(233,234,240,0.55)]"
      }
    >
      {label}
    </button>
  );
}
