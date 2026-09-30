import type { Ref } from "react";
import { useImperativeHandle, useRef } from "react";
import {
  type DimId,
  type DimLine,
  dimensionLine,
  frameMarkerAnchor,
  measuredOutlines,
  type Vec3,
} from "@/renderer/dimensions";
import type { WorldLayout } from "@/renderer/wallLayout";

type Project = (
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number },
) => boolean;

export interface OverlayView {
  layout: WorldLayout;
  /** Always-on overall board dimension. */
  showOverall: boolean;
  overallLabel: string;
  /** The schedule row currently under attention, drawn in redline. */
  live: { id: DimId; mark: string; label: string } | null;
  selectedFrame: number | null;
}

export interface OverlayHandle {
  /** Repositions everything for the frame just rendered. Called every tick. */
  update(project: Project | null, view: OverlayView): void;
}

/** Tick terminator half-length and extension-line overshoot, px. */
const TICK = 4.5;
const OVERSHOOT = 6;

interface DimEls {
  group: SVGGElement | null;
  /** Object line: the edge being measured, so a dark board still reads. */
  object: SVGPathElement | null;
  path: SVGPathElement | null;
  label: SVGGElement | null;
  text: SVGTextElement | null;
  bubble: SVGGElement | null;
  markText: SVGTextElement | null;
  /** Label + font-load state the bubble was last seated for. */
  seated: string;
}

const emptyEls = (): DimEls => ({
  group: null,
  object: null,
  path: null,
  label: null,
  text: null,
  bubble: null,
  markText: null,
  seated: "",
});

const f = (n: number) => n.toFixed(1);

const scratch = { x: 0, y: 0 };

/** Draws closed world-space outlines; clears them when any point leaves the view's depth range. */
function outline(
  el: SVGPathElement | null,
  polygons: Vec3[][],
  project: Project,
): void {
  if (!el) return;
  let d = "";
  for (const points of polygons) {
    for (let i = 0; i < points.length; i++) {
      const v = points[i];
      if (!project(v[0], v[1], v[2], scratch)) {
        el.setAttribute("d", "");
        return;
      }
      d += `${i ? "L" : "M"}${f(scratch.x)} ${f(scratch.y)}`;
    }
    d += "Z";
  }
  el.setAttribute("d", d);
}

/**
 * Lays one dimension out in screen space. Returns false when any of its
 * points leaves the camera's depth range, so the caller can hide it.
 */
function place(
  els: DimEls,
  line: DimLine,
  project: Project,
  labelGap: number,
): boolean {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  const a2 = { x: 0, y: 0 };
  const b2 = { x: 0, y: 0 };
  const p = (v: Vec3, out: { x: number; y: number }) =>
    project(v[0], v[1], v[2], out);
  if (!p(line.a, a) || !p(line.b, b) || !p(line.a2, a2) || !p(line.b2, b2)) {
    return false;
  }

  let d: string;
  let lx: number;
  let ly: number;
  if (line.kind === "radius") {
    // Leader from the arc centre out through the arc, label beyond it.
    let ux = b.x - a.x;
    let uy = b.y - a.y;
    const len = Math.hypot(ux, uy);
    if (len < 0.5) {
      ux = -Math.SQRT1_2;
      uy = -Math.SQRT1_2;
    } else {
      ux /= len;
      uy /= len;
    }
    d = `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}M${f(a.x - 3)} ${f(a.y)}h6M${f(a.x)} ${f(a.y - 3)}v6`;
    lx = b.x + ux * (labelGap + 22);
    ly = b.y + uy * (labelGap + 6);
  } else {
    const ext = (from: { x: number; y: number }, to: typeof from) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return "";
      const k = (len + OVERSHOOT) / len;
      return `M${f(from.x)} ${f(from.y)}L${f(from.x + dx * k)} ${f(from.y + dy * k)}`;
    };
    const tick = (at: { x: number; y: number }) =>
      `M${f(at.x - TICK)} ${f(at.y + TICK)}L${f(at.x + TICK)} ${f(at.y - TICK)}`;
    d = `${ext(a, a2)}${ext(b, b2)}M${f(a2.x)} ${f(a2.y)}L${f(b2.x)} ${f(b2.y)}${tick(a2)}${tick(b2)}`;

    // Label sits off the dimension line, on the side away from the object.
    const mx = (a2.x + b2.x) / 2;
    const my = (a2.y + b2.y) / 2;
    let nx = -(b2.y - a2.y);
    let ny = b2.x - a2.x;
    const nlen = Math.hypot(nx, ny);
    if (nlen < 0.5) {
      nx = 0;
      ny = -1;
    } else {
      nx /= nlen;
      ny /= nlen;
    }
    const awayX = mx - (a.x + b.x) / 2;
    const awayY = my - (a.y + b.y) / 2;
    const facing = nx * awayX + ny * awayY;
    // On-object lines (no offset) default to the label above.
    if (facing < 0 || (facing === 0 && ny > 0)) {
      nx = -nx;
      ny = -ny;
    }
    lx = mx + nx * labelGap;
    ly = my + ny * labelGap;
  }

  els.path?.setAttribute("d", d);
  els.label?.setAttribute("transform", `translate(${f(lx)} ${f(ly)})`);
  return true;
}

