import { ledColor } from "@/engine/animation";
import { blendSegment, delayedTime } from "@/engine/light";
import type { Palette } from "@/engine/palettes";
import { samplePalette } from "@/engine/palettes";
import type { AnimationId, Frame, Point } from "@/engine/types";
import { computeWallLayout, frameGradientPos, frameRect } from "./viewport";

/** Global glow multiplier (design prop default). */
const GLOW = 1;

export interface WallDrawState {
	frames: Frame[];
	gridSize: number;
	frameSize: number;
	zoom: number;
	pan: Point;
	mode: "edit" | "sim";
	selectedFrame: number | null;
	selectedFiber: number | null;
	time: number;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: Palette;
}

interface FrameDrawOptions {
	selected: boolean;
	selectedFiber: number | null;
	edit: boolean;
	gpos: number;
	time: number;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: Palette;
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

export function drawWall(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	state: WallDrawState,
): void {
	const layout = computeWallLayout({
		gridSize: state.gridSize,
		frameSize: state.frameSize,
		zoom: state.zoom,
		pan: state.pan,
		canvasWidth: width,
		canvasHeight: height,
	});
	const edit = state.mode === "edit";
	for (let index = 0; index < state.frames.length; index++) {
		const rect = frameRect(layout, index);
		const selected = index === state.selectedFrame;
		drawFrame(ctx, rect.x, rect.y, rect.size, state.frames[index], {
			selected,
			selectedFiber: selected ? state.selectedFiber : null,
			edit,
			gpos: frameGradientPos(index, state.gridSize),
			time: state.time,
			anim: state.anim,
			speed: state.speed,
			brightness: state.brightness,
			palette: state.palette,
		});
	}
}

export interface ShowcaseOptions {
	time: number;
	anim: AnimationId;
	speed: number;
	brightness: number;
	palette: Palette;
}

/** Single centered demo frame behind the empty-state overlay. */
export function drawShowcaseFrame(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: Frame,
	opts: ShowcaseOptions,
): void {
	const sz = Math.min(width, height) * 0.44;
	const x = width / 2 - sz / 2;
	const y = height / 2 - sz / 2 - 10;
	drawFrame(ctx, x, y, sz, frame, {
		selected: false,
		selectedFiber: null,
		edit: false,
		gpos: 0.5,
		...opts,
	});
}

function drawFrame(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	sz: number,
	frame: Frame,
	opts: FrameDrawOptions,
): void {
	const {
		selected,
		selectedFiber,
		edit,
		gpos,
		time,
		anim,
		speed,
		brightness,
		palette,
	} = opts;
	const r = sz * 0.045;

	// bezel
	ctx.save();
	roundRect(ctx, x - sz * 0.03, y - sz * 0.03, sz * 1.06, sz * 1.06, r * 1.5);
	ctx.fillStyle = edit ? "#181a20" : "#141519";
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.05)";
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.restore();

	// panel + fibres (clipped)
	ctx.save();
	roundRect(ctx, x, y, sz, sz, r);
	ctx.clip();
	ctx.fillStyle = "#07080b";
	ctx.fillRect(x, y, sz, sz);
	const amb = samplePalette(palette, (time * 0.03) % 1);
	const ambientGradient = ctx.createRadialGradient(
		x + sz * 0.5,
		y + sz * 0.55,
		sz * 0.05,
		x + sz * 0.5,
		y + sz * 0.55,
		sz * 0.75,
	);
	ambientGradient.addColorStop(
		0,
		`rgba(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0},0.14)`,
	);
	ambientGradient.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = ambientGradient;
	ctx.fillRect(x, y, sz, sz);

