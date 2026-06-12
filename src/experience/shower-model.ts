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
import { gsap } from '../animations/engine';
import { prefersReducedMotion } from './flag';

export interface ShowerRig {
  group: THREE.Group;
  setEnclosure(label: string): void;
  setGlass(label: string): void;
  setHardware(label: string): void;
  setHandle(label: string): void;
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
  | 'curved' | 'arched' | 'splash' | 'steam' | 'custom';

function enclosureKeyFor(label: string): EnclosureKey {
  const v = label.toLowerCase();
  if (v.includes('splash') || v.includes('walk')) return 'splash';
  if (v.includes('90') || v.includes('corner')) return 'corner90';
  if (v.includes('neo')) return 'neo';
  if (v.includes('slid') || v.includes('bypass')) return 'slider';
  if (v.includes('curv') || v.includes('round')) return 'curved';
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

const GLASS_H = 2.0;
const BASE_Y = 0.1; // top of pedestal
const T = 0.012;    // 1/2" glass

interface PanelSpec {
  from: [number, number]; // x,z
  to: [number, number];
  height?: number;
  baseY?: number;
  isDoor?: boolean;       // gets hinges
  hasHandle?: boolean;
  arched?: boolean;
}

interface CurvedSpec { center: [number, number]; radius: number; thetaStart: number; thetaLength: number; }

interface EnclosureLayout { panels: PanelSpec[]; curved?: CurvedSpec; headerBar?: boolean; }

const L = -0.7, R = 0.7, F = 0.7; // left wall x, right extent, front z

const LAYOUTS: Record<EnclosureKey, EnclosureLayout> = {
  single: { panels: [
    { from: [L, F], to: [-0.45, F] },
    { from: [-0.45, F], to: [0.42, F], isDoor: true, hasHandle: true },
  ] },
  'door-panel': { panels: [
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
  // PARALLEL to the walls (held in U-channels), and the door spans the
  // diagonal cut. Pentagon plan: wall, wall, fixed, 45° door, fixed.
  neo: { panels: [
    { from: [L, 0.26], to: [-0.17, 0.26] },                          // left fixed ∥ back wall
    { from: [-0.17, 0.26], to: [0.26, -0.17], isDoor: true, hasHandle: true }, // 45° door (~24")
    { from: [0.26, -0.17], to: [0.26, L] },                          // right fixed ∥ left wall
  ] },
  slider: { headerBar: true, panels: [
    { from: [L, 0.66], to: [0.06, 0.66] },
    { from: [-0.06, 0.74], to: [R, 0.74], isDoor: true, hasHandle: true },
  ] },
  curved: {
    panels: [],
    curved: { center: [L, -0.7], radius: 1.4, thetaStart: 0, thetaLength: Math.PI / 2 },
  },
  arched: { panels: [
    { from: [L, F], to: [-0.05, F] },
    { from: [-0.05, F], to: [R, F], isDoor: true, hasHandle: true, arched: true },
  ] },
  splash: { panels: [
    { from: [L, F], to: [0.15, F] },
  ] },
  steam: { panels: [
    { from: [L, F], to: [-0.15, F] },
    { from: [-0.15, F], to: [R, F], isDoor: true, hasHandle: true },
    { from: [R, F], to: [R, -0.7] },
    { from: [L, F], to: [R, F], baseY: BASE_Y + GLASS_H + 0.02, height: 0.32 }, // transom
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
}

export function createShowerRig(opts: { cheapGlass: boolean }): ShowerRig {
  const group = new THREE.Group();
  let elapsed = 0;
  let solidity = 0.15;
  let glassKey: GlassKey = 'clear';
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
    new THREE.BoxGeometry(1.58, 2.45, 0.07),
    [shellMat, shellMat, shellMat, shellMat, tileMat, shellMat], // tile faces the shower (+z)
  );
  backWall.position.set(0, BASE_Y + 1.22, -0.745);
  backWall.renderOrder = 1;
  group.add(backWall);
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 2.45, 1.58),
    [tileMat, shellMat, shellMat, shellMat, shellMat, shellMat], // tile faces the shower (+x)
  );
  leftWall.position.set(-0.745, BASE_Y + 1.22, 0);
  leftWall.renderOrder = 1;
  group.add(leftWall);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x14283f, roughness: 0.7, map: tileTex });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.68, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BASE_Y + 0.002;
  group.add(floor);

  // Showerhead — arm comes out of the BACK wall, head hanging at its end
  const metalMat = new THREE.MeshStandardMaterial({ color: FINISHES.chrome.color, metalness: 1, roughness: FINISHES.chrome.roughness });
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
  let handleHost: THREE.Group | null = null; // attached to the door pivot
  let handleKey: HandleKey = 'pull';
  const hingeMeshes: THREE.Mesh[] = [];

  function makeGlassMaterial(): THREE.MeshPhysicalMaterial {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xb9e2ff,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 2.0,
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
    return key === 'frosted' ? 0.58 : key === 'rain' ? 0.46 : 0.34;
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
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.045), metalMat);
        hinge.position.set(-w / 2 + 0.028, hy, 0);
        pivot.add(hinge);
        hingeMeshes.push(hinge);
      }
    } else if (!spec.baseY) {
      // Fixed panels: U-channel where a vertical edge meets a wall — the
      // detail that makes a frameless install read as professionally set.
      const nearWall = (x: number, z: number) =>
        Math.abs(x - L) < 0.06 || Math.abs(z - L) < 0.06;
      for (const [end, sign] of [[spec.from, -1], [spec.to, 1]] as Array<[[number, number], number]>) {
        if (nearWall(end[0], end[1])) {
          const channel = new THREE.Mesh(new THREE.BoxGeometry(0.028, hgt, 0.034), metalMat);
          channel.position.set(sign * (w / 2 - 0.012), hgt / 2, 0);
          pivot.add(channel);
          hingeMeshes.push(channel);
        }
      }
    }
    // Low tiled curb under every floor-standing panel
    if (!spec.baseY) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.1), pedestalMat);
      curb.position.set(0, 0.035, 0);
      pivot.add(curb);
    }
    if (spec.hasHandle) {
      handleHost = new THREE.Group();
      handleHost.position.set(w / 2 - 0.09, 1.05, 0);
      pivot.add(handleHost);
    }

    assembly.add(pivot);
    return { pivot, glass, glassMat, edges, edgeMat, rotY };
  }

  function addCurvedPanel(spec: CurvedSpec): PanelRuntime {
    const geo = new THREE.CylinderGeometry(spec.radius, spec.radius, GLASS_H, 36, 1, true, spec.thetaStart, spec.thetaLength);
    geo.translate(0, GLASS_H / 2, 0);
    const glassMat = makeGlassMaterial();
    const glass = new THREE.Mesh(geo, glassMat);
    glass.renderOrder = 2;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 50), edgeMat);
    edges.renderOrder = 3;
    const pivot = new THREE.Group();
    pivot.position.set(spec.center[0], BASE_Y, spec.center[1]);
    pivot.add(glass, edges);
    // Handle on the curve's leading edge
    handleHost = new THREE.Group();
    handleHost.position.set(Math.sin(spec.thetaStart + spec.thetaLength * 0.5) * spec.radius, 1.05,
      Math.cos(spec.thetaStart + spec.thetaLength * 0.5) * spec.radius);
    handleHost.lookAt(new THREE.Vector3(0, 1.05, 0).add(pivot.position));
    pivot.add(handleHost);
    assembly.add(pivot);
    return { pivot, glass, glassMat, edges, edgeMat, rotY: 0 };
  }

  function disposePanels(): void {
    for (const p of panels) {
      p.glass.geometry.dispose();
      p.glassMat.dispose();
      p.edges.geometry.dispose();
      p.edgeMat.dispose();
    }
    hingeMeshes.length = 0;
    handleHost = null;
    assembly.clear();
    panels = [];
  }

  function buildEnclosure(key: EnclosureKey, animate: boolean): void {
    disposePanels();
    const layout = LAYOUTS[key];
    for (const spec of layout.panels) panels.push(addPanel(spec));
    if (layout.curved) panels.push(addCurvedPanel(layout.curved));

    if (layout.headerBar) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.44, 12), metalMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, BASE_Y + GLASS_H + 0.08, F);
      assembly.add(bar);
    }

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
        gsap.fromTo(p.glassMat, { envMapIntensity: 3.4 }, { envMapIntensity: 1.4, duration: 1.5, ease: 'power2.out', delay: d + 0.35 });
      });
      const hwDelay = panels.length * 0.16 + 0.45;
      hingeMeshes.forEach((hm, i) => {
        gsap.fromTo(hm.scale, { x: 0.01, y: 0.01, z: 0.01 },
          { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.4)', delay: hwDelay + i * 0.08 });
      });
      buildHandle(handleKey, true, hwDelay + 0.15);
    } else {
      buildHandle(handleKey, false);
      panels.forEach((p) => applyGlassKey(p.glassMat, glassKey, false));
      applySolidityNow();
    }
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
    for (const p of panels) {
      p.edgeMat.opacity = edgeOpacity();
      p.glassMat.opacity = baseOpacityFor(glassKey) * scale;
    }
    ringMat.opacity = 0.4 + solidity * 0.3;
  }

  /* ---- Public API ---- */

  buildEnclosure('corner90', false); // slick two-pane corner as the opening hologram

  return {
    group,

    setEnclosure(label: string): void {
      buildEnclosure(enclosureKeyFor(label), true);
    },

    setGlass(label: string): void {
      glassKey = glassKeyFor(label);
      for (const p of panels) applyGlassKey(p.glassMat, glassKey, true);
    },

    setHardware(label: string): void {
      const f = finishFor(label);
      const c = new THREE.Color(f.color);
      if (prefersReducedMotion()) {
        metalMat.color.copy(c);
        metalMat.roughness = f.roughness;
      } else {
        gsap.to(metalMat.color, { r: c.r, g: c.g, b: c.b, duration: 0.9, ease: 'power2.inOut' });
        gsap.to(metalMat, { roughness: f.roughness, duration: 0.9 });
      }
    },

    setHandle(label: string): void {
      handleKey = handleKeyFor(label);
      buildHandle(handleKey, true);
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
      backWall.geometry.dispose(); leftWall.geometry.dispose();
      tileMat.dispose(); shellMat.dispose();
      floor.geometry.dispose(); floorMat.dispose();
      metalMat.dispose();
      dropGeo.dispose(); dropMat.dispose(); steamTex.dispose();
      rainBump.dispose(); tileTex.dispose();
    },
  };
}
