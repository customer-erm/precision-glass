/**
 * Parametric 3D frameless shower — the living build-sheet of the tour.
 *
 * Starts as a faint blueprint hologram on a glowing pedestal. As the
 * customer makes selections it assembles and solidifies:
 *   - enclosure choice  → panels draw in as luminous edges, then glaze
 *   - glass choice      → material morphs (clear / frosted / rain)
 *   - hardware choice   → every metal part re-plates to the finish
 *   - handle choice     → handle swaps with a snap
 *   - each step         → solidity ramps from blueprint toward real
 *
 * Geometry is procedural (boxes, cylinders, extrusions) — no model files.
 * Units are meters; the enclosure footprint is ~1.4 × 1.4 on the pedestal.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gsap } from '../animations/engine';
import { prefersReducedMotion } from './flag';
import { extrasCompat } from './compat';

export interface ShowerModelTuning {
  clipScale: number;
  clipDepth: number;
  clipBevel: number;
  hingeScale: number;
  sliderFixedPanelZ: number;
  sliderDoorPanelZ: number;
  sliderFixedEndX: number;
  sliderDoorStartX: number;
  sliderDoorEndX: number;
  railCenterX: number;
  railLength: number;
  railDiameter: number;
  railYOffset: number;
  railProjection: number;
  wallBracketScale: number;
  hangerScale: number;
  hangerDrop: number;
  hangerProjection: number;
  rollerStartX: number;
  rollerScale: number;
  rollerSpread: number;
  rollerProjection: number;
  rollerYOffset: number;
  floorGuideScale: number;
  floorGuideX: number;
  floorGuideProjection: number;
  metalRoughnessScale: number;
  metalEnv: number;
  glassOpacityScale: number;
  glassEnv: number;
}

export interface SavedShowerDesign {
  id: string;
  name: string;
  enclosure: string;
  glass: string;
  finish: string;
  handle: string;
  extras: string;
  tuning: ShowerModelTuning;
  updatedAt: string;
}

export const SHOWER_DESIGNS_STORAGE_KEY = 'pg:shower-model-designs';

export const DEFAULT_SHOWER_TUNING: ShowerModelTuning = {
  clipScale: 0.72,
  clipDepth: 0.56,
  clipBevel: 0.008,
  hingeScale: 0.72,
  sliderFixedPanelZ: 0.66,
  sliderDoorPanelZ: 0.74,
  sliderFixedEndX: 0.06,
  sliderDoorStartX: -0.06,
  sliderDoorEndX: 0.7,
  railCenterX: 0,
  railLength: 1.42, // span the full wall-to-wall opening (≈1.4) so brackets land on the jambs
  railDiameter: 0.026,
  railYOffset: -0.02, // sit just under the glass top edge as a proper header rail
  railProjection: 0.05,
  wallBracketScale: 0.56,
  hangerScale: 0.66,
  hangerDrop: 0.105,
  hangerProjection: 0.018,
  rollerStartX: 0.05,
  rollerScale: 0.82,
  rollerSpread: 0.43,
  rollerProjection: 0.032,
  rollerYOffset: 0.006,
  floorGuideScale: 0.62,
  floorGuideX: 0.16,
  floorGuideProjection: 0,
  metalRoughnessScale: 0.72,
  metalEnv: 2.15,
  glassOpacityScale: 0.98,
  glassEnv: 3.05,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function readSavedShowerDesigns(): SavedShowerDesign[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SHOWER_DESIGNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as SavedShowerDesign[] : [];
  } catch {
    return [];
  }
}

export interface ShowerRig {
  group: THREE.Group;
  setEnclosure(label: string): void;
  setGlass(label: string): void;
  setHardware(label: string): void;
  setHandle(label: string): void;
  setAccessories(label: string): void;
  setModelTuning(settings: Partial<ShowerModelTuning>): void;
  getModelTuning(): ShowerModelTuning;
  /** Apply upgrades: grid muntin bars and/or the steam transom package. */
  setExtras(label: string): void;
  setSolidity(t: number): void;
  /** Celebratory ring flash when a selection locks in. */
  pulse(): void;
  /** Shower-in-use mood: falling water spray + rising steam. */
  setWater(on: boolean): void;
  /** Toggle the clicked shower door when the stage ray hits a door panel. */
  tryToggleDoor(raycaster: THREE.Raycaster): boolean;
  idle(dt: number): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/*  Option mapping                                                      */
/* ------------------------------------------------------------------ */

type EnclosureKey = 'single' | 'door-panel' | 'corner90' | 'neo' | 'slider'
  | 'arched' | 'splash' | 'steam' | 'custom';

function enclosureKeyFor(label: string): EnclosureKey {
  const v = label.toLowerCase();
  if (v.includes('splash') || v.includes('walk')) return 'splash';
  if (v.includes('90') || v.includes('corner')) return 'corner90';
  if (v.includes('neo')) return 'neo';
  if (v.includes('slid') || v.includes('bypass')) return 'slider';
  if (v.includes('arch')) return 'arched';
  if (v.includes('steam')) return 'steam';
  if (v.includes('custom')) return 'custom';
  if (v.includes('panel')) return 'door-panel';
  return 'single';
}

const FINISHES: Record<string, { color: number; roughness: number }> = {
  chrome: { color: 0xdfe5ea, roughness: 0.12 },
  nickel: { color: 0xc9c2b6, roughness: 0.35 },
  black: { color: 0x17181c, roughness: 0.62 },
  brass: { color: 0xd6b25e, roughness: 0.18 },
  'satin-brass': { color: 0xc7a565, roughness: 0.45 },
};

function finishFor(label: string): { color: number; roughness: number } {
  const v = label.toLowerCase();
  if (v.includes('matte') || v.includes('black')) return FINISHES.black;
  if (v.includes('nickel')) return FINISHES.nickel;
  if (v.includes('satin')) return FINISHES['satin-brass'];
  if (v.includes('brass') || v.includes('gold')) return FINISHES.brass;
  return FINISHES.chrome;
}

type GlassKey = 'clear' | 'frosted' | 'rain';

function glassKeyFor(label: string): GlassKey {
  const v = label.toLowerCase();
  if (v.includes('frost') || v.includes('etch')) return 'frosted';
  if (v.includes('rain') || v.includes('textur')) return 'rain';
  return 'clear';
}

type HandleKey = 'pull' | 'ladder' | 'u-handle' | 'knob' | 'towel';

function handleKeyFor(label: string): HandleKey {
  const v = label.toLowerCase();
  if (v.includes('ladder')) return 'ladder';
  if (v.includes('u-') || v.includes('u ')) return 'u-handle';
  if (v.includes('knob')) return 'knob';
  if (v.includes('towel')) return 'towel';
  return 'pull';
}

/* ------------------------------------------------------------------ */
/*  Panel layout specs                                                  */
/* ------------------------------------------------------------------ */

const WALL_H = 2.45;
const GLASS_H = 2.0;
const STEAM_GLASS_H = WALL_H;
const BASE_Y = 0.1; // top of pedestal
const T = 0.012;    // 1/2" glass

interface PanelSpec {
  from: [number, number]; // x,z
  to: [number, number];
  height?: number;
  baseY?: number;
  isDoor?: boolean;       // gets hinges
  sliding?: boolean;      // gets top rollers instead of wall hinges
  hasHandle?: boolean;
  arched?: boolean;
  // When a door hinges off a fixed panel that runs at a different angle (e.g.
  // the neo-angle door pivots off the side panel ∥ the wall), the wall-side
  // hinge leaf must lie along THAT panel, not the diagonal door. Y-rotation in
  // radians for the fixed (wall-side) hinge host; defaults to the door's angle.
  hingeRotY?: number;
}

interface EnclosureLayout { panels: PanelSpec[]; headerBar?: boolean; alcoveRightWall?: boolean; }

const L = -0.7, R = 0.7, F = 0.7; // left wall x, right extent, front z

const LAYOUTS: Record<EnclosureKey, EnclosureLayout> = {
  single: { alcoveRightWall: true, panels: [
    { from: [L, F], to: [R, F], isDoor: true, hasHandle: true },
  ] },
  'door-panel': { alcoveRightWall: true, panels: [
    { from: [L, F], to: [0, F] },
    { from: [0, F], to: [R, F], isDoor: true, hasHandle: true },
  ] },
  corner90: { panels: [
    { from: [L, F], to: [0, F] },
    { from: [0, F], to: [R, F], isDoor: true, hasHandle: true },
    { from: [R, F], to: [R, -0.7] },
  ] },
  // Neo-angle (per DreamLine Prism / Delta 38x38 geometry): a square corner
  // footprint with the outer corner cut at 45° — two fixed side panels run
  // PARALLEL to the walls (held with discrete clips), and the door spans the
  // diagonal cut. Pentagon plan: wall, wall, fixed, 45° door, fixed.
  neo: { panels: [
    { from: [L, 0.26], to: [-0.17, 0.26] },                          // left fixed ∥ back wall
    { from: [-0.17, 0.26], to: [0.26, -0.17], isDoor: true, hasHandle: true, hingeRotY: 0 }, // 45° door (~24"); hinges bend onto the left fixed panel (∥ back wall, rotY 0)
    { from: [0.26, -0.17], to: [0.26, L] },                          // right fixed ∥ left wall
  ] },
  slider: { headerBar: true, alcoveRightWall: true, panels: [
    { from: [L, 0.66], to: [0.06, 0.66] },
    { from: [-0.06, 0.74], to: [R, 0.74], sliding: true, hasHandle: true },
  ] },
  arched: { panels: [
    { from: [L, F], to: [-0.05, F] },
    { from: [-0.05, F], to: [R, F], isDoor: true, hasHandle: true, arched: true },
  ] },
  splash: { panels: [
    { from: [L, F], to: [0.15, F] },
  ] },
  steam: { panels: [
    { from: [L, F], to: [-0.15, F], height: STEAM_GLASS_H },
    { from: [-0.15, F], to: [R, F], isDoor: true, hasHandle: true },
    { from: [R, F], to: [R, -0.7], height: STEAM_GLASS_H },
    { from: [-0.15, F], to: [R, F], baseY: BASE_Y + GLASS_H, height: STEAM_GLASS_H - GLASS_H }, // door transom to ceiling
  ] },
  custom: { panels: [
    { from: [L, 0.45], to: [-0.3, F] },
    { from: [-0.3, F], to: [0.3, F], isDoor: true, hasHandle: true },
    { from: [0.3, F], to: [R, 0.45] },
  ] },
};

