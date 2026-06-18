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
  railDiameter: number;
  railYOffset: number;
  railProjection: number;
  rollerScale: number;
  rollerSpread: number;
  metalRoughnessScale: number;
  metalEnv: number;
  glassOpacityScale: number;
  glassEnv: number;
}

export const DEFAULT_SHOWER_TUNING: ShowerModelTuning = {
  clipScale: 0.72,
  clipDepth: 0.56,
  clipBevel: 0.008,
  hingeScale: 0.78,
  railDiameter: 0.026,
  railYOffset: -0.08,
  railProjection: 0.115,
  rollerScale: 0.82,
  rollerSpread: 0.43,
  metalRoughnessScale: 0.72,
  metalEnv: 1.65,
  glassOpacityScale: 0.9,
  glassEnv: 2.3,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface ShowerRig {
  group: THREE.Group;
  setEnclosure(label: string): void;
  setGlass(label: string): void;
  setHardware(label: string): void;
  setHandle(label: string): void;
  setModelTuning(settings: Partial<ShowerModelTuning>): void;
  getModelTuning(): ShowerModelTuning;
  /** Apply upgrades: grid muntin bars and/or the steam transom package. */
  setExtras(label: string): void;
  setSolidity(t: number): void;
  /** Celebratory ring flash when a selection locks in. */
  pulse(): void;
  /** Shower-in-use mood: falling water spray + rising steam. */
  setWater(on: boolean): void;
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

type HandleKey = 'pull' | 'ladder' | 'u-handle' | 'knob';

function handleKeyFor(label: string): HandleKey {
  const v = label.toLowerCase();
  if (v.includes('ladder')) return 'ladder';
  if (v.includes('u-') || v.includes('u ')) return 'u-handle';
  if (v.includes('knob')) return 'knob';
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
    { from: [-0.17, 0.26], to: [0.26, -0.17], isDoor: true, hasHandle: true }, // 45° door (~24")
    { from: [0.26, -0.17], to: [0.26, L] },                          // right fixed ∥ left wall
  ] },
  slider: { headerBar: true, panels: [
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

function makeRainBumpTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);
  // Dense elongated droplets with hard highlights — reads as real rain glass
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 2.5 + Math.random() * 8, len = r * (2.5 + Math.random() * 4);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const bright = 185 + Math.floor(Math.random() * 70);
    g.addColorStop(0, `rgb(${bright},${bright},${bright})`);
    g.addColorStop(0.55, `rgb(${bright - 70},${bright - 70},${bright - 70})`);
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
  tex.repeat.set(1.4, 1.4);
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
  pivot: THREE.Group;
  glass: THREE.Mesh;
  glassMat: THREE.MeshPhysicalMaterial;
  edges: THREE.LineSegments;
  edgeMat: THREE.LineBasicMaterial;
  /** Structural yaw of the pivot — assembly animation swings into this. */
  rotY: number;
  /** Flat-panel dimensions — used by the grid upgrade. */
  w: number;
  h: number;
  /** Applied muntin-bar group when the grid upgrade is active. */
  grid?: THREE.Group;
}

export function createShowerRig(opts: { cheapGlass: boolean }): ShowerRig {
  const group = new THREE.Group();
  let elapsed = 0;
  let solidity = 0.15;
  let glassKey: GlassKey = 'clear';
  let tuning: ShowerModelTuning = { ...DEFAULT_SHOWER_TUNING };
  let currentFinish = finishFor('chrome');
  const rainBump = makeRainBumpTexture();
  const tileTex = makeTileTexture();

  /* ---- Pedestal + walls ---- */

  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x0a1828, roughness: 0.55, metalness: 0.35 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.1, 64), pedestalMat);
  pedestal.position.y = 0.05;
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

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x14283f, roughness: 0.7, map: tileTex });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.68, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BASE_Y - 0.001;
  group.add(floor);

  // Showerhead — arm comes out of the BACK wall, head hanging at its end
  const metalMat = new THREE.MeshStandardMaterial({
    color: currentFinish.color,
    metalness: 1,
    roughness: currentFinish.roughness * tuning.metalRoughnessScale,
    envMapIntensity: tuning.metalEnv,
  });
  const armGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.3, 12);
  const arm = new THREE.Mesh(armGeo, metalMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(-0.35, BASE_Y + 1.96, -0.59); // spans wall (z=-0.74) → z=-0.44
  group.add(arm);
  const headJoint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), metalMat);
  headJoint.position.set(-0.35, BASE_Y + 1.96, -0.45);
  group.add(headJoint);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.105, 0.02, 24), metalMat);
  head.position.set(-0.35, BASE_Y + 1.92, -0.44);
  head.rotation.x = 0.1;
  group.add(head);

  /* ---- Glass assembly (rebuilt per enclosure) ---- */

  const assembly = new THREE.Group();
  group.add(assembly);
  let panels: PanelRuntime[] = [];
  const extraPanels: PanelRuntime[] = []; // steam transoms
  let handleHost: THREE.Group | null = null; // attached to the door pivot
  let handleKey: HandleKey = 'pull';
  let currentKey: EnclosureKey = 'corner90';
  let currentLabel = '90 corner';
  let gridOn = false;
  let steamOn = false;
  const hardwareMeshes: THREE.Mesh[] = [];

  function allGlass(): PanelRuntime[] {
    return panels.concat(extraPanels);
  }

  function trackHardware(mesh: THREE.Mesh): THREE.Mesh {
    hardwareMeshes.push(mesh);
    return mesh;
  }

  function makeGlassMaterial(): THREE.MeshPhysicalMaterial {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xb9e2ff,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: tuning.glassEnv,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    });
    if (!opts.cheapGlass) {
      m.transmission = 0.92;
      m.thickness = 0.06;
      m.ior = 1.5;
    }
    return m;
  }

  function applyGlassKey(m: THREE.MeshPhysicalMaterial, key: GlassKey, animate: boolean): void {
    const target = key === 'frosted'
      ? { roughness: 0.55, opacity: 0.58, color: new THREE.Color(0xdeeefc) }
      : key === 'rain'
        ? { roughness: 0.16, opacity: 0.46, color: new THREE.Color(0xc9e8ff) }
        : { roughness: 0.03, opacity: 0.34, color: new THREE.Color(0xb9e2ff) };
    m.bumpMap = key === 'rain' ? rainBump : null;
    m.bumpScale = key === 'rain' ? 5.5 : 0;
    m.envMapIntensity = tuning.glassEnv;
    m.needsUpdate = true;
    if (animate && !prefersReducedMotion()) {
      gsap.to(m, { roughness: target.roughness, duration: 1.1, ease: 'power2.inOut' });
      gsap.to(m.color, { r: target.color.r, g: target.color.g, b: target.color.b, duration: 1.1 });
      gsap.to(m, { opacity: target.opacity * solidityOpacityScale(), duration: 1.1 });
    } else {
      m.roughness = target.roughness;
      m.color.copy(target.color);
      m.opacity = target.opacity * solidityOpacityScale();
    }
  }

  function solidityOpacityScale(): number {
    return 0.35 + solidity * 0.65;
  }

  function baseOpacityFor(key: GlassKey): number {
    const base = key === 'frosted' ? 0.58 : key === 'rain' ? 0.46 : 0.34;
    return clamp(base * tuning.glassOpacityScale, 0.08, 0.82);
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

    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
    edges.renderOrder = 3;

    const pivot = new THREE.Group();
    pivot.position.set((x1 + x2) / 2, baseY, (z1 + z2) / 2);
    pivot.rotation.y = rotY;
    pivot.add(glass, edges);

    if (spec.isDoor) {
      for (const hy of [0.45, 1.5]) {
        const hinge = trackHardware(new THREE.Mesh(scaledRoundedBox(0.055, 0.09, 0.045, tuning.hingeScale, tuning.clipDepth), metalMat));
        hinge.position.set(-w / 2 + 0.028, hy, 0);
        pivot.add(hinge);
      }
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

    assembly.add(pivot);
    return { pivot, glass, glassMat, edges, edgeMat, rotY, w, h: hgt };
  }

  function disposeRuntime(p: PanelRuntime): void {
    p.glass.geometry.dispose();
    p.glassMat.dispose();
    p.edges.geometry.dispose();
    p.edgeMat.dispose();
    p.grid?.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
  }

  function disposePanels(): void {
    for (const p of panels) disposeRuntime(p);
    for (const p of extraPanels) disposeRuntime(p);
    hardwareMeshes.forEach((mesh) => mesh.geometry.dispose());
    hardwareMeshes.length = 0;
    handleHost = null;
    assembly.clear();
    panels = [];
    extraPanels.length = 0;
  }

  function addSliderHardware(): void {
    const railY = BASE_Y + GLASS_H + tuning.railYOffset;
    const railZ = F + tuning.railProjection;
    const wheelRadius = 0.064 * tuning.rollerScale;
    const wheelDepth = 0.026 * tuning.clipDepth;
    const rail = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(tuning.railDiameter, tuning.railDiameter, 1.62, 32), metalMat));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, railY, railZ);
    assembly.add(rail);

    for (const x of [-0.74, 0.74]) {
      const wallBracket = trackHardware(new THREE.Mesh(scaledRoundedBox(0.085, 0.085, 0.062, tuning.clipScale, tuning.clipDepth), metalMat));
      wallBracket.position.set(x, railY, railZ - 0.03);
      assembly.add(wallBracket);
      const cap = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.043 * tuning.clipScale, 0.043 * tuning.clipScale, 0.018 * tuning.clipDepth, 26), metalMat));
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x, railY, railZ + 0.018);
      assembly.add(cap);
    }

    for (const x of [0.04, 0.04 + tuning.rollerSpread]) {
      const hanger = trackHardware(new THREE.Mesh(scaledRoundedBox(0.04, 0.18, 0.03, tuning.clipScale, tuning.clipDepth), metalMat));
      hanger.position.set(x, railY - 0.105, railZ + 0.052);
      assembly.add(hanger);

      const bracket = trackHardware(new THREE.Mesh(scaledRoundedBox(0.11, 0.038, 0.035, tuning.clipScale, tuning.clipDepth), metalMat));
      bracket.position.set(x, railY - 0.025, railZ + 0.05);
      assembly.add(bracket);

      const wheel = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelDepth, 40), metalMat));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, railY + 0.006, railZ + 0.076);
      assembly.add(wheel);

      const axle = trackHardware(new THREE.Mesh(new THREE.CylinderGeometry(0.01 * tuning.clipScale, 0.01 * tuning.clipScale, 0.067 * tuning.clipDepth, 14), metalMat));
      axle.rotation.x = Math.PI / 2;
      axle.position.set(x, railY, railZ + 0.078);
      assembly.add(axle);

      const rim = trackHardware(new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 1.03, 0.006 * tuning.rollerScale, 12, 40), metalMat));
      rim.position.set(x, railY + 0.006, railZ + 0.092);
      assembly.add(rim);
    }

    const floorGuide = trackHardware(new THREE.Mesh(scaledRoundedBox(0.095, 0.055, 0.05, tuning.clipScale, tuning.clipDepth), metalMat));
    floorGuide.position.set(0.16, BASE_Y + 0.028, railZ - 0.01);
    assembly.add(floorGuide);
  }

  function buildEnclosure(key: EnclosureKey, animate: boolean): void {
    currentKey = key;
    disposePanels();
    const layout = LAYOUTS[key];
    rightWall.visible = !!layout.alcoveRightWall;
    for (const spec of layout.panels) panels.push(addPanel(spec));

    if (layout.headerBar) addSliderHardware();

    // Materialize: each panel's edges rise from the floor while the pane
    // swings into its structural angle, then the glass glazes in with a
    // bright reflective shimmer that settles. Hardware pops on last.
    const scale = solidityOpacityScale();
    if (animate && !prefersReducedMotion()) {
      panels.forEach((p, i) => {
        const finalOpacity = baseOpacityFor(glassKey) * scale;
        applyGlassKey(p.glassMat, glassKey, false);
        p.glassMat.opacity = 0;
        const d = i * 0.16;
        gsap.fromTo(p.pivot.scale, { y: 0.001 }, { y: 1, duration: 0.7, ease: 'power3.out', delay: d });
        gsap.fromTo(p.pivot.rotation, { y: p.rotY + 0.5 }, { y: p.rotY, duration: 0.95, ease: 'power3.out', delay: d });
        gsap.fromTo(p.edgeMat, { opacity: 0 }, { opacity: edgeOpacity(), duration: 0.45, delay: d });
        gsap.to(p.glassMat, { opacity: finalOpacity, duration: 0.9, delay: d + 0.35, ease: 'power2.out' });
        gsap.fromTo(p.glassMat, { envMapIntensity: Math.max(3.4, tuning.glassEnv + 0.8) }, { envMapIntensity: tuning.glassEnv, duration: 1.5, ease: 'power2.out', delay: d + 0.35 });
      });
      const hwDelay = panels.length * 0.16 + 0.45;
      hardwareMeshes.forEach((hm, i) => {
        gsap.fromTo(hm.scale, { x: 0.01, y: 0.01, z: 0.01 },
          { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.4)', delay: hwDelay + i * 0.08 });
      });
      buildHandle(handleKey, true, hwDelay + 0.15);
    } else {
      buildHandle(handleKey, false);
      panels.forEach((p) => applyGlassKey(p.glassMat, glassKey, false));
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
      const depth = 0.022;
      for (const fx of [-1 / 6, 1 / 6]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.016, p.h - 0.04, depth), metalMat);
        bar.position.set(p.w * fx, p.h / 2, 0);
        grid.add(bar);
      }
      for (const fy of [0.035, 0.25, 0.5, 0.75, 0.965]) {
        const isBorder = fy < 0.05 || fy > 0.95;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(p.w - 0.03, isBorder ? 0.022 : 0.016, depth), metalMat);
        bar.position.set(0, p.h * fy, 0);
        grid.add(bar);
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
      assembly.remove(p.pivot);
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
      applyGlassKey(transom.glassMat, glassKey, false);
      transom.edgeMat.opacity = edgeOpacity();
      transom.glassMat.opacity = baseOpacityFor(glassKey) * solidityOpacityScale();
      extraPanels.push(transom);
      if (animate && !prefersReducedMotion()) {
        const target = transom.glassMat.opacity;
        transom.glassMat.opacity = 0;
        gsap.fromTo(transom.pivot.scale, { y: 0.001 }, { y: 1, duration: 0.6, ease: 'power3.out' });
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

  function buildHandle(key: HandleKey, animate: boolean, delay = 0): void {
    if (!handleHost) return;
    handleHost.clear();
    const grp = new THREE.Group();

    const standoff = () => new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 10), metalMat);

    if (key === 'pull') {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.42, 14), metalMat);
      bar.position.z = 0.05;
      const s1 = standoff(); s1.rotation.x = Math.PI / 2; s1.position.set(0, 0.17, 0.025);
      const s2 = standoff(); s2.rotation.x = Math.PI / 2; s2.position.set(0, -0.17, 0.025);
      grp.add(bar, s1, s2);
    } else if (key === 'ladder') {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.56, 14), metalMat);
      bar.position.z = 0.06;
      grp.add(bar);
      for (const y of [0.24, 0, -0.24]) {
        const rung = standoff(); rung.rotation.x = Math.PI / 2; rung.position.set(0, y, 0.03);
        grp.add(rung);
      }
    } else if (key === 'u-handle') {
      const front = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 12), metalMat);
      front.position.z = 0.045;
      const back = front.clone(); back.position.z = -0.045;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), metalMat);
      top.rotation.x = Math.PI / 2; top.position.y = 0.15;
      const bot = top.clone(); bot.position.y = -0.15;
      grp.add(front, back, top, bot);
    } else { // knob
      const stem = standoff(); stem.rotation.x = Math.PI / 2; stem.position.z = 0.03;
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.016, 22), metalMat);
      face.rotation.x = Math.PI / 2; face.position.z = 0.062;
      grp.add(stem, face);
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
  const steamSprites: Array<{ sprite: THREE.Sprite; phase: number; x: number; z: number }> = [];
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.SpriteMaterial({
      map: steamTex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const x = -0.45 + Math.random() * 0.7;
    const z = -0.55 + Math.random() * 0.6;
    sprite.position.set(x, BASE_Y + 0.5, z);
    steamSprites.push({ sprite, phase: i / 7, x, z });
    fxGroup.add(sprite);
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

    for (const s of steamSprites) {
      const p = (t * 0.09 + s.phase) % 1;
      s.sprite.position.set(
        s.x + Math.sin(t * 0.5 + s.phase * 9) * 0.08,
        BASE_Y + 0.45 + p * 1.7,
        s.z,
      );
      const fade = Math.sin(Math.PI * p);
      (s.sprite.material as THREE.SpriteMaterial).opacity = fade * 0.16;
      const sc = 0.45 + p * 1.15;
      s.sprite.scale.set(sc, sc, 1);
    }
  }

  /* ---- Solidity ---- */

  function edgeOpacity(): number {
    return 0.9 - solidity * 0.62;
  }

  function applySolidityNow(): void {
    const scale = solidityOpacityScale();
    for (const p of allGlass()) {
      p.edgeMat.opacity = edgeOpacity();
      p.glassMat.opacity = baseOpacityFor(glassKey) * scale;
    }
    ringMat.opacity = 0.4 + solidity * 0.3;
  }

  function normalizeTuning(next: Partial<ShowerModelTuning>): ShowerModelTuning {
    return {
      clipScale: clamp(next.clipScale ?? tuning.clipScale, 0.35, 1.5),
      clipDepth: clamp(next.clipDepth ?? tuning.clipDepth, 0.25, 1.35),
      clipBevel: clamp(next.clipBevel ?? tuning.clipBevel, 0.001, 0.025),
      hingeScale: clamp(next.hingeScale ?? tuning.hingeScale, 0.35, 1.5),
      railDiameter: clamp(next.railDiameter ?? tuning.railDiameter, 0.012, 0.06),
      railYOffset: clamp(next.railYOffset ?? tuning.railYOffset, -0.18, 0.08),
      railProjection: clamp(next.railProjection ?? tuning.railProjection, 0.02, 0.24),
      rollerScale: clamp(next.rollerScale ?? tuning.rollerScale, 0.45, 1.45),
      rollerSpread: clamp(next.rollerSpread ?? tuning.rollerSpread, 0.22, 0.62),
      metalRoughnessScale: clamp(next.metalRoughnessScale ?? tuning.metalRoughnessScale, 0.25, 2.2),
      metalEnv: clamp(next.metalEnv ?? tuning.metalEnv, 0.3, 3.4),
      glassOpacityScale: clamp(next.glassOpacityScale ?? tuning.glassOpacityScale, 0.35, 1.6),
      glassEnv: clamp(next.glassEnv ?? tuning.glassEnv, 0.5, 4.0),
    };
  }

  /* ---- Public API ---- */

  buildEnclosure('corner90', false); // slick two-pane corner as the opening hologram

  return {
    group,

    setEnclosure(label: string): void {
      currentLabel = label;
      buildEnclosure(enclosureKeyFor(label), true);
    },

    setGlass(label: string): void {
      glassKey = glassKeyFor(label);
      for (const p of allGlass()) applyGlassKey(p.glassMat, glassKey, true);
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
    },

    setModelTuning(settings: Partial<ShowerModelTuning>): void {
      tuning = normalizeTuning(settings);
      applyMetalNow();
      buildEnclosure(currentKey, false);
      for (const p of allGlass()) applyGlassKey(p.glassMat, glassKey, false);
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
      tileMat.dispose(); shellMat.dispose();
      floor.geometry.dispose(); floorMat.dispose();
      metalMat.dispose();
      dropGeo.dispose(); dropMat.dispose(); steamTex.dispose();
      rainBump.dispose(); tileTex.dispose();
    },
  };
}
