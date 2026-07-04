import { type RefObject, useEffect, useRef } from "react";
import type { Point } from "@/engine/types";

export interface CanvasInteraction {
  getPan: () => Point;
  setPan: (x: number, y: number) => void;
  onZoomFactor: (factor: number) => void;
  onClickAt: (x: number, y: number) => void;
  onResize: (width: number, height: number, dpr: number) => void;
}

/**
 * Wall-canvas interaction, ported from the design reference:
 * drag pans (a 4px movement threshold distinguishes a click), release
 * without movement selects, wheel zooms (×1.12 / ×0.89), and a
 * ResizeObserver keeps the backing store sized to the parent at DPR ≤ 1.75.
 */
export function useCanvasInteraction(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  interaction: CanvasInteraction,
): void {
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(1.75, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      interactionRef.current.onResize(rect.width, rect.height, dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let panX = 0;
    let panY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const pan = interactionRef.current.getPan();
      panX = pan.x;
      panY = pan.y;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      interactionRef.current.setPan(panX + dx, panY + dy);
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      canvas.style.cursor = "grab";
      if (!moved) {
        const rect = canvas.getBoundingClientRect();
        interactionRef.current.onClickAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      interactionRef.current.onZoomFactor(e.deltaY < 0 ? 1.12 : 0.89);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [canvasRef]);
}