	ctx.globalCompositeOperation = "lighter";
	ctx.lineCap = "round";
	for (const fiber of frame.fibers) {
		const pts = fiber.path;
		const n = pts.length;
		const ledA = frame.leds[fiber.startLedIndex];
		const ledB = frame.leds[fiber.endLedIndex];

		// passive plastic light-guide (faint tinted body — continuous, no dots)
		const bodyColor = samplePalette(palette, fiber.hueBase);
		ctx.beginPath();
		for (let i = 0; i < n; i++) {
			const px = x + pts[i].x * sz;
			const py = y + pts[i].y * sz;
			if (i) ctx.lineTo(px, py);
			else ctx.moveTo(px, py);
		}
		ctx.strokeStyle = `rgba(${bodyColor[0] | 0},${bodyColor[1] | 0},${bodyColor[2] | 0},0.07)`;
		ctx.lineWidth = fiber.thickness * sz * 0.028;
		ctx.stroke();
		ctx.strokeStyle = "rgba(180,190,210,0.05)";
		ctx.lineWidth = fiber.thickness * sz * 0.01;
		ctx.stroke();

		// injected light from both LED ends
		let prevX = x + pts[0].x * sz;
		let prevY = y + pts[0].y * sz;
		for (let i = 1; i < n; i++) {
			const px = x + pts[i].x * sz;
			const py = y + pts[i].y * sz;
			const um = (i - 0.5) / (n - 1);
			const lightA = ledColor(
				ledA,
				gpos,
				delayedTime(time, um * fiber.length),
				anim,
				speed,
				palette,
			);
			const lightB = ledColor(
				ledB,
				gpos,
				delayedTime(time, (1 - um) * fiber.length),
				anim,
				speed,
				palette,
			);
			const seg = blendSegment(lightA, lightB, um);
			if (seg.visible) {
				const [cr, cg, cb] = seg.color;
				const inten = seg.intensity * brightness;
				ctx.beginPath();
				ctx.moveTo(prevX, prevY);
				ctx.lineTo(px, py);
				ctx.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(inten * 0.16 * GLOW).toFixed(3)})`;
				ctx.lineWidth = fiber.thickness * sz * 0.05 * GLOW;
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(prevX, prevY);
				ctx.lineTo(px, py);
				ctx.strokeStyle = `rgba(${Math.min(255, cr + 70) | 0},${Math.min(255, cg + 70) | 0},${Math.min(255, cb + 70) | 0},${Math.min(1, inten).toFixed(3)})`;
				ctx.lineWidth = fiber.thickness * sz * 0.014;
				ctx.stroke();
			}
			prevX = px;
			prevY = py;
		}
	}
	ctx.globalCompositeOperation = "source-over";

	// selected fibre highlight (edit mode)
	if (
		edit &&
		selected &&
		selectedFiber != null &&
		frame.fibers[selectedFiber]
	) {
		const pts = frame.fibers[selectedFiber].path;
		ctx.beginPath();
		for (let i = 0; i < pts.length; i++) {
			const px = x + pts[i].x * sz;
			const py = y + pts[i].y * sz;
			if (i) ctx.lineTo(px, py);
			else ctx.moveTo(px, py);
		}
		ctx.strokeStyle = "rgba(255,255,255,0.85)";
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 5]);
		ctx.stroke();
		ctx.setLineDash([]);
	}
	ctx.restore();

	// panel border
	ctx.save();
	roundRect(ctx, x, y, sz, sz, r);
	if (selected) {
		ctx.strokeStyle = "rgba(155,140,255,0.9)";
		ctx.lineWidth = 2;
		ctx.shadowColor = "rgba(155,140,255,0.7)";
		ctx.shadowBlur = 16;
	} else {
		ctx.strokeStyle = "rgba(255,255,255,0.09)";
		ctx.lineWidth = 1;
	}
	ctx.stroke();
	ctx.restore();

	// LEDs embedded in the border — edit mode only
	if (edit) {
		// 3-LED strip backings (real cut LED-strip segments)
		ctx.save();
		for (let s = 0; s < frame.leds.length; s += 3) {
			const first = frame.leds[s];
			const last = frame.leds[s + 2];
			const ax = x + first.position.x * sz - first.normal.x * sz * 0.03;
			const ay = y + first.position.y * sz - first.normal.y * sz * 0.03;
			const cx = x + last.position.x * sz - last.normal.x * sz * 0.03;
			const cy = y + last.position.y * sz - last.normal.y * sz * 0.03;
			ctx.beginPath();
			ctx.moveTo(ax, ay);
			ctx.lineTo(cx, cy);
			ctx.strokeStyle = "rgba(255,255,255,0.14)";
			ctx.lineWidth = sz * 0.012;
			ctx.lineCap = "round";
			ctx.stroke();
		}
		ctx.restore();

		const selFiber =
			selected && selectedFiber != null ? frame.fibers[selectedFiber] : null;
		for (const led of frame.leds) {
			const light = ledColor(led, gpos, time, anim, speed, palette);
			const [lr, lg, lb] = light.color;
			const bx = x + led.position.x * sz - led.normal.x * sz * 0.03;
			const by = y + led.position.y * sz - led.normal.y * sz * 0.03;
			ctx.beginPath();
			ctx.arc(bx, by, sz * 0.017, 0, 6.283);
			ctx.fillStyle = "#0a0b0e";
			ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.12)";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(bx, by, sz * 0.0095, 0, 6.283);
			ctx.shadowColor = `rgba(${lr | 0},${lg | 0},${lb | 0},0.9)`;
			ctx.shadowBlur = sz * 0.03 * (0.4 + 0.6 * light.brightness);
			ctx.fillStyle = `rgba(${lr | 0},${lg | 0},${lb | 0},${0.4 + 0.6 * light.brightness})`;
			ctx.fill();
			ctx.shadowBlur = 0;
			if (
				selFiber &&
				(selFiber.startLedIndex === led.index ||
					selFiber.endLedIndex === led.index)
			) {
				ctx.beginPath();
				ctx.arc(bx, by, sz * 0.022, 0, 6.283);
				ctx.strokeStyle = "#fff";
				ctx.lineWidth = 1.6;
				ctx.stroke();
			}
		}
	}
}
