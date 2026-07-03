import type { PaletteId, RGB } from "./types";

export interface Palette {
	id: PaletteId;
	name: string;
	stops: RGB[];
}

export const PALETTES: Record<PaletteId, Palette> = {
	sunset: {
		id: "sunset",
		name: "Sunset",
		stops: [
			[255, 92, 140],
			[255, 150, 96],
			[255, 214, 138],
			[214, 96, 206],
			[150, 96, 255],
		],
	},
	neon: {
		id: "neon",
		name: "Neon",
		stops: [
			[86, 240, 255],
			[255, 64, 204],
			[126, 255, 190],
			[178, 120, 255],
			[86, 240, 255],
		],
	},
	aurora: {
		id: "aurora",
		name: "Aurora",
		stops: [
			[92, 255, 182],
			[86, 204, 255],
			[160, 120, 255],
			[64, 255, 222],
			[92, 255, 182],
		],
	},
	ember: {
		id: "ember",
		name: "Ember",
		stops: [
			[255, 72, 64],
			[255, 150, 60],
			[255, 206, 110],
			[255, 96, 150],
			[200, 50, 80],
		],
	},
	spectrum: {
		id: "spectrum",
		name: "Spectrum",
		stops: [
			[255, 80, 80],
			[255, 200, 60],
			[110, 255, 110],
			[70, 200, 255],
			[180, 110, 255],
		],
	},
};

export const PALETTE_IDS: PaletteId[] = [
	"sunset",
	"neon",
	"aurora",
	"ember",
	"spectrum",
];

/** Piecewise-linear sample; u wraps around (ported from the design reference). */
export function samplePalette(palette: Palette, u: number): RGB {
	const stops = palette.stops;
	const n = stops.length - 1;
	const w = ((u % 1) + 1) % 1;
	const f = w * n;
	const i = Math.floor(f);
	const t = f - i;
	const a = stops[i];
	const b = stops[Math.min(n, i + 1)];
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
}
