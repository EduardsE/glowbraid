import type { RefObject } from "react";

const SPEED_PRESETS = [0.5, 1, 1.5, 2];

export interface TransportBarProps {
	playing: boolean;
	onPlayPause: () => void;
	onStop: () => void;
	loop: boolean;
	onLoop: () => void;
	speed: number;
	onSpeedPreset: (v: number) => void;
	onScrub: (value: number) => void;
	timeRef: RefObject<HTMLSpanElement | null>;
	scrubRef: RefObject<HTMLInputElement | null>;
	duration: number;
}

export function TransportBar(props: TransportBarProps) {
	return (
		<footer className="z-20 flex h-[74px] flex-none items-center gap-[18px] border-t border-white/[0.06] bg-[rgba(14,15,20,0.6)] px-[18px] backdrop-blur-[14px]">
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					aria-label={props.playing ? "Pause" : "Play"}
					onClick={props.onPlayPause}
					className={
						props.playing
							? "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.05] text-[13px] text-white"
							: "flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.2)] text-[13px] text-white"
					}
				>
					{props.playing ? "❚❚" : "▶"}
				</button>
				<button
					type="button"
					aria-label="Stop"
					onClick={props.onStop}
					className="h-9 w-9 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-xs text-[#e9eaf0] hover:bg-white/[0.08]"
				>
					◼
				</button>
				<button
					type="button"
					aria-label="Toggle loop"
					aria-pressed={props.loop}
					onClick={props.onLoop}
					className={
						props.loop
							? "h-9 w-9 cursor-pointer rounded-[9px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.16)] text-sm text-[#c9beff]"
							: "h-9 w-9 cursor-pointer rounded-[9px] border border-white/10 bg-white/[0.03] text-sm text-[rgba(233,234,240,0.6)]"
					}
				>
					↺
				</button>
			</div>
			<span
				ref={props.timeRef}
				className="font-smono min-w-[88px] text-xs text-[rgba(233,234,240,0.6)]"
			>
				0:00 / 0:12
			</span>
			<div className="flex flex-1 flex-col gap-[5px]">
				<input
					ref={props.scrubRef}
					type="range"
					aria-label="Timeline position"
					min={0}
					max={1000}
					step={1}
					defaultValue={0}
					onInput={(e) => props.onScrub(Number(e.currentTarget.value))}
					className="w-full"
				/>
				<div className="font-smono flex justify-between text-[9px] tracking-[0.05em] text-[rgba(233,234,240,0.22)]">
					<span>KEYFRAMES · SOON</span>
					<span>LOOP {props.duration}s</span>
				</div>
			</div>
			<div className="flex items-center gap-2.5">
				<span className="text-[11px] text-[rgba(233,234,240,0.5)]">Speed</span>
				<div className="flex gap-1">
					{SPEED_PRESETS.map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => props.onSpeedPreset(v)}
							className={
								Math.abs(v - props.speed) < 0.01
									? "font-smono h-[26px] min-w-[34px] cursor-pointer rounded-[7px] border border-[rgba(155,140,255,0.5)] bg-[rgba(155,140,255,0.16)] px-1.5 text-[11px] text-white"
									: "font-smono h-[26px] min-w-[34px] cursor-pointer rounded-[7px] border border-white/[0.08] bg-white/[0.02] px-1.5 text-[11px] text-[rgba(233,234,240,0.6)]"
							}
						>
							{v}×
						</button>
					))}
				</div>
			</div>
		</footer>
	);
}
