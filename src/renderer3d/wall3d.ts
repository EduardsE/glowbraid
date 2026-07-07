import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Palette } from "@/engine/palettes";
import type { AnimationId, Frame } from "@/engine/types";
import type { PourPaletteId } from "@/renderer/pourField";
import { getPourTexture } from "@/renderer/pourTexture";
import { shadeForSim } from "@/renderer/wallDefaults";
import {
  RADIAL_SEGMENTS,
  TUBULAR_SEGMENTS,
  writeWallFiberColors,
} from "./fiberColors";
import {
  BEZEL_DEPTH,
  bezelGeometry,
  computeWorldLayout,
  fiberWorldPoints,
  frameOrigin,
  frameSquarePlane,
  roundedRectPoints,
  type WorldLayout,
} from "./fiberGeometry";

export interface Wall3DState {
  frames: Frame[];
  gridSize: number;
  frameSize: number;
  /** Millimetres, like WallDrawState. */
  frameGap: number;
  boardPadding: number;
  cornerRadius: number;
  frameWidth: number;
  frameOffset: number;
  boardColor: string;
  /** Board artwork mode; absent → "none" (flat boardColor material). */
  boardArt?: "none" | "pour";
  boardArtSeed?: number;
  boardArtPalette?: PourPaletteId;
  frameColors: (string | null)[];
  /** Frame index to outline as selected, or null for none. */
  selectedFrame: number | null;
  time: number;
  anim: AnimationId;
  speed: number;
  brightness: number;
  palette: Palette;
}

export interface Wall3D {
  render(state: Wall3DState): void;
  resetCamera(): void;
  dollyIn(): void;
  dollyOut(): void;
  pick(clientX: number, clientY: number): number | null;
  dispose(): void;
}

/** Board slab thickness, cm. */
const BOARD_DEPTH = 1.5;
/** Fibre tube radius at thickness 1, cm (~2mm side-glow strand). */
const FIBER_RADIUS = 0.1;
/** Default bezel color for frames without a custom color. */
const DEFAULT_BEZEL = "#141519";
/** Home camera: direction from board center and distance in board sizes. */
const HOME_DIR = new THREE.Vector3(0.35, 0.3, 1).normalize();
const HOME_DISTANCE = 1.6;
const DOLLY_STEP = 1.15;
/** Bloom tuning — threshold sits above the board/bezel luminance. */
const BLOOM_STRENGTH = 0.9;
const BLOOM_RADIUS = 0.4;
const BLOOM_THRESHOLD = 0.55;
/** Selection outline colour — bright enough that UnrealBloomPass blooms it into a glow. */
const SELECT_COLOR = 0x6cf0ff;
/** Outline outset beyond the frame's outer edge, cm. */
const SELECT_OUTSET = 0.4;

