import { useEffect } from "react";

/**
 * Drives the simulation: requestAnimationFrame while visible, plus an
 * interval fallback so the wall keeps animating when the tab is hidden
 * (rAF is paused by browsers on hidden tabs).
 */
export function useAnimationLoop(step: (dt: number) => void): void {
	useEffect(() => {
		let last: number | null = null;
		let rafId = 0;
		const tick = () => {
			const now = performance.now();
			const dt = last === null ? 0.016 : Math.min(0.05, (now - last) / 1000);
			last = now;
			if (!document.hidden) step(dt);
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		const fallback = window.setInterval(() => {
			if (document.hidden) step(0.04);
		}, 40);
		return () => {
			cancelAnimationFrame(rafId);
			window.clearInterval(fallback);
		};
	}, [step]);
}