/* ------------------------------------------------------------------ */
/*  Textures                                                            */
/* ------------------------------------------------------------------ */

function makeTileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#10233a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(120, 170, 220, 0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return tex;
}

// "Rain"/reeded glass: vertical flutes (thin lines) for a clean architectural
// read, plus a finer droplet cascade for organic sparkle. Returned as a single
// grayscale map used BOTH as a bumpMap (relief) and a roughnessMap (so the
// flutes catch the light as visible streaks even through the glass transmission).
function makeRainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7d7d7d';
  ctx.fillRect(0, 0, 512, 512);

  // Vertical reeded flutes — each flute a dark valley → bright crest → dark
  // valley gradient. These are the "thin lines" that make the texture read.
  const flutes = 18;
  const fw = 512 / flutes;
  for (let i = 0; i < flutes; i++) {
    const x = i * fw;
    const g = ctx.createLinearGradient(x, 0, x + fw, 0);
    g.addColorStop(0.0, 'rgba(22,22,22,0.95)');
    g.addColorStop(0.46, 'rgba(244,244,244,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(1.0, 'rgba(22,22,22,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, fw, 512);
    // crisp specular highlight line down the crest of each flute
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillRect(x + fw * 0.5 - 1.1, 0, 2.2, 512);
  }

  // Wavering droplet cascade riding over the flutes — keeps it from looking
  // mechanical and sells the "rain" name.
  for (let i = 0; i < 1300; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 2 + Math.random() * 6, len = r * (2.5 + Math.random() * 3.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const bright = 200 + Math.floor(Math.random() * 55);
    g.addColorStop(0, `rgba(${bright},${bright},${bright},0.7)`);
    g.addColorStop(0.6, `rgba(${bright - 60},${bright - 60},${bright - 60},0.35)`);
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, len / r);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(2.1, 2.5);
  return tex;
}

/**
 * A procedural "studio" environment painted as an equirectangular image:
 * a dark cool room with bright overhead light troughs and tall window bars.
 * PMREM'd, it gives glass and chrome crisp, contrasty reflections —
 * the clean vertical/horizontal streaks that read as real glass — instead
 * of the flat, soft wash of the default RoomEnvironment.
 */
export function makeStudioEnvTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Room shell: cool-lit ceiling fading down to a dim floor. The mid/low
  // tones are deliberately lifted off black so polished chrome reflects a
  // soft grey room (real metal) instead of going dead black.
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0.0, '#46596f');
  bg.addColorStop(0.42, '#233447');
  bg.addColorStop(0.62, '#1b2a3a');
  bg.addColorStop(1.0, '#111d29');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.globalCompositeOperation = 'lighter';

  // Overhead light troughs → horizontal highlight bands across the glass.
  const hStrip = (y: number, h: number, a: number): void => {
    const g = ctx.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, 'rgba(180,210,245,0)');
    g.addColorStop(0.5, `rgba(228,242,255,${a})`);
    g.addColorStop(1, 'rgba(180,210,245,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - h, 1024, h * 2);
  };
  hStrip(64, 28, 0.9);
  hStrip(150, 16, 0.4);

  // Tall window bars → the crisp vertical reflection streaks on the panes.
  const vBar = (x: number, w: number, a: number): void => {
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(200,225,255,0)');
    g.addColorStop(0.5, `rgba(238,247,255,${a})`);
    g.addColorStop(1, 'rgba(200,225,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w, 36, w * 2, 340);
  };
  vBar(205, 28, 0.72);
  vBar(330, 13, 0.5);
  vBar(755, 32, 0.78);
  vBar(880, 15, 0.5);

  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlassSheenTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSteamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(235, 245, 255, 0.85)');
  g.addColorStop(0.5, 'rgba(220, 235, 250, 0.3)');
  g.addColorStop(1, 'rgba(210, 230, 250, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ */
/*  Rig                                                                 */
/* ------------------------------------------------------------------ */

interface PanelRuntime {
  /** Structural object added to the assembly; door roots live on the hinge line. */
  root: THREE.Group;
  /** Centered glass/hardware content under root. */
  pivot: THREE.Group;
  glass: THREE.Mesh;
  glassMat: THREE.MeshPhysicalMaterial;
  reflection: THREE.Mesh;
  reflectionMat: THREE.MeshBasicMaterial;
  edgeGlow: THREE.Group;
  edgeGlowMat: THREE.MeshBasicMaterial;
  edges: THREE.LineSegments;
  edgeMat: THREE.LineBasicMaterial;
  /** Structural yaw of the pivot — assembly animation swings into this. */
  rotY: number;
  /** Flat-panel dimensions — used by the grid upgrade. */
  w: number;
  h: number;
  isDoor: boolean;
  sliding: boolean;
  hasHandle: boolean;
  /** Applied muntin-bar group when the grid upgrade is active. */
  grid?: THREE.Group;
}

export function createShowerRig(opts: { cheapGlass: boolean }): ShowerRig {
  const group = new THREE.Group();
  let elapsed = 0;
  let solidity = 0.15;
  let glassKey: GlassKey = 'clear';
  // Realistic transmissive glass wants opacity ~1 (the see-through comes from
  // `transmission`, not from a faint opacity) — per three.js MeshPhysicalMaterial
  // guidance. The cheap fallback (no transmission on low-power devices) still
  // fakes the look with a low opacity.
  const clearGlassDisplayOpacity = opts.cheapGlass ? 0.15 : 0.97;
  let tuning: ShowerModelTuning = { ...DEFAULT_SHOWER_TUNING };
  let currentFinish = finishFor('chrome');
  const rainTex = makeRainTexture();
  const glassSheenTex = makeGlassSheenTexture();
  const tileTex = makeTileTexture();

  /* ---- Pedestal + walls ---- */

  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x0a1828, roughness: 0.55, metalness: 0.35 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.1, 64), pedestalMat);
  pedestal.position.y = 0.05;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.65 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.012, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  // Walls are thin extruded slabs: tiled (and bump-mapped) on the inside
  // face, translucent on every other face — so no matter how the camera
  // orbits, the walls never hide the glass; you see through them instead.
  const tileMat = new THREE.MeshStandardMaterial({
    color: 0x24527e, roughness: 0.72, map: tileTex,
    bumpMap: tileTex, bumpScale: 2.2,
  });
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x16395e, transparent: true, opacity: 0.34,
    roughness: 0.35, metalness: 0.1, depthWrite: false,
    envMapIntensity: 0.8,
  });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(1.58, WALL_H, 0.07),
    [shellMat, shellMat, shellMat, shellMat, tileMat, shellMat], // tile faces the shower (+z)
  );
  backWall.position.set(0, BASE_Y + WALL_H / 2, -0.745);
  backWall.renderOrder = 1;
  group.add(backWall);
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, WALL_H, 1.58),
    [tileMat, shellMat, shellMat, shellMat, shellMat, shellMat], // tile faces the shower (+x)
  );
  leftWall.position.set(-0.745, BASE_Y + WALL_H / 2, 0);
  leftWall.renderOrder = 1;
  group.add(leftWall);
  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, WALL_H, 1.58),
    [shellMat, tileMat, shellMat, shellMat, shellMat, shellMat], // tile faces the shower (-x)
  );
  rightWall.position.set(0.745, BASE_Y + WALL_H / 2, 0);
  rightWall.renderOrder = 1;
  rightWall.visible = false;
  group.add(rightWall);

  const stallJambGroup = new THREE.Group();
  const stallJambGeo = new THREE.BoxGeometry(0.3, WALL_H, 0.07);
  const leftJamb = new THREE.Mesh(stallJambGeo.clone(), tileMat);
  leftJamb.position.set(-0.535, BASE_Y + WALL_H / 2, F + 0.035);
  const rightJamb = new THREE.Mesh(stallJambGeo.clone(), tileMat);
  rightJamb.position.set(0.535, BASE_Y + WALL_H / 2, F + 0.035);
  stallJambGeo.dispose();
  stallJambGroup.add(leftJamb, rightJamb);
  stallJambGroup.visible = false;
  group.add(stallJambGroup);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x14283f, roughness: 0.7, map: tileTex });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.68, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BASE_Y - 0.001;
  floor.receiveShadow = true;
  group.add(floor);

  // Showerhead — arm comes out of the BACK wall, head hanging at its end.
  // Physical material with a light clearcoat gives every metal part a real
  // plated/lacquered sheen across chrome, nickel, brass and matte black.
  const metalMat = new THREE.MeshPhysicalMaterial({
    color: currentFinish.color,
    metalness: 1,
    roughness: currentFinish.roughness * tuning.metalRoughnessScale,
    envMapIntensity: tuning.metalEnv,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
  });
  // Decorative grid muntins are ALWAYS matte black — independent of the chosen
  // hardware finish (chrome handles still get black grids).
  const gridMat = new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.62, metalness: 0.4, envMapIntensity: 0.8 });
  const HEAD_X = -0.35, HEAD_Y = BASE_Y + 1.96;
  // Wall flange where the arm penetrates the back wall
  const wallFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.022, 28), metalMat);
  wallFlange.rotation.x = Math.PI / 2;
  wallFlange.position.set(HEAD_X, HEAD_Y, -0.72);
  group.add(wallFlange);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 20), metalMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(HEAD_X, HEAD_Y, -0.59); // spans wall (z=-0.74) → z=-0.44
  group.add(arm);
  const headJoint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 16), metalMat);
  headJoint.position.set(HEAD_X, HEAD_Y, -0.45);
  group.add(headJoint);
  // Round rain head: a shallow body, a turned outer rim, and a recessed
  // spray face plate.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.108, 0.024, 40), metalMat);
  head.position.set(HEAD_X, BASE_Y + 1.92, -0.44);
  head.rotation.x = 0.1;
  group.add(head);
  const headRim = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.011, 16, 48), metalMat);
  headRim.position.set(HEAD_X, BASE_Y + 1.915, -0.438);
  headRim.rotation.x = Math.PI / 2 + 0.1;
  group.add(headRim);
  const headFace = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.006, 40), metalMat);
  headFace.position.set(HEAD_X, BASE_Y + 1.908, -0.439);
  headFace.rotation.x = 0.1;
  group.add(headFace);

  /* ---- Glass assembly (rebuilt per enclosure) ---- */

  const assembly = new THREE.Group();
  group.add(assembly);
  let panels: PanelRuntime[] = [];
  const extraPanels: PanelRuntime[] = []; // steam transoms
  let handleHost: THREE.Group | null = null; // attached to the door pivot
  let accessoryGroups: THREE.Group[] = [];
  let handleKey: HandleKey = 'pull';
  let accessoriesLabel = '';
  let currentKey: EnclosureKey = 'corner90';
  let currentLabel = '90 corner';
  let gridOn = false;
  let steamOn = false;
  let doorOpen = false;
  const hardwareMeshes: THREE.Mesh[] = [];

  function allGlass(): PanelRuntime[] {
    return panels.concat(extraPanels);
  }

  function trackHardware(mesh: THREE.Mesh): THREE.Mesh {
    mesh.renderOrder = 8;
    mesh.castShadow = !opts.cheapGlass;
    mesh.receiveShadow = true;
    hardwareMeshes.push(mesh);
    return mesh;
  }

  function makeGlassReflectionMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: 0xdff8ff,
      map: glassSheenTex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      toneMapped: true,
    });
  }

  function makeGlassEdgeMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: 0xbaf4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      toneMapped: true,
    });
  }

  function makePolishedGlassEdges(w: number, hgt: number, hingeGaps = false): { group: THREE.Group; mat: THREE.MeshBasicMaterial } {
    const mat = makeGlassEdgeMaterial();
    const group = new THREE.Group();
    const edgeDepth = T * 1.18;
    const side = 0.0055;
    const cap = 0.008;
    const z = T * 0.58;
    const addEdge = (geo: THREE.BufferGeometry, x: number, y: number): void => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.renderOrder = 6;
      group.add(mesh);
    };
    const addVertical = (x: number, y1: number, y2: number): void => {
      const height = Math.max(0.001, y2 - y1);
      addEdge(new THREE.BoxGeometry(side, height, edgeDepth), x, y1 + height / 2);
    };
    if (hingeGaps) {
      const hingeClearance = [
        [0.0, 0.3],
        [0.62, 1.32],
        [1.68, hgt],
      ] as const;
      hingeClearance.forEach(([y1, y2]) => addVertical(-w / 2 + side / 2, y1, y2));
    } else {
      addVertical(-w / 2 + side / 2, 0, hgt);
    }
    addEdge(new THREE.BoxGeometry(side, hgt, edgeDepth), w / 2 - side / 2, hgt / 2);
    addEdge(new THREE.BoxGeometry(Math.max(0.04, w), cap, edgeDepth), 0, cap / 2);
    addEdge(new THREE.BoxGeometry(Math.max(0.04, w), cap, edgeDepth), 0, hgt - cap / 2);
    return { group, mat };
  }

  function makeGlassMaterial(): THREE.MeshPhysicalMaterial {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transparent: true,
      opacity: clearGlassDisplayOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Reflections come from the env map + clearcoat. With the high-contrast
      // studio environment a healthy intensity gives crisp window streaks.
      envMapIntensity: tuning.glassEnv * 0.8,
      clearcoat: 1,
      clearcoatRoughness: 0,
      reflectivity: 1,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    if (!opts.cheapGlass) {
      // Full transmission + IOR 1.5 (the physical default for glass) gives a
      // proper see-through pane with Fresnel edge reflection and refraction.
      m.transmission = 1;
      m.ior = 1.5;
      m.thickness = 0.012;
      m.attenuationColor = new THREE.Color(0xffffff); // untinted = maximum clarity
      m.attenuationDistance = 12;
      m.specularIntensity = 1;
      m.specularColor = new THREE.Color(0xffffff);
    }
    return m;
  }

  function applyGlassKey(m: THREE.MeshPhysicalMaterial, key: GlassKey, animate: boolean): void {
    const target = key === 'frosted'
      ? { roughness: 0.82, fallbackOpacity: 0.5, color: new THREE.Color(0xf5f8fb), envBoost: 0.7, emissive: 0, specular: 0.58, transmission: 0.54, thickness: 0.04, attenuationDistance: 1.25 }
      : key === 'rain'
        ? { roughness: 0.28, fallbackOpacity: 0.34, color: new THREE.Color(0xf8feff), envBoost: 1.18, emissive: 0, specular: 0.84, transmission: 0.72, thickness: 0.03, attenuationDistance: 2.5 }
        : { roughness: 0, fallbackOpacity: clearGlassDisplayOpacity, color: new THREE.Color(0xffffff), envBoost: 0.8, emissive: 0, specular: 1, transmission: 1, thickness: 0.012, attenuationDistance: 12 };
    const isRain = key === 'rain';
    const isClear = key === 'clear';
    m.map = null;
    m.bumpMap = isRain ? rainTex : null;
    m.bumpScale = isRain ? 0.075 : 0;
    m.roughnessMap = isRain ? rainTex : null;
    m.transparent = true;
    if (!opts.cheapGlass) {
      m.transmission = target.transmission;
      m.thickness = target.thickness;
      m.attenuationColor = isClear ? new THREE.Color(0xffffff) : new THREE.Color(0xeaf6fb);
      m.attenuationDistance = target.attenuationDistance;
      m.specularIntensity = target.specular;
    }
    m.emissiveIntensity = target.emissive;
    m.envMapIntensity = tuning.glassEnv * target.envBoost;
    m.needsUpdate = true;
    if (animate && !prefersReducedMotion()) {
      gsap.to(m, { roughness: target.roughness, duration: 1.1, ease: 'power2.inOut' });
      gsap.to(m.color, { r: target.color.r, g: target.color.g, b: target.color.b, duration: 1.1 });
      gsap.to(m, { opacity: glassOpacityFor(key), duration: 1.1 });
      gsap.to(m, { envMapIntensity: tuning.glassEnv * target.envBoost, emissiveIntensity: target.emissive, duration: 1.1, ease: 'power2.inOut' });
    } else {
      m.roughness = target.roughness;
      m.color.copy(target.color);
      m.opacity = glassOpacityFor(key);
    }
  }

  function glassReflectionOpacityFor(_key: GlassKey): number {
    return 0;
  }

  function glassEdgeOpacityFor(key: GlassKey): number {
    const base = key === 'frosted' ? 0.08 : key === 'rain' ? 0.13 : 0.11;
    return clamp(base * (0.45 + solidity * 0.55), 0.03, 0.18);
  }

  function applyReflectionKey(m: THREE.MeshBasicMaterial, key: GlassKey, animate: boolean): void {
    const opacity = opts.cheapGlass ? glassReflectionOpacityFor(key) * 0.7 : glassReflectionOpacityFor(key);
    const color = key === 'clear' ? 0xffffff : key === 'rain' ? 0xdaf7ff : 0xe8f2f8;
    m.color.set(color);
    if (animate && !prefersReducedMotion()) {
      gsap.to(m, { opacity, duration: 1.1, ease: 'power2.out' });
    } else {
      m.opacity = opacity;
    }
    m.needsUpdate = true;
  }

  function applyEdgeKey(m: THREE.MeshBasicMaterial, key: GlassKey, animate: boolean): void {
    const opacity = opts.cheapGlass ? glassEdgeOpacityFor(key) * 0.75 : glassEdgeOpacityFor(key);
    const color = key === 'frosted' ? 0xd8f1ff : key === 'rain' ? 0xb8f5ff : 0xa7f4ff;
    m.color.set(color);
    if (animate && !prefersReducedMotion()) {
      gsap.to(m, { opacity, duration: 1.1, ease: 'power2.out' });
    } else {
      m.opacity = opacity;
    }
    m.needsUpdate = true;
  }

  function applyPanelGlassKey(p: PanelRuntime, key: GlassKey, animate: boolean): void {
    applyGlassKey(p.glassMat, key, animate);
    applyReflectionKey(p.reflectionMat, key, animate);
    applyEdgeKey(p.edgeGlowMat, key, animate);
  }

  function solidityOpacityScale(): number {
    return 0.35 + solidity * 0.65;
  }

  function glassOpacityFor(key: GlassKey): number {
    const base = baseOpacityFor(key);
    return key === 'clear' && !opts.cheapGlass ? base : base * solidityOpacityScale();
  }

  function baseOpacityFor(key: GlassKey): number {
    const base = key === 'frosted' ? 0.5 : key === 'rain' ? 0.34 : clearGlassDisplayOpacity;
    // Clear glass uses real transmission, so its blend opacity rides high
    // (the cheap, non-transmissive fallback stays faint). Frosted/rain keep
    // their privacy look via a capped mid opacity.
    const clearMax = opts.cheapGlass ? 0.18 : 1;
    return clamp(base * tuning.glassOpacityScale, 0.045, key === 'clear' ? clearMax : 0.82);
  }

  function makeArchedGeometry(w: number, hgt: number): THREE.ExtrudeGeometry {
    const archH = Math.min(0.3, w * 0.4);
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, hgt - archH);
    s.quadraticCurveTo(w / 2, hgt, 0, hgt);
    s.quadraticCurveTo(-w / 2, hgt, -w / 2, hgt - archH);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    geo.translate(0, 0, -T / 2);
    return geo;
  }

  function makeRoundedBox(w: number, h: number, d: number, radius = tuning.clipBevel): THREE.BufferGeometry {
    const r = clamp(radius, 0.001, Math.min(w, h, d) * 0.42);
    return new RoundedBoxGeometry(w, h, d, 4, r);
  }

  function scaledRoundedBox(w: number, h: number, d: number, scale: number, depthScale = 1): THREE.BufferGeometry {
    return makeRoundedBox(w * scale, h * scale, d * depthScale, tuning.clipBevel);
  }

  function applyMetalNow(): void {
    metalMat.color.set(currentFinish.color);
    metalMat.roughness = clamp(currentFinish.roughness * tuning.metalRoughnessScale, 0.035, 0.78);
    metalMat.envMapIntensity = tuning.metalEnv;
    metalMat.needsUpdate = true;
  }

  function addPatchClamp(pivot: THREE.Group, x: number, y: number, z = 0.032): void {
    const plate = trackHardware(new THREE.Mesh(scaledRoundedBox(0.062, 0.058, 0.034, tuning.clipScale, tuning.clipDepth), metalMat));
    plate.position.set(x, y, z * tuning.clipDepth);
    pivot.add(plate);

    const cap = trackHardware(new THREE.Mesh(scaledRoundedBox(0.038, 0.038, 0.04, tuning.clipScale * 0.92, tuning.clipDepth), metalMat));
    cap.position.set(x, y, -z * tuning.clipDepth);
    pivot.add(cap);
  }

  function addFloorClip(pivot: THREE.Group, x: number): void {
    const clip = trackHardware(new THREE.Mesh(scaledRoundedBox(0.072, 0.07, 0.042, tuning.clipScale, tuning.clipDepth), metalMat));
    clip.position.set(x, 0.035, 0.026 * tuning.clipDepth);
    pivot.add(clip);
  }

  // Frameless pivot hinge: a leaf clamping the door glass, a wall-side leaf, and
  // a turned pivot barrel with end caps between them — the real anatomy.
  function addDoorHinge(fixedHost: THREE.Group, pivot: THREE.Group, hy: number, w: number): void {
    const s = tuning.hingeScale;
    const edgeX = -w / 2;
    const leafW = 0.058 * s;
    const leafH = 0.136 * s;
    const leafD = 0.009 * tuning.clipDepth;
    const seam = 0.0008 * s;
    const frontZ = T * 0.62 + leafD * 0.55;

    const glassLeaf = trackHardware(new THREE.Mesh(makeRoundedBox(leafW, leafH, leafD, 0.0045 * s), metalMat));
    glassLeaf.position.set(edgeX + leafW / 2 + seam, hy, frontZ);
    pivot.add(glassLeaf);

    const wallLeaf = trackHardware(new THREE.Mesh(makeRoundedBox(leafW, leafH, leafD, 0.0045 * s), metalMat));
    wallLeaf.position.set(-(leafW / 2 + seam), hy, frontZ);
    fixedHost.add(wallLeaf);

    const knuckle = trackHardware(new THREE.Mesh(makeRoundedBox(0.009 * s, leafH * 0.92, leafD * 1.08, 0.003 * s), metalMat));
    knuckle.position.set(0, hy, frontZ + leafD * 0.25);
    fixedHost.add(knuckle);
  }

  function addPanel(spec: PanelSpec): PanelRuntime {
    const [x1, z1] = spec.from;
    const [x2, z2] = spec.to;
    const w = Math.hypot(x2 - x1, z2 - z1);
    const hgt = spec.height ?? GLASS_H;
    const baseY = spec.baseY ?? BASE_Y;
    const rotY = -Math.atan2(z2 - z1, x2 - x1);

    let geo: THREE.BufferGeometry;
    if (spec.arched) {
      geo = makeArchedGeometry(w, hgt);
    } else {
      geo = new THREE.BoxGeometry(w, hgt, T);
      geo.translate(0, hgt / 2, 0); // pivot at bottom edge
    }

    const glassMat = makeGlassMaterial();
    const glass = new THREE.Mesh(geo, glassMat);
    glass.renderOrder = 2;

    const reflectionMat = makeGlassReflectionMaterial();
    const reflectionGeo = new THREE.PlaneGeometry(w, hgt);
    reflectionGeo.translate(0, hgt / 2, T * 0.72);
    const reflection = new THREE.Mesh(reflectionGeo, reflectionMat);
    reflection.renderOrder = 4;

    const { group: edgeGlow, mat: edgeGlowMat } = makePolishedGlassEdges(w, hgt, !!spec.isDoor && !spec.sliding);

    const edgeMat = new THREE.LineBasicMaterial({ color: 0xe8fdff, transparent: true, opacity: 0.16 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
    edges.renderOrder = 5;

    const root = new THREE.Group();
    const pivot = new THREE.Group();
    let fixedHingeHost: THREE.Group | null = null;
    if (spec.isDoor && !spec.sliding) {
      root.position.set(x1, baseY, z1);
      pivot.position.set(w / 2, 0, 0);
      fixedHingeHost = new THREE.Group();
      fixedHingeHost.position.set(x1, baseY, z1);
      fixedHingeHost.rotation.y = spec.hingeRotY ?? rotY;
      assembly.add(fixedHingeHost);
    } else {
      root.position.set((x1 + x2) / 2, baseY, (z1 + z2) / 2);
    }
    root.rotation.y = rotY;
    root.add(pivot);
    pivot.add(glass, reflection, edgeGlow, edges);

    if (spec.isDoor) {
      const hingeHost = fixedHingeHost ?? root;
      for (const hy of [0.45, 1.5]) addDoorHinge(hingeHost, pivot, hy, w);
    } else if (!spec.baseY && !spec.sliding) {
      // Fixed panels: individual clips where glass meets wall/floor, rather
      // than continuous channels or full-height framing.
      const nearWall = (x: number, z: number) =>
        Math.abs(x - L) < 0.06 || Math.abs(z - L) < 0.06;
      for (const [end, sign] of [[spec.from, -1], [spec.to, 1]] as Array<[[number, number], number]>) {
        const localX = sign * (w / 2 - 0.035);
        if (nearWall(end[0], end[1])) {
          addPatchClamp(pivot, localX, Math.min(hgt - 0.22, 1.52));
          addPatchClamp(pivot, localX, Math.max(0.22, hgt * 0.28));
        }
        addFloorClip(pivot, localX);
      }
    }
    if (spec.hasHandle) {
      handleHost = new THREE.Group();
      handleHost.position.set(w / 2 - 0.09, 1.05, 0);
      pivot.add(handleHost);
    }

    assembly.add(root);
    return {
      root,
      pivot,
      glass,
      glassMat,
      reflection,
      reflectionMat,
      edgeGlow,
      edgeGlowMat,
      edges,
      edgeMat,
      rotY,
      w,
      h: hgt,
      isDoor: !!spec.isDoor,
      sliding: !!spec.sliding,
      hasHandle: !!spec.hasHandle,
    };
  }

  function disposeGroupGeometries(root: THREE.Object3D): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const trackedIndex = hardwareMeshes.indexOf(mesh);
      if (trackedIndex >= 0) hardwareMeshes.splice(trackedIndex, 1);
      const geometry = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      geometry?.dispose();
    });
  }

  function clearAccessories(): void {
    for (const groupRef of accessoryGroups) {
      groupRef.parent?.remove(groupRef);
      disposeGroupGeometries(groupRef);
    }
    accessoryGroups = [];
  }

  function disposeRuntime(p: PanelRuntime): void {
    p.glass.geometry.dispose();
    p.glassMat.dispose();
    p.reflection.geometry.dispose();
    p.reflectionMat.dispose();
    p.edgeGlow.traverse((object) => {
      const geometry = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      geometry?.dispose();
    });
    p.edgeGlowMat.dispose();
    p.edges.geometry.dispose();
    p.edgeMat.dispose();
    p.grid?.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
  }

  function disposePanels(): void {
    clearAccessories();
    for (const p of panels) disposeRuntime(p);
    for (const p of extraPanels) disposeRuntime(p);
    hardwareMeshes.forEach((mesh) => mesh.geometry.dispose());
    hardwareMeshes.length = 0;
    handleHost = null;
    doorOpen = false;
    assembly.clear();
    panels = [];
    extraPanels.length = 0;
  }

  function addSliderHardware(): void {
    const railY = BASE_Y + GLASS_H + tuning.railYOffset;
    const railZ = tuning.sliderDoorPanelZ + tuning.railProjection;
    const wheelRadius = 0.064 * tuning.rollerScale;
    const wheelDepth = 0.026 * tuning.clipDepth;
    const rail = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(tuning.railDiameter, tuning.railDiameter, tuning.railLength, 32), metalMat));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(tuning.railCenterX, railY, railZ);
    assembly.add(rail);

    for (const x of [tuning.railCenterX - tuning.railLength / 2, tuning.railCenterX + tuning.railLength / 2]) {
      const wallBracket = trackHardware(new THREE.Mesh(scaledRoundedBox(0.085, 0.085, 0.062, tuning.wallBracketScale, tuning.clipDepth), metalMat));
      wallBracket.position.set(x, railY, railZ - 0.014);
      assembly.add(wallBracket);
      const cap = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.043 * tuning.wallBracketScale, 0.043 * tuning.wallBracketScale, 0.018 * tuning.clipDepth, 26), metalMat));
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x, railY, railZ + 0.012);
      assembly.add(cap);
    }

    for (const x of [tuning.rollerStartX, tuning.rollerStartX + tuning.rollerSpread]) {
      const hanger = trackHardware(new THREE.Mesh(scaledRoundedBox(0.04, 0.18, 0.03, tuning.hangerScale, tuning.clipDepth), metalMat));
      hanger.position.set(x, railY - tuning.hangerDrop, railZ + tuning.hangerProjection);
      assembly.add(hanger);

      const bracket = trackHardware(new THREE.Mesh(scaledRoundedBox(0.11, 0.038, 0.035, tuning.hangerScale, tuning.clipDepth), metalMat));
      bracket.position.set(x, railY - tuning.hangerDrop * 0.28, railZ + tuning.hangerProjection);
      assembly.add(bracket);

      const wheel = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelDepth, 40), metalMat));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, railY + tuning.rollerYOffset, railZ + tuning.rollerProjection);
      assembly.add(wheel);

      const axle = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.01 * tuning.hangerScale, 0.01 * tuning.hangerScale, 0.067 * tuning.clipDepth, 14), metalMat));
      axle.rotation.x = Math.PI / 2;
      axle.position.set(x, railY, railZ + tuning.rollerProjection + 0.002);
      assembly.add(axle);

      const rim = trackHardware(new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 1.03, 0.006 * tuning.rollerScale, 12, 40), metalMat));
      rim.position.set(x, railY + tuning.rollerYOffset, railZ + tuning.rollerProjection + 0.014);
      assembly.add(rim);
    }

    const floorGuide = trackHardware(new THREE.Mesh(scaledRoundedBox(0.095, 0.055, 0.05, tuning.floorGuideScale, tuning.clipDepth), metalMat));
    floorGuide.position.set(tuning.floorGuideX, BASE_Y + 0.028, tuning.sliderDoorPanelZ + tuning.floorGuideProjection);
    assembly.add(floorGuide);
  }

  function tuneSliderPanel(spec: PanelSpec, index: number): PanelSpec {
    if (currentKey !== 'slider') return spec;
    if (index === 0) {
      return {
        ...spec,
        from: [L, tuning.sliderFixedPanelZ],
        to: [tuning.sliderFixedEndX, tuning.sliderFixedPanelZ],
      };
    }
    return {
      ...spec,
      from: [tuning.sliderDoorStartX, tuning.sliderDoorPanelZ],
      to: [tuning.sliderDoorEndX, tuning.sliderDoorPanelZ],
    };
  }

  function buildEnclosure(key: EnclosureKey, animate: boolean): void {
    currentKey = key;
    disposePanels();
    const layout = LAYOUTS[key];
    rightWall.visible = !!layout.alcoveRightWall;
    stallJambGroup.visible = false;
    layout.panels.forEach((spec, i) => panels.push(addPanel(tuneSliderPanel(spec, i))));

    if (layout.headerBar) addSliderHardware();

    // Materialize: each panel's edges rise from the floor while the pane
    // swings into its structural angle, then the glass glazes in with a
    // bright reflective shimmer that settles. Hardware pops on last.
    if (animate && !prefersReducedMotion()) {
      panels.forEach((p, i) => {
        const finalOpacity = glassOpacityFor(glassKey);
        applyPanelGlassKey(p, glassKey, false);
        const finalEnv = p.glassMat.envMapIntensity;
        p.glassMat.opacity = 0;
        p.reflectionMat.opacity = 0;
        p.edgeGlowMat.opacity = 0;
        const d = i * 0.16;
        gsap.fromTo(p.root.scale, { y: 0.001 }, { y: 1, duration: 0.7, ease: 'power3.out', delay: d });
        gsap.fromTo(p.root.rotation, { y: p.rotY + 0.5 }, { y: p.rotY, duration: 0.95, ease: 'power3.out', delay: d });
        gsap.fromTo(p.edgeMat, { opacity: 0 }, { opacity: edgeOpacity(), duration: 0.45, delay: d });
        gsap.to(p.glassMat, { opacity: finalOpacity, duration: 0.9, delay: d + 0.35, ease: 'power2.out' });
        gsap.to(p.reflectionMat, { opacity: glassReflectionOpacityFor(glassKey), duration: 1.0, delay: d + 0.42, ease: 'power2.out' });
        gsap.to(p.edgeGlowMat, { opacity: glassEdgeOpacityFor(glassKey), duration: 0.95, delay: d + 0.46, ease: 'power2.out' });
        gsap.fromTo(p.glassMat, { envMapIntensity: Math.max(3.4, finalEnv + 0.8) }, { envMapIntensity: finalEnv, duration: 1.5, ease: 'power2.out', delay: d + 0.35 });
      });
      const hwDelay = panels.length * 0.16 + 0.45;
      hardwareMeshes.forEach((hm, i) => {
        gsap.fromTo(hm.scale, { x: 0.01, y: 0.01, z: 0.01 },
          { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.4)', delay: hwDelay + i * 0.08 });
      });
      buildHandle(handleKey, true, hwDelay + 0.15);
      buildAccessories(true, hwDelay + 0.25);
    } else {
      buildHandle(handleKey, false);
      buildAccessories(false);
      panels.forEach((p) => applyPanelGlassKey(p, glassKey, false));
      applySolidityNow();
    }

    // Upgrades survive an enclosure change — but only where they still apply
    syncExtras(animate);
  }

  /* ---- Upgrades: grid muntins + steam transom package ---- */

  function clearGrids(): void {
    for (const p of allGlass()) {
      if (p.grid) {
        p.pivot.remove(p.grid);
        p.grid.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
        p.grid = undefined;
      }
    }
  }

  function applyGrid(animate: boolean): void {
    for (const p of allGlass()) {
      if (p.grid || p.w <= 0.2) continue; // skip narrow slivers
      const grid = new THREE.Group();
      const depth = 0.006;
      const border = 0.014;
      const bar = 0.01;
      const gridZ = 0.004;
      const isTransom = extraPanels.includes(p) || p.h < 0.7;
      const addHorizontal = (y: number, thick = bar, inset = 0): void => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.04, p.w - inset * 2), thick, depth), gridMat);
        mesh.position.set(0, y, gridZ);
        mesh.renderOrder = 1;
        grid.add(mesh);
      };
      const addVertical = (x: number, thick = bar, inset = 0): void => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, Math.max(0.04, p.h - inset * 2), depth), gridMat);
        mesh.position.set(x, p.h / 2, gridZ);
        mesh.renderOrder = 1;
        grid.add(mesh);
      };

      // Every panel gets a real edge frame on all four sides.
      addHorizontal(border, border);
      addHorizontal(p.h - border, border);
      addVertical(-p.w / 2 + border / 2, border);
      addVertical(p.w / 2 - border / 2, border);

      const cols = Math.max(1, Math.min(4, Math.round(p.w / (isTransom ? 0.32 : 0.42))));
      for (let i = 1; i < cols; i++) {
        addVertical(-p.w / 2 + (p.w * i) / cols, bar, border * 1.4);
      }

      if (!isTransom) {
        const rows = Math.max(2, Math.min(5, Math.round(p.h / 0.48)));
        for (let i = 1; i < rows; i++) {
          addHorizontal((p.h * i) / rows, bar, border * 1.4);
        }
      }

      p.grid = grid;
      p.pivot.add(grid);
      if (animate && !prefersReducedMotion()) {
        gsap.fromTo(grid.scale, { x: 0.01, z: 0.01 }, { x: 1, z: 1, duration: 0.7, ease: 'back.out(1.8)' });
      }
    }
  }

  function clearSteam(): void {
    for (const p of extraPanels) {
      disposeRuntime(p);
      assembly.remove(p.root);
    }
    extraPanels.length = 0;
  }

  function applySteam(animate: boolean): void {
    if (extraPanels.length) return;
    const layout = LAYOUTS[currentKey];
    const savedHandleHost = handleHost; // addPanel must not steal the door's handle anchor
    for (const spec of layout.panels) {
      if (spec.baseY) continue; // transoms only over floor-standing panels
      const basePanelH = spec.height ?? GLASS_H;
      const transomGap = 0.02;
      const transomH = Math.max(0.18, WALL_H - basePanelH - transomGap);
      const transom = addPanel({
        from: spec.from,
        to: spec.to,
        baseY: BASE_Y + basePanelH + transomGap,
        height: transomH,
      });
      applyPanelGlassKey(transom, glassKey, false);
      transom.edgeMat.opacity = edgeOpacity();
      transom.glassMat.opacity = glassOpacityFor(glassKey);
      transom.reflectionMat.opacity = glassReflectionOpacityFor(glassKey);
      transom.edgeGlowMat.opacity = glassEdgeOpacityFor(glassKey);
      extraPanels.push(transom);
      if (animate && !prefersReducedMotion()) {
        const target = transom.glassMat.opacity;
        transom.glassMat.opacity = 0;
        gsap.fromTo(transom.root.scale, { y: 0.001 }, { y: 1, duration: 0.6, ease: 'power3.out' });
        gsap.to(transom.glassMat, { opacity: target, duration: 0.8, delay: 0.25 });
      }
    }
    handleHost = savedHandleHost;
  }

  function syncExtras(animate: boolean): void {
    const compat = extrasCompat(currentLabel);
    if (gridOn && compat.grid) applyGrid(animate); else clearGrids();
    // A steam-type enclosure already carries its transom — don't double it
    if (steamOn && compat.steam && currentKey !== 'steam') applySteam(animate); else clearSteam();
    if (gridOn && compat.grid) applyGrid(animate);
  }

  /* ---- Handles ---- */

  /* A solid metal bar with rounded ends (capsule). `length` is end-to-end. */
  function metalBar(length: number, radius: number): THREE.Mesh {
    const cyl = Math.max(0.001, length - radius * 2);
    return trackHardware(new THREE.Mesh(new THREE.CapsuleGeometry(radius, cyl, 6, 24), metalMat));
  }

  /* A machined escutcheon collar (slightly tapered disc) facing along +/-z. */
  function mountCollar(x: number, y: number, z: number, radius: number, thick = 0.014): THREE.Mesh {
    const outer = z >= 0 ? radius : radius * 1.05; // inside collar a touch larger
    const collar = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, outer, thick, 28), metalMat));
    collar.rotation.x = Math.PI / 2;
    collar.position.set(x, y, z);
    return collar;
  }

  // Through-glass mount: a clean bolt with a tapered escutcheon collar on each
  // face of the glass — the building block for towel bars, robe hooks, combos.
  function addThroughGlassPost(groupRef: THREE.Group, x: number, y: number, radius = 0.011): void {
    const post = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.14, 20), metalMat));
    post.rotation.x = Math.PI / 2;
    post.position.set(x, y, 0);
    groupRef.add(
      post,
      mountCollar(x, y, 0.062, radius * 2.0),
      mountCollar(x, y, -0.062, radius * 2.0),
    );
  }

  // Tubular pull: a rounded-end grab bar standing off the glass on two posts,
  // each capped by an escutcheon outside and a hex nut inside.
  function addOutsideVerticalPull(groupRef: THREE.Group, height = 0.46): void {
    const radius = 0.0135;
    const standZ = 0.085;            // bar centre offset from the glass
    const top = height / 2 - 0.05;
    const bottom = -height / 2 + 0.05;

    const bar = metalBar(height, radius);
    bar.position.z = standZ;
    groupRef.add(bar);

    for (const y of [top, bottom]) {
      const escut = mountCollar(0, y, 0.012, radius * 1.7, 0.02);
      const standoff = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, standZ - 0.012, 20), metalMat));
      standoff.rotation.x = Math.PI / 2;
      standoff.position.set(0, y, standZ / 2);
      const nut = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.25, radius * 1.25, 0.014, 6), metalMat));
      nut.rotation.x = Math.PI / 2;
      nut.position.set(0, y, -0.014);
      groupRef.add(escut, standoff, nut);
    }
  }

  // A horizontal towel bar on the inside face: a rounded-end rail on two
  // standoff posts. Reused by both the combo handle and the accessory rail.
  function addTowelBar(groupRef: THREE.Group, y: number, railW: number, centerX = 0, faceZ = -0.082): void {
    const r = 0.012;
    const bar = metalBar(railW + r * 2, r);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(centerX, y, faceZ);
    groupRef.add(bar);
    for (const x of [centerX - railW / 2, centerX + railW / 2]) {
      addThroughGlassPost(groupRef, x, y, 0.01);
      const standoff = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, Math.abs(faceZ) - 0.012, 18), metalMat));
      standoff.rotation.x = Math.PI / 2;
      standoff.position.set(x, y, faceZ / 2);
      groupRef.add(standoff);
    }
  }

  // Towel-bar / pull combo (the classic CRL style): a straight vertical grab
  // pull on the OUTSIDE plus a straight horizontal towel bar on the INSIDE,
  // both rounded-end bars held off the glass by through-glass mounts. Two clean
  // separate bars — no seamless weave. Width scales to the door (neo etc.).
  function addTowelHandleCombo(groupRef: THREE.Group, doorW: number): void {
    const railW = clamp(doorW - 0.24, 0.22, 0.5);
    const latchX = 0, farX = -railW;
    const topY = 0.17, botY = -0.17;
    const pullTop = 0.235, pullBot = -0.235;
    const outZ = 0.078, inZ = -0.078;
    const r = 0.0125;

    const pull = metalBar(pullTop - pullBot, r);
    pull.position.set(latchX, (pullTop + pullBot) / 2, outZ);
    groupRef.add(pull);

    const towel = metalBar(railW, r * 0.92);
    towel.rotation.z = Math.PI / 2;
    towel.position.set((latchX + farX) / 2, topY, inZ);
    groupRef.add(towel);

    // Each mount is FLUSH on both faces (thin escutcheon discs) with the bolt
    // hidden inside the glass — a standoff only reaches out to the bar on the
    // side that actually uses it. So the pull's unused inside end and the towel
    // bar's unused outside end sit flush against the glass (no protrusion).
    const mount = (x: number, y: number): void => {
      groupRef.add(mountCollar(x, y, 0.009, 0.02, 0.012));
      groupRef.add(mountCollar(x, y, -0.009, 0.02, 0.012));
      const bolt = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 16), metalMat));
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(x, y, 0);
      groupRef.add(bolt);
    };
    const link = (x: number, y: number, z: number): void => {
      const s = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, Math.abs(z) - 0.012, 18), metalMat));
      s.rotation.x = Math.PI / 2;
      s.position.set(x, y, z / 2);
      groupRef.add(s);
    };
    mount(latchX, topY); mount(latchX, botY); mount(farX, topY);
    link(latchX, topY, outZ); link(latchX, botY, outZ);  // outside pull
    link(latchX, topY, inZ); link(farX, topY, inZ);       // inside towel bar
  }

  // Compact through-glass robe hook: thin flush backplate (nothing protrudes on
  // the inside), with a small UPWARD-curving hook arm and a ball finial.
  function addRobeHook(groupRef: THREE.Group, x: number, y: number): void {
    const plate = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.012, 28), metalMat));
    plate.rotation.x = Math.PI / 2;
    plate.position.set(x, y, 0.006);
    // Flush interior cap — sits against the back of the glass, no protrusion.
    const backCap = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.005, 24), metalMat));
    backCap.rotation.x = Math.PI / 2;
    backCap.position.set(x, y, -0.0025);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y, 0.015),
      new THREE.Vector3(x, y - 0.004, 0.04),
      new THREE.Vector3(x, y + 0.008, 0.052),  // curl upward
      new THREE.Vector3(x, y + 0.024, 0.045),
    ]);
    const hook = trackHardware(new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.0065, 14, false), metalMat));
    const finial = trackHardware(new THREE.Mesh(new THREE.SphereGeometry(0.0088, 16, 12), metalMat));
    finial.position.set(x, y + 0.024, 0.045);
    groupRef.add(plate, backCap, hook, finial);
  }

  function registerAccessory(panel: PanelRuntime, groupRef: THREE.Group): void {
    panel.pivot.add(groupRef);
    accessoryGroups.push(groupRef);
  }

  function chooseFixedPanel(preferFront = false): PanelRuntime | null {
    const candidates = panels.filter((p) => !p.isDoor && !p.sliding && p.h > 1.15 && p.w > 0.36);
    if (!candidates.length) return null;
    const front = candidates
      .filter((p) => Math.abs(p.root.position.z - F) < 0.08)
      .sort((a, b) => b.w - a.w)[0];
    if (preferFront && front) return front;
    return candidates.sort((a, b) => b.w - a.w)[0];
  }

  function chooseAccessoryPanel(): PanelRuntime | null {
    return chooseFixedPanel(true)
      || panels.find((p) => !p.sliding && p.h > 1.15 && p.w > 0.36)
      || null;
  }

  function addTowelRailToPanel(panel: PanelRuntime): void {
    const groupRef = new THREE.Group();
    const railW = clamp(panel.w - 0.22, 0.34, 0.62);
    const y = clamp(1.08, 0.75, panel.h - 0.32);
    addTowelBar(groupRef, y, railW);
    registerAccessory(panel, groupRef);
  }

  function addRobeHookToPanel(panel: PanelRuntime): void {
    const groupRef = new THREE.Group();
    const edgeClearance = clamp(panel.w * 0.3, 0.13, 0.25);
    const x = panel.w > 0.55 ? panel.w / 2 - edgeClearance : 0;
    const y = clamp(panel.h - 0.48, 1.35, panel.h - 0.22);
    addRobeHook(groupRef, x, y);
    registerAccessory(panel, groupRef);
  }

  function buildAccessories(animate: boolean, delay = 0): void {
    clearAccessories();
    const v = accessoriesLabel.toLowerCase();
    if (!v || /^(n\/a|none|none, thanks)$/i.test(v.trim())) return;
    const fixedPanel = chooseAccessoryPanel();
    const firstIndex = accessoryGroups.length;
    if (v.includes('towel') && handleKey !== 'towel' && fixedPanel) addTowelRailToPanel(fixedPanel);
    if ((v.includes('robe') || v.includes('hook')) && fixedPanel) addRobeHookToPanel(fixedPanel);
    const added = accessoryGroups.slice(firstIndex);
    if (animate && !prefersReducedMotion()) {
      added.forEach((groupRef, i) => {
        gsap.fromTo(groupRef.scale, { x: 0.01, y: 0.01, z: 0.01 }, {
          x: 1,
          y: 1,
          z: 1,
          duration: 0.55,
          ease: 'back.out(2)',
          delay: delay + i * 0.06,
        });
      });
    }
  }

  function setDoorOpen(open: boolean, animate: boolean): void {
    const doors = panels.filter((p) => p.isDoor && !p.sliding);
    if (!doors.length) return;
    doorOpen = open;
    doors.forEach((door, i) => {
      const y = door.rotY + (open ? -Math.PI * 0.48 : 0);
      if (animate && !prefersReducedMotion()) {
        gsap.to(door.root.rotation, {
          y,
          duration: 0.72,
          ease: open ? 'power3.out' : 'power2.inOut',
          delay: i * 0.04,
          overwrite: 'auto',
        });
      } else {
        door.root.rotation.y = y;
      }
    });
  }

  function toggleDoorFromRay(raycaster: THREE.Raycaster): boolean {
    const doors = panels.filter((p) => p.isDoor && !p.sliding);
    if (!doors.length) return false;
    const hits = raycaster.intersectObjects(doors.map((p) => p.root), true);
    if (!hits.length) return false;
    setDoorOpen(!doorOpen, true);
    return true;
  }

  function buildHandle(key: HandleKey, animate: boolean, delay = 0): void {
    if (!handleHost) return;
    disposeGroupGeometries(handleHost);
    handleHost.clear();
    const grp = new THREE.Group();

    // Escutcheon + standoff post that mounts a bar to the glass at (x,y),
    // standing off to depth z. Works for either face (sign of z).
    const addMount = (x: number, y: number, z: number, postR = 0.008): void => {
      const s = z >= 0 ? 1 : -1;
      grp.add(mountCollar(x, y, s * 0.012, 0.02, 0.018));
      const post = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, Math.abs(z) - 0.012, 18), metalMat));
      post.rotation.x = Math.PI / 2;
      post.position.set(x, y, z / 2);
      grp.add(post);
    };

    if (key === 'pull') {
      addOutsideVerticalPull(grp);
    } else if (key === 'ladder') {
      // A back-to-back ladder/T-bar pull: a matching grab bar on BOTH faces of
      // the door, feet inset from the rounded ends, sharing through-mounts.
      const H = 0.64;
      const standZ = 0.078;
      for (const s of [1, -1]) {
        const bar = metalBar(H, 0.012);
        bar.position.z = standZ * s;
        grp.add(bar);
        addMount(0, H / 2 - 0.085, standZ * s);
        addMount(0, -H / 2 + 0.085, standZ * s);
      }
    } else if (key === 'u-handle') {
      // Back-to-back rounded-corner D-handle: a matching grip on BOTH faces of
      // the glass, through-bolted, with an escutcheon washer on each face.
      const Lg = 0.2, sz = 0.058, r = 0.012, e = 0.042;
      const half = Lg / 2;
      const buildU = (s: number): void => {
        const pts = [
          new THREE.Vector3(0, half + e, -0.02 * s),
          new THREE.Vector3(0, half + e * 0.45, sz * 0.55 * s),
          new THREE.Vector3(0, half, sz * s),
          new THREE.Vector3(0, -half, sz * s),
          new THREE.Vector3(0, -half - e * 0.45, sz * 0.55 * s),
          new THREE.Vector3(0, -(half + e), -0.02 * s),
        ];
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        grp.add(trackHardware(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 18, false), metalMat)));
      };
      buildU(1);
      buildU(-1);
      const my = half + e * 0.7; // where each leg passes through the glass
      for (const y of [my, -my]) {
        grp.add(mountCollar(0, y, 0.012, r * 1.7, 0.014));  // outside washer
        grp.add(mountCollar(0, y, -0.012, r * 1.7, 0.014)); // inside washer
      }
    } else if (key === 'towel') {
      addTowelHandleCombo(grp, panels.find((p) => p.hasHandle)?.w ?? 0.7);
    } else { // knob — turned backplate, standoff, and a rounded mushroom knob
      grp.add(mountCollar(0, 0, 0.012, 0.026, 0.016));
      const stem = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.045, 18), metalMat));
      stem.rotation.x = Math.PI / 2;
      stem.position.z = 0.034;
      const knob = trackHardware(new THREE.Mesh(new THREE.SphereGeometry(0.026, 28, 20), metalMat));
      knob.scale.set(1, 1, 0.78);
      knob.position.z = 0.07;
      grp.add(stem, knob);
    }

    handleHost.add(grp);
    if (animate && !prefersReducedMotion()) {
      gsap.fromTo(grp.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(2.2)', delay });
    }
  }

  /* ---- Water spray + steam (shower-in-use mood) ---- */

  const fxGroup = new THREE.Group();
  fxGroup.visible = false;
  group.add(fxGroup);

  const HEAD = new THREE.Vector3(-0.35, BASE_Y + 1.9, -0.44);
  const DROPS = 240;
  const dropPos = new Float32Array(DROPS * 3);
  const dropSeed = new Float32Array(DROPS * 2); // angle, radius factor
  function resetDrop(i: number, randomY: boolean): void {
    const a = Math.random() * Math.PI * 2;
    const rf = Math.random();
    dropSeed[i * 2] = a;
    dropSeed[i * 2 + 1] = rf;
    const y = randomY ? BASE_Y + 0.15 + Math.random() * (HEAD.y - BASE_Y - 0.2) : HEAD.y;
    const spread = ((HEAD.y - y) / (HEAD.y - BASE_Y)) * 0.34 * rf + 0.02;
    dropPos[i * 3] = HEAD.x + Math.cos(a) * spread;
    dropPos[i * 3 + 1] = y;
    dropPos[i * 3 + 2] = HEAD.z + Math.sin(a) * spread;
  }
  for (let i = 0; i < DROPS; i++) resetDrop(i, true);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = new THREE.PointsMaterial({
    color: 0xcfe9ff, size: 0.022, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  fxGroup.add(new THREE.Points(dropGeo, dropMat));

  const steamTex = makeSteamTexture();
  const steamSprites: Array<{ sprite: THREE.Sprite; phase: number; x: number; z: number; core: boolean }> = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.SpriteMaterial({
      map: steamTex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const x = -0.56 + Math.random() * 0.98;
    const z = -0.68 + Math.random() * 0.82;
    sprite.position.set(x, BASE_Y + 0.5, z);
    steamSprites.push({ sprite, phase: i / 14, x, z, core: i < 7 });
    fxGroup.add(sprite);
  }

  function steamVisualIntensity(): number {
    return currentKey === 'steam' || steamOn ? 1 : 0;
  }

  function updateFx(dt: number, t: number): void {
    for (let i = 0; i < DROPS; i++) {
      dropPos[i * 3 + 1] -= (2.3 + dropSeed[i * 2 + 1] * 0.9) * dt;
      const y = dropPos[i * 3 + 1];
      if (y < BASE_Y + 0.12) { resetDrop(i, false); continue; }
      // widen the cone as the drop falls
      const a = dropSeed[i * 2];
      const spread = ((HEAD.y - y) / (HEAD.y - BASE_Y)) * 0.34 * dropSeed[i * 2 + 1] + 0.02;
      dropPos[i * 3] = HEAD.x + Math.cos(a) * spread;
      dropPos[i * 3 + 2] = HEAD.z + Math.sin(a) * spread;
    }
    dropGeo.attributes.position.needsUpdate = true;

    const steamBoost = steamVisualIntensity();
    for (const s of steamSprites) {
      const p = (t * 0.09 + s.phase) % 1;
      s.sprite.position.set(
        s.x + Math.sin(t * 0.5 + s.phase * 9) * (0.08 + steamBoost * 0.06),
        BASE_Y + 0.45 + p * 1.7,
        s.z,
      );
      const fade = Math.sin(Math.PI * p);
      const baseOpacity = s.core ? 0.13 : 0.04;
      const boostedOpacity = s.core ? 0.3 : 0.2;
      (s.sprite.material as THREE.SpriteMaterial).opacity = fade * (baseOpacity + steamBoost * boostedOpacity);
      const sc = 0.42 + p * (1.05 + steamBoost * 0.8);
      s.sprite.scale.set(sc, sc, 1);
    }
  }

  /* ---- Solidity ---- */

  function edgeOpacity(): number {
    return 0.72 - solidity * 0.36;
  }

  function applySolidityNow(): void {
    for (const p of allGlass()) {
      p.edgeMat.opacity = edgeOpacity();
      p.glassMat.opacity = glassOpacityFor(glassKey);
      p.reflectionMat.opacity = glassReflectionOpacityFor(glassKey);
      p.edgeGlowMat.opacity = glassEdgeOpacityFor(glassKey);
    }
    ringMat.opacity = 0.4 + solidity * 0.3;
  }

  function normalizeTuning(next: Partial<ShowerModelTuning>): ShowerModelTuning {
    return {
      clipScale: clamp(next.clipScale ?? tuning.clipScale, 0.35, 1.5),
      clipDepth: clamp(next.clipDepth ?? tuning.clipDepth, 0.25, 1.35),
      clipBevel: clamp(next.clipBevel ?? tuning.clipBevel, 0.001, 0.025),
      hingeScale: clamp(next.hingeScale ?? tuning.hingeScale, 0.35, 1.5),
      sliderFixedPanelZ: clamp(next.sliderFixedPanelZ ?? tuning.sliderFixedPanelZ, 0.56, 0.82),
      sliderDoorPanelZ: clamp(next.sliderDoorPanelZ ?? tuning.sliderDoorPanelZ, 0.58, 0.88),
      sliderFixedEndX: clamp(next.sliderFixedEndX ?? tuning.sliderFixedEndX, -0.25, 0.35),
      sliderDoorStartX: clamp(next.sliderDoorStartX ?? tuning.sliderDoorStartX, -0.3, 0.2),
      sliderDoorEndX: clamp(next.sliderDoorEndX ?? tuning.sliderDoorEndX, 0.38, 0.82),
      railCenterX: clamp(next.railCenterX ?? tuning.railCenterX, -0.2, 0.2),
      railLength: clamp(next.railLength ?? tuning.railLength, 1.1, 1.8),
      railDiameter: clamp(next.railDiameter ?? tuning.railDiameter, 0.012, 0.06),
      railYOffset: clamp(next.railYOffset ?? tuning.railYOffset, -0.18, 0.08),
      railProjection: clamp(next.railProjection ?? tuning.railProjection, 0.02, 0.24),
      wallBracketScale: clamp(next.wallBracketScale ?? tuning.wallBracketScale, 0.35, 1.4),
      hangerScale: clamp(next.hangerScale ?? tuning.hangerScale, 0.35, 1.4),
      hangerDrop: clamp(next.hangerDrop ?? tuning.hangerDrop, 0.045, 0.22),
      hangerProjection: clamp(next.hangerProjection ?? tuning.hangerProjection, -0.04, 0.12),
      rollerStartX: clamp(next.rollerStartX ?? tuning.rollerStartX, -0.1, 0.28),
      rollerScale: clamp(next.rollerScale ?? tuning.rollerScale, 0.45, 1.45),
      rollerSpread: clamp(next.rollerSpread ?? tuning.rollerSpread, 0.22, 0.62),
      rollerProjection: clamp(next.rollerProjection ?? tuning.rollerProjection, -0.02, 0.14),
      rollerYOffset: clamp(next.rollerYOffset ?? tuning.rollerYOffset, -0.035, 0.04),
      floorGuideScale: clamp(next.floorGuideScale ?? tuning.floorGuideScale, 0.35, 1.4),
      floorGuideX: clamp(next.floorGuideX ?? tuning.floorGuideX, -0.1, 0.42),
      floorGuideProjection: clamp(next.floorGuideProjection ?? tuning.floorGuideProjection, -0.06, 0.08),
      metalRoughnessScale: clamp(next.metalRoughnessScale ?? tuning.metalRoughnessScale, 0.25, 2.2),
      metalEnv: clamp(next.metalEnv ?? tuning.metalEnv, 0.3, 3.4),
      glassOpacityScale: clamp(next.glassOpacityScale ?? tuning.glassOpacityScale, 0.35, 1.6),
      glassEnv: clamp(next.glassEnv ?? tuning.glassEnv, 0.5, 4.0),
    };
  }

  function savedTuningForLabel(label: string): Partial<ShowerModelTuning> | null {
    const key = enclosureKeyFor(label);
    const match = [...readSavedShowerDesigns()]
      .reverse()
      .find((design) => enclosureKeyFor(design.enclosure) === key);
    return match?.tuning || null;
  }

  function applySavedTuningForLabel(label: string): void {
    const saved = savedTuningForLabel(label);
    if (!saved) return;
    tuning = normalizeTuning(saved);
    applyMetalNow();
  }

  /* ---- Public API ---- */

  applySavedTuningForLabel('90 Corner');
  buildEnclosure('corner90', false); // slick two-pane corner as the opening hologram

  return {
    group,

    setEnclosure(label: string): void {
      currentLabel = label;
      applySavedTuningForLabel(label);
      buildEnclosure(enclosureKeyFor(label), true);
    },

    setGlass(label: string): void {
      glassKey = glassKeyFor(label);
      for (const p of allGlass()) applyPanelGlassKey(p, glassKey, true);
    },

    setHardware(label: string): void {
      currentFinish = finishFor(label);
      const c = new THREE.Color(currentFinish.color);
      const roughness = clamp(currentFinish.roughness * tuning.metalRoughnessScale, 0.035, 0.78);
      if (prefersReducedMotion()) {
        metalMat.color.copy(c);
        metalMat.roughness = roughness;
        metalMat.envMapIntensity = tuning.metalEnv;
      } else {
        gsap.to(metalMat.color, { r: c.r, g: c.g, b: c.b, duration: 0.9, ease: 'power2.inOut' });
        gsap.to(metalMat, { roughness, envMapIntensity: tuning.metalEnv, duration: 0.9 });
      }
    },

    setHandle(label: string): void {
      handleKey = handleKeyFor(label);
      buildHandle(handleKey, true);
      buildAccessories(true, 0.08);
    },

    setAccessories(label: string): void {
      accessoriesLabel = /^(n\/a|none)$/i.test((label || '').trim()) ? '' : label;
      buildAccessories(true);
    },

    setModelTuning(settings: Partial<ShowerModelTuning>): void {
      tuning = normalizeTuning(settings);
      applyMetalNow();
      buildEnclosure(currentKey, false);
      for (const p of allGlass()) applyPanelGlassKey(p, glassKey, false);
      applySolidityNow();
    },

    getModelTuning(): ShowerModelTuning {
      return { ...tuning };
    },

    setExtras(label: string): void {
      const v = (label || '').toLowerCase();
      gridOn = v.includes('grid') || v.includes('both');
      steamOn = v.includes('steam') || v.includes('both');
      syncExtras(true);
    },

    setSolidity(t: number): void {
      const target = Math.max(0, Math.min(1, t));
      if (prefersReducedMotion()) { solidity = target; applySolidityNow(); return; }
      gsap.to({ s: solidity }, {
        s: target,
        duration: 1.2,
        ease: 'power2.inOut',
        onUpdate: function (this: gsap.core.Tween) {
          solidity = (this.targets()[0] as { s: number }).s;
          applySolidityNow();
        },
      });
    },

    pulse(): void {
      if (prefersReducedMotion()) return;
      gsap.fromTo(ringMat, { opacity: 1 }, { opacity: 0.4 + solidity * 0.3, duration: 1.0, ease: 'power2.out', overwrite: 'auto' });
      gsap.fromTo(ring.scale, { x: 1.07, y: 1.07 }, { x: 1, y: 1, duration: 0.8, ease: 'power3.out', overwrite: 'auto' });
    },

    setWater(on: boolean): void {
      if (prefersReducedMotion()) { fxGroup.visible = false; return; }
      fxGroup.visible = on;
    },

    tryToggleDoor(raycaster: THREE.Raycaster): boolean {
      return toggleDoorFromRay(raycaster);
    },

    idle(dt: number): void {
      elapsed += dt;
      group.rotation.y = Math.sin(elapsed * 0.1) * 0.06;
      ring.rotation.z = elapsed * 0.05;
      if (fxGroup.visible) updateFx(dt, elapsed);
    },

    dispose(): void {
      disposePanels();
      pedestal.geometry.dispose(); pedestalMat.dispose();
      ring.geometry.dispose(); ringMat.dispose();
      backWall.geometry.dispose(); leftWall.geometry.dispose(); rightWall.geometry.dispose();
      stallJambGroup.children.forEach((child) => (child as THREE.Mesh).geometry?.dispose?.());
      tileMat.dispose(); shellMat.dispose();
      floor.geometry.dispose(); floorMat.dispose();
      metalMat.dispose(); gridMat.dispose();
      dropGeo.dispose(); dropMat.dispose(); steamTex.dispose();
      rainTex.dispose(); glassSheenTex.dispose(); tileTex.dispose();
    },
  };
}