function gradientBackground(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#14151b");
    grad.addColorStop(1, "#08090c");
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bezelColor(frameColors: (string | null)[], index: number): string {
  const custom = frameColors[index];
  return custom == null ? DEFAULT_BEZEL : shadeForSim(custom);
}

export function createWall3D(canvas: HTMLCanvasElement): Wall3D {
  // Throws if WebGL is unavailable — the studio catches and falls back to sim.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  const scene = new THREE.Scene();
  const background = gradientBackground();
  scene.background = background;
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  scene.add(dirLight);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // MSAA target: EffectComposer's default target has no multisampling and
  // thin tubes alias badly without it.
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, {
      samples: 4,
      type: THREE.HalfFloatType,
    }),
  );
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // --- mutable wall state, replaced on rebuild ---
  let layout: WorldLayout = computeWorldLayout(1, 25, 20, 4, 8, 15, 2);
  let group = new THREE.Group();
  let boardMat: THREE.MeshStandardMaterial | null = null;
  let boardTex: THREE.CanvasTexture | null = null;
  let bezelMats: THREE.MeshStandardMaterial[] = [];
  let colorArray = new Float32Array(0);
  let colorAttr: THREE.BufferAttribute | null = null;
  const fiberMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });
  let builtFrames: Frame[] | null = null;
  let builtKey = "";
  let firstBuild = true;
  let pickPlanes: THREE.Mesh[] = [];
  let outline: THREE.LineLoop | null = null;
  let outlineFrame: number | null = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  scene.add(group);

  function disposeGroup(): void {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        // fiberMat is shared and reused across rebuilds; dispose the rest.
        if (obj.material !== fiberMat) {
          (obj.material as THREE.Material).dispose();
        }
      }
    });
    boardTex?.dispose();
    boardTex = null;
    disposeOutline();
    group = new THREE.Group();
    scene.add(group);
  }

  function rebuild(state: Wall3DState): void {
    disposeGroup();
    layout = computeWorldLayout(
      state.gridSize,
      state.frameSize,
      state.frameGap,
      state.boardPadding,
      state.frameWidth,
      state.cornerRadius,
      state.frameOffset,
    );

    const boardGeo = new THREE.BoxGeometry(
      layout.boardSize,
      layout.boardSize,
      BOARD_DEPTH,
    );
    const pour =
      state.boardArt === "pour" &&
      state.boardArtSeed != null &&
      state.boardArtPalette != null
        ? getPourTexture(state.boardArtSeed, state.boardArtPalette)
        : null;
    if (pour) {
      boardTex = new THREE.CanvasTexture(pour.canvas);
      boardTex.colorSpace = THREE.SRGBColorSpace;
    }
    boardMat = new THREE.MeshStandardMaterial({
      color: pour ? 0xffffff : state.boardColor,
      map: pour ? boardTex : null,
      roughness: 0.9,
      metalness: 0.05,
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.z = -BOARD_DEPTH / 2; // front face flush with z = 0
    group.add(board);

    const bezelGeo = bezelGeometry(layout);
    bezelMats = [];
    for (let i = 0; i < state.frames.length; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: bezelColor(state.frameColors, i),
        roughness: 0.8,
        metalness: 0.15,
      });
      bezelMats.push(mat);
      const mesh = new THREE.Mesh(bezelGeo, mat);
      const o = frameOrigin(layout, i);
      mesh.position.set(o.x, o.y, layout.frameOffset);
      group.add(mesh);
    }

    // Invisible per-frame pick targets. visible:false meshes are skipped by
    // the renderer but are still hit by Raycaster, so they cost no draw work.
    // Placed at the bezel front to minimise click parallax vs. the raised frame.
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    pickPlanes = [];
    for (let i = 0; i < state.frames.length; i++) {
      const sq = frameSquarePlane(layout, i);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(sq.size, sq.size),
        pickMat,
      );
      mesh.visible = false;
      mesh.position.set(sq.cx, sq.cy, layout.frameOffset + BEZEL_DEPTH);
      mesh.userData.frameIndex = i;
      group.add(mesh);
      pickPlanes.push(mesh);
    }

    const tubes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < state.frames.length; i++) {
      for (const fiber of state.frames[i].fibers) {
        const flat = fiberWorldPoints(fiber, i, layout);
        const pts: THREE.Vector3[] = [];
        for (let p = 0; p < flat.length; p += 3) {
          pts.push(new THREE.Vector3(flat[p], flat[p + 1], flat[p + 2]));
        }
        tubes.push(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(pts),
            TUBULAR_SEGMENTS,
            FIBER_RADIUS * fiber.thickness,
            RADIAL_SEGMENTS,
            false,
          ),
        );
      }
    }
    if (tubes.length > 0) {
      const fiberGeo = mergeGeometries(tubes);
      for (const t of tubes) t.dispose();
      colorArray = new Float32Array(
        fiberGeo.getAttribute("position").count * 3,
      );
      colorAttr = new THREE.BufferAttribute(colorArray, 3);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      fiberGeo.setAttribute("color", colorAttr);
      group.add(new THREE.Mesh(fiberGeo, fiberMat));
    } else {
      colorArray = new Float32Array(0);
      colorAttr = null;
    }

    dirLight.position.set(
      layout.boardSize * 0.6,
      layout.boardSize * 0.8,
      layout.boardSize,
    );
    controls.minDistance = layout.boardSize * 0.35;
    controls.maxDistance = layout.boardSize * 4;
    camera.near = layout.boardSize * 0.01;
    camera.far = layout.boardSize * 20;
    camera.updateProjectionMatrix();
    if (firstBuild) {
      firstBuild = false;
      resetCamera();
    }
  }

  function resetCamera(): void {
    controls.target.set(0, 0, 0);
    camera.position
      .copy(HOME_DIR)
      .multiplyScalar(layout.boardSize * HOME_DISTANCE);
    controls.update();
  }

  function dolly(factor: number): void {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(
      THREE.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      ),
    );
    camera.position.copy(controls.target).add(offset);
  }

  function disposeOutline(): void {
    if (outline) {
      scene.remove(outline);
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      outline = null;
    }
    outlineFrame = null;
  }

  function buildOutline(index: number): void {
    disposeOutline();
    const o = frameOrigin(layout, index);
    const m = SELECT_OUTSET;
    const pts = roundedRectPoints(
      o.x - m,
      o.y + m,
      layout.frameSize + 2 * m,
      layout.frameSize + 2 * m,
      layout.outerRadius + m,
      true,
    );
    const z = layout.frameOffset + BEZEL_DEPTH + 0.05;
    const geo = new THREE.BufferGeometry().setFromPoints(
      pts.map((p) => new THREE.Vector3(p.x, p.y, z)),
    );
    const mat = new THREE.LineBasicMaterial({
      color: SELECT_COLOR,
      toneMapped: false,
    });
    outline = new THREE.LineLoop(geo, mat);
    scene.add(outline);
    outlineFrame = index;
  }

  function pick(clientX: number, clientY: number): number | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickPlanes, false);
    if (hits.length === 0) return null;
    const idx = hits[0].object.userData.frameIndex;
    return typeof idx === "number" ? idx : null;
  }

  function render(state: Wall3DState): void {
    const key = `${state.gridSize}|${state.frameSize}|${state.frameGap}|${state.boardPadding}|${state.frameWidth}|${state.cornerRadius}|${state.frameOffset}|${state.boardArt ?? "none"}|${state.boardArtSeed ?? 0}|${state.boardArtPalette ?? ""}`;
    if (state.frames !== builtFrames || key !== builtKey) {
      builtFrames = state.frames;
      builtKey = key;
      rebuild(state);
    }
    if (boardMat && boardMat.map == null) boardMat.color.set(state.boardColor);
    for (let i = 0; i < bezelMats.length; i++) {
      bezelMats[i].color.set(bezelColor(state.frameColors, i));
    }
    if (colorAttr) {
      writeWallFiberColors(
        colorArray,
        state.frames,
        state.gridSize,
        state.time,
        state.anim,
        state.speed,
        state.brightness,
        state.palette,
      );
      colorAttr.needsUpdate = true;
    }
    const sel =
      state.selectedFrame != null && state.selectedFrame < state.frames.length
        ? state.selectedFrame
        : null;
    if (sel == null) {
      if (outline) disposeOutline();
    } else if (sel !== outlineFrame) {
      buildOutline(sel);
    }
    controls.update();
    composer.render();
  }

  const ro = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return; // hidden (display:none)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.width, rect.height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  });
  ro.observe(canvas);

  // preventDefault on loss lets the browser fire "restored", after which
  // three re-initializes its GL state automatically.
  const onContextLost = (e: Event) => e.preventDefault();
  canvas.addEventListener("webglcontextlost", onContextLost);

  return {
    render,
    resetCamera,
    dollyIn: () => dolly(1 / DOLLY_STEP),
    dollyOut: () => dolly(DOLLY_STEP),
    pick,
    dispose: () => {
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      disposeGroup();
      fiberMat.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      background.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
