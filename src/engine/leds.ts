import type { Led, Point, Side } from "./types";

export const LEDS_PER_FRAME = 24;
export const LEDS_PER_EDGE = 6;

/**
 * Each edge carries two cut strips of 3 LEDs (matching a real LED-strip
 * installation): strip centers at 0.27 / 0.73 along the edge, LEDs offset
 * −0.085 / 0 / +0.085 within a strip. From the design reference.
 */
const GROUP_CENTERS = [0.27, 0.73] as const;
const WITHIN_GROUP = [-0.085, 0, 0.085] as const;

interface EdgeDef {
  side: Side;
  code: string;
  point: (t: number) => { position: Point; normal: Point };
}

const EDGES: EdgeDef[] = [
  {
    side: "top",
    code: "T",
    point: (t) => ({ position: { x: t, y: 0 }, normal: { x: 0, y: 1 } }),
  },
  {
    side: "right",
    code: "R",
    point: (t) => ({ position: { x: 1, y: t }, normal: { x: -1, y: 0 } }),
  },
  {
    side: "bottom",
    code: "B",
    point: (t) => ({ position: { x: 1 - t, y: 1 }, normal: { x: 0, y: -1 } }),
  },
  {
    side: "left",
    code: "L",
    point: (t) => ({ position: { x: 0, y: 1 - t }, normal: { x: 1, y: 0 } }),
  },
];

export function buildLeds(): Led[] {
  const leds: Led[] = [];
  let index = 0;
  EDGES.forEach((edge, edgeIdx) => {
    for (let k = 0; k < LEDS_PER_EDGE; k++) {
      const strip = Math.floor(k / 3) as 0 | 1;
      const t = GROUP_CENTERS[strip] + WITHIN_GROUP[k % 3];
      const { position, normal } = edge.point(t);
      leds.push({
        id: `${edge.code}${k + 1}`,
        index: index++,
        position,
        normal,
        side: edge.side,
        edgeIndex: k,
        strip,
        u: (edgeIdx + t) / 4,
      });
    }
  });
  return leds;
}
