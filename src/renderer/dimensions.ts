import { BEZEL_DEPTH, frameOrigin, type WorldLayout } from "./wallLayout";

export type Vec3 = readonly [number, number, number];

/** Every measurement the studio can draw on the wall. */
export type DimId =
  | "overall"
  | "boardPadding"
  | "frameSize"
  | "frameGap"
  | "frameWidth"
  | "cornerRadius"
  | "frameOffset";

/**
 * One dimension in world cm. `a`/`b` are the measured points on the object;
 * `a2`/`b2` are the ends of the dimension line (equal to `a`/`b` when the
 * line sits on the object itself).
 */
export interface DimLine {
  a: Vec3;
  b: Vec3;
  a2: Vec3;
  b2: Vec3;
  /** "linear": extension lines + tick terminators. "radius": leader from the arc centre. */
  kind: "linear" | "radius";
}

/** Clearance of a dimension line beyond the board edge, cm. */
function clearance(layout: WorldLayout): number {
  return Math.max(3, layout.boardSize * 0.07);
}

/**
 * Where a dimension is drawn on the wall, or null when the wall has nothing
 * to measure (frame spacing on a single-frame wall). Frame dimensions are
 * taken on the top-left frame's front face.
 */
export function dimensionLine(layout: WorldLayout, id: DimId): DimLine | null {
  const half = layout.boardSize / 2;
  const e = clearance(layout);
  // Top dimensions sit closer in than the overall one so their lettering
  // stays inside the view at the home camera.
  const yTop = half + e * 0.5;
  const o = frameOrigin(layout, 0);
  const s = layout.frameSize;
  const zf = layout.frameOffset + BEZEL_DEPTH;
  const above = (x0: number, x1: number, y: number, z: number): DimLine => ({
    a: [x0, y, z],
    b: [x1, y, z],
    a2: [x0, yTop, z],
    b2: [x1, yTop, z],
    kind: "linear",
  });

  switch (id) {
    case "overall":
      return {
        a: [-half, -half, 0],
        b: [half, -half, 0],
        a2: [-half, -half - e, 0],
        b2: [half, -half - e, 0],
        kind: "linear",
      };
    case "boardPadding":
      return {
        a: [-half, half, 0],
        b: [o.x, o.y, 0],
        a2: [-half, yTop, 0],
        b2: [o.x, yTop, 0],
        kind: "linear",
      };
    case "frameSize":
      return above(o.x, o.x + s, o.y, zf);
    case "frameGap":
      if (layout.gridSize < 2) return null;
      return above(o.x + s, o.x + s + layout.gapCm, o.y, zf);
    case "frameWidth":
      return above(o.x, o.x + layout.border, o.y, zf);
    case "cornerRadius": {
      const r = layout.outerRadius;
      const k = r * (1 - Math.SQRT1_2);
      const centre: Vec3 = [o.x + r, o.y - r, zf];
      const onArc: Vec3 = [o.x + k, o.y - k, zf];
      return { a: centre, b: onArc, a2: centre, b2: onArc, kind: "radius" };
    }
    case "frameOffset": {
      // Right edge of the top-right frame, measured along z from the board face.
      const last = frameOrigin(layout, layout.gridSize - 1);
      const x = last.x + s;
      const y = last.y - s / 2;
      const out = e * 0.6;
      return {
        a: [x, y, 0],
        b: [x, y, layout.frameOffset],
        a2: [x + out, y, 0],
        b2: [x + out, y, layout.frameOffset],
        kind: "linear",
      };
    }
  }
}

/** Frame a dimension is taken on: the top-right one for the standoff, else the top-left. */
export function measuredFrame(layout: WorldLayout, id: DimId): number {
  return id === "frameOffset" ? layout.gridSize - 1 : 0;
}

/** The board's front-face outline, closed, clockwise from top-left. */
export function boardOutline(layout: WorldLayout): Vec3[] {
  const h = layout.boardSize / 2;
  return [
    [-h, h, 0],
    [h, h, 0],
    [h, -h, 0],
    [-h, -h, 0],
  ];
}

/** Closed rounded square in the x–y plane at height z, clockwise from the top edge. */
function roundedSquare(
  l: number,
  t: number,
  size: number,
  radius: number,
  z: number,
  cornerSegments: number,
): Vec3[] {
  const rt = l + size;
  const b = t - size;
  const r = Math.max(0, Math.min(radius, size / 2));
  if (r === 0) {
    return [
      [l, t, z],
      [rt, t, z],
      [rt, b, z],
      [l, b, z],
    ];
  }
  const H = Math.PI / 2;
  const pts: Vec3[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = a0 - (H * i) / cornerSegments;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
  };
  arc(rt - r, t - r, H); // top-right: 90° → 0°
  arc(rt - r, b + r, 0); // bottom-right: 0° → -90°
  arc(l + r, b + r, -H); // bottom-left: -90° → -180°
  arc(l + r, t - r, Math.PI); // top-left: 180° → 90°
  return pts;
}

/**
 * Outer edge of frame `index` with the corner radius sampled into short
 * chords. On the front face unless `z` says otherwise.
 */
export function frameOutline(
  layout: WorldLayout,
  index: number,
  cornerSegments = 5,
  z = layout.frameOffset + BEZEL_DEPTH,
): Vec3[] {
  const o = frameOrigin(layout, index);
  return roundedSquare(
    o.x,
    o.y,
    layout.frameSize,
    layout.outerRadius,
    z,
    cornerSegments,
  );
}

/** Inner edge of frame `index`'s bezel (the light panel opening), front face. */
export function panelOutline(
  layout: WorldLayout,
  index: number,
  cornerSegments = 5,
): Vec3[] {
  const o = frameOrigin(layout, index);
  return roundedSquare(
    o.x + layout.border,
    o.y - layout.border,
    layout.panelSize,
    layout.innerRadius,
    layout.frameOffset + BEZEL_DEPTH,
    cornerSegments,
  );
}

/**
 * Every object edge a dimension ends on, so neither end of a dimension line
 * points at something undrawn: both frames for the spacing, the bezel's inner
 * edge for its width, the board for the padding, the frame's back for the
 * standoff.
 */
export function measuredOutlines(layout: WorldLayout, id: DimId): Vec3[][] {
  const index = measuredFrame(layout, id);
  const frame = frameOutline(layout, index);
  switch (id) {
    case "overall":
      return [boardOutline(layout)];
    case "boardPadding":
      return [boardOutline(layout), frame];
    case "frameGap":
      return layout.gridSize < 2
        ? [frame]
        : [frame, frameOutline(layout, index + 1)];
    case "frameWidth":
      return [frame, panelOutline(layout, index)];
    case "frameOffset":
      return [
        boardOutline(layout),
        frameOutline(layout, index, 5, layout.frameOffset),
        frame,
      ];
    default:
      return [frame];
  }
}

/** Front top-left corner of frame `index`, where its detail marker hangs. */
export function frameMarkerAnchor(layout: WorldLayout, index: number): Vec3 {
  const o = frameOrigin(layout, index);
  return [o.x, o.y, layout.frameOffset + BEZEL_DEPTH];
}