/** Sets a dimension's value text, re-seating the key bubble only when it changes. */
function letter(els: DimEls, label: string, mark: string | null): void {
  const text = els.text;
  if (!text) return;
  if (els.markText && mark && els.markText.textContent !== mark) {
    els.markText.textContent = mark;
  }
  if (text.textContent !== label) text.textContent = label;
  // Re-measure when the lettering changes or the webfont finishes loading.
  const key = `${label}|${document.fonts.status}`;
  if (els.bubble && els.seated !== key) {
    const w = text.getComputedTextLength();
    if (w > 0) {
      els.bubble.setAttribute("transform", `translate(${f(-w / 2 - 17)} 0)`);
      els.seated = key;
    }
  }
}

/**
 * Dimension lines drawn over the 3D view. React renders the static SVG
 * skeleton once; positions are written straight to the DOM every tick, like
 * the scrub and time readout, so camera motion never touches React state.
 */
export function DimensionOverlay({ ref }: { ref: Ref<OverlayHandle> }) {
  const overall = useRef<DimEls>(emptyEls());
  const live = useRef<DimEls>(emptyEls());
  const marker = useRef<SVGGElement | null>(null);
  const markerText = useRef<SVGTextElement | null>(null);
  const markerAt = useRef({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    update(project, view) {
      const o = overall.current;
      const l = live.current;
      const m = marker.current;

      let overallOn = false;
      if (project && view.showOverall) {
        const line = dimensionLine(view.layout, "overall");
        if (line) {
          letter(o, view.overallLabel, null);
          overallOn = place(o, line, project, 15);
          if (overallOn) {
            outline(
              o.object,
              measuredOutlines(view.layout, "overall"),
              project,
            );
          }
        }
      }
      o.group?.setAttribute("data-on", String(overallOn));

      // When the live dimension ends, its last geometry stays put and fades.
      let liveOn = false;
      if (project && view.live) {
        const line = dimensionLine(view.layout, view.live.id);
        if (line) {
          letter(l, view.live.label, view.live.mark);
          liveOn = place(l, line, project, 19);
          if (liveOn) {
            outline(
              l.object,
              measuredOutlines(view.layout, view.live.id),
              project,
            );
          }
        }
      }
      l.group?.setAttribute("data-on", String(liveOn));

      let markerOn = false;
      if (project && view.selectedFrame != null && m) {
        const at = frameMarkerAnchor(view.layout, view.selectedFrame);
        if (project(at[0], at[1], at[2], markerAt.current)) {
          markerOn = true;
          m.setAttribute(
            "transform",
            `translate(${f(markerAt.current.x - 9)} ${f(markerAt.current.y - 9)})`,
          );
          const n = String(view.selectedFrame + 1).padStart(2, "0");
          if (markerText.current && markerText.current.textContent !== n) {
            markerText.current.textContent = n;
          }
        }
      }
      m?.setAttribute("data-on", String(markerOn));
    },
  }));

  return (
    <svg
      aria-hidden="true"
      className="gb-dims pointer-events-none absolute inset-0 h-full w-full select-none"
    >
      <g
        ref={(el) => {
          overall.current.group = el;
        }}
        className="gb-dim"
      >
        <path
          ref={(el) => {
            overall.current.object = el;
          }}
          fill="none"
          className="stroke-paper/45"
          strokeWidth="1"
        />
        <path
          ref={(el) => {
            overall.current.path = el;
          }}
          fill="none"
          className="stroke-paper/80"
          strokeWidth="1"
        />
        <g
          ref={(el) => {
            overall.current.label = el;
          }}
        >
          <text
            ref={(el) => {
              overall.current.text = el;
            }}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-paper text-[14px] font-semibold"
          />
        </g>
      </g>

      <g
        ref={(el) => {
          live.current.group = el;
        }}
        className="gb-dim"
      >
        <path
          ref={(el) => {
            live.current.object = el;
          }}
          fill="none"
          className="stroke-paper/70"
          strokeWidth="1"
        />
        <path
          ref={(el) => {
            live.current.path = el;
          }}
          fill="none"
          className="stroke-redline-lit"
          strokeWidth="1.5"
        />
        <g
          ref={(el) => {
            live.current.label = el;
          }}
        >
          <g
            ref={(el) => {
              live.current.bubble = el;
            }}
          >
            <circle r="10" className="fill-redline-lit" />
            <text
              ref={(el) => {
                live.current.markText = el;
              }}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-view text-[13px] font-extrabold"
              style={{ strokeWidth: 0 }}
            />
          </g>
          <text
            ref={(el) => {
              live.current.text = el;
            }}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-redline-lit text-[19px] font-bold"
          />
        </g>
      </g>

      <g ref={marker} className="gb-dim">
        <circle
          r="12.5"
          className="fill-view/85 stroke-redline-lit"
          strokeWidth="1.5"
        />
        <text
          ref={markerText}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-redline-lit text-[13px] font-bold"
          style={{ strokeWidth: 0 }}
        />
      </g>
    </svg>
  );
}
