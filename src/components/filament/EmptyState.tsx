export function EmptyState({ onStart }: { onStart: () => void }) {
	return (
		<div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-[26px] [background:radial-gradient(60%_60%_at_50%_45%,rgba(10,11,14,0.2),rgba(10,11,14,0.75))]">
			<div className="flex animate-[fil-float_6s_ease-in-out_infinite] flex-col items-center gap-2.5 text-center">
				<div className="text-[26px] font-semibold tracking-[-0.01em]">
					Design light that flows.
				</div>
				<div className="max-w-[400px] text-[13.5px] leading-relaxed text-[rgba(233,234,240,0.5)]">
					Hidden LEDs around each frame inject colour into passive side-glow
					fibres. Generate a wall and watch the light travel.
				</div>
			</div>
			<button
				type="button"
				onClick={onStart}
				className="h-[46px] cursor-pointer rounded-xl border border-[rgba(155,140,255,0.5)] bg-gradient-to-b from-[rgba(155,140,255,0.28)] to-[rgba(155,140,255,0.12)] px-[26px] text-sm font-semibold text-white shadow-[0_8px_30px_rgba(155,140,255,0.28)] hover:from-[rgba(155,140,255,0.4)] hover:to-[rgba(155,140,255,0.2)]"
			>
				Create New Wall
			</button>
		</div>
	);
}
