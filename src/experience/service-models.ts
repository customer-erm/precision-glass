/**
 * Procedural 3D rigs for the non-shower guided tours.
 *
 * These are intentionally lightweight, code-built product scenes. They give
 * railings and commercial glass the same "choices build the model" feeling as
 * the shower flow without requiring AI visualization or uploaded photos.
 */
import * as THREE from 'three';
import { gsap } from '../animations/engine';
import { prefersReducedMotion } from './flag';

export interface RailingRig {
  group: THREE.Group;
  setSystem(label: string): void;
  setGlass(label: string): void;
  setFinish(label: string): void;
  setMounting(label: string): void;
  setSolidity(t: number): void;
  pulse(): void;
  setProcess(on: boolean): void;
  idle(dt: number): void;
  dispose(): void;
}

export interface CommercialRig {
  group: THREE.Group;
  setProjectType(label: string): void;
  setGlass(label: string): void;
  setFraming(label: string): void;
  setScope(label: string): void;
  setSolidity(t: number): void;
  pulse(): void;
  setProcess(on: boolean): void;
  idle(dt: number): void;
  dispose(): void;
}

type Materialish = THREE.Material | THREE.Material[];

function disposeMaterial(material: Materialish): void {
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
}

function disposeGroup(group: THREE.Group, preserveMaterials = new Set<THREE.Material>()): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (mesh.material) {
      const material = mesh.material as Materialish;
      if (Array.isArray(material)) {
        material.forEach((m) => { if (!preserveMaterials.has(m)) m.dispose(); });
      } else if (!preserveMaterials.has(material)) {
        disposeMaterial(material);
      }
    }
  });
  group.clear();
}

function makeGlowRing(color = 0x5fd4ff): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.012, 8, 120), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 0.08;
  return { mesh, mat };
}

function makeGlassMaterial(): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xbce8ff,
    roughness: 0.16,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.45,
    clearcoat: 0.25,
    clearcoatRoughness: 0.24,
  });
  mat.transmission = 0.92;
  mat.thickness = 0.06;
  mat.ior = 1.5;
  return mat;
}

function applyGlassLook(mat: THREE.MeshPhysicalMaterial, label: string, solidity: number, animate: boolean): void {
  const v = label.toLowerCase();
  const target =
    v.includes('frost') || v.includes('privacy')
      ? { color: new THREE.Color(0xdfeefa), opacity: 0.42, roughness: 0.65 }
      : v.includes('tint') || v.includes('bronze') || v.includes('gray') || v.includes('spandrel')
        ? { color: new THREE.Color(0x8fb0c4), opacity: 0.34, roughness: 0.28 }
        : v.includes('low') || v.includes('ultra')
          ? { color: new THREE.Color(0xd8f7ff), opacity: 0.22, roughness: 0.14 }
          : v.includes('impact') || v.includes('hurricane') || v.includes('laminated')
            ? { color: new THREE.Color(0xb7e3ff), opacity: 0.3, roughness: 0.2 }
            : { color: new THREE.Color(0xc7efff), opacity: 0.24, roughness: 0.16 };
  const opacity = target.opacity * (0.45 + solidity * 0.55);
  if (animate && !prefersReducedMotion()) {
    gsap.to(mat.color, { r: target.color.r, g: target.color.g, b: target.color.b, duration: 0.85, ease: 'power2.inOut' });
    gsap.to(mat, { opacity, roughness: target.roughness, duration: 0.85, ease: 'power2.inOut' });
  } else {
    mat.color.copy(target.color);
    mat.opacity = opacity;
    mat.roughness = target.roughness;
  }
}

function finishFor(label: string): { color: number; roughness: number; metalness: number } {
  const v = label.toLowerCase();
  if (v.includes('black')) return { color: 0x141820, roughness: 0.56, metalness: 0.65 };
  if (v.includes('bronze') || v.includes('champagne')) return { color: 0x9a7043, roughness: 0.34, metalness: 0.8 };
  if (v.includes('brushed') || v.includes('satin')) return { color: 0xb9c0c5, roughness: 0.38, metalness: 0.9 };
  if (v.includes('stainless') || v.includes('chrome') || v.includes('aluminum')) return { color: 0xd7e0e6, roughness: 0.18, metalness: 0.92 };
  return { color: 0xcfd8df, roughness: 0.28, metalness: 0.8 };
}

function applyMetalLook(mat: THREE.MeshStandardMaterial, label: string, animate: boolean): void {
  const f = finishFor(label);
  const c = new THREE.Color(f.color);
  if (animate && !prefersReducedMotion()) {
    gsap.to(mat.color, { r: c.r, g: c.g, b: c.b, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(mat, { roughness: f.roughness, metalness: f.metalness, duration: 0.8, ease: 'power2.inOut' });
  } else {
    mat.color.copy(c);
    mat.roughness = f.roughness;
    mat.metalness = f.metalness;
  }
}

function lineBox(w: number, h: number, d: number, color = 0x74ddff): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
  return new THREE.LineSegments(geo, mat);
}

/* ------------------------------------------------------------------ */
/*  Railings                                                           */
/* ------------------------------------------------------------------ */

type RailSystem = 'frameless' | 'standoff' | 'posted' | 'cable' | 'pool';
type RailMount = 'top' | 'fascia' | 'core' | 'shoe';

function railSystemFor(label: string): RailSystem {
  const v = label.toLowerCase();
  if (v.includes('cable')) return 'cable';
  if (v.includes('post') || v.includes('clip')) return 'posted';
  if (v.includes('standoff')) return 'standoff';
  if (v.includes('pool')) return 'pool';
  return 'frameless';
}

function railMountFor(label: string): RailMount {
  const v = label.toLowerCase();
  if (v.includes('fascia') || v.includes('side')) return 'fascia';
  if (v.includes('core')) return 'core';
  if (v.includes('shoe') || v.includes('embedded')) return 'shoe';
  return 'top';
}

export function createRailingRig(): RailingRig {
  const group = new THREE.Group();
  group.visible = false;

  const deckMat = new THREE.MeshStandardMaterial({ color: 0x13263b, roughness: 0.68, metalness: 0.08 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 1.5), deckMat);
  deck.position.y = 0.0;
  group.add(deck);

  const tileMat = new THREE.MeshStandardMaterial({ color: 0x1b3750, roughness: 0.74 });
  for (let i = 0; i < 7; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 1.48), tileMat);
    strip.position.set(-1.8 + i * 0.6, 0.088, 0);
    group.add(strip);
  }

  const assembly = new THREE.Group();
  group.add(assembly);

  const processGroup = new THREE.Group();
  processGroup.visible = false;
  group.add(processGroup);

  const metalMat = new THREE.MeshStandardMaterial({ color: 0xd7e0e6, roughness: 0.18, metalness: 0.9 });
  const glassMat = makeGlassMaterial();
  let system: RailSystem = 'frameless';
  let mount: RailMount = 'top';
  let glassLabel = 'Clear Tempered';
  let solidity = 0.18;
  let elapsed = 0;

  function addPanel(x: number, w: number): void {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 1.08, 0.026), glassMat);
    pane.position.set(x, 0.72, 0.34);
    pane.renderOrder = 2;
    assembly.add(pane);
    const edges = lineBox(w, 1.08, 0.028);
    edges.position.copy(pane.position);
    assembly.add(edges);
  }

  function addPost(x: number, z = 0.34, h = 1.28): void {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, h, 18), metalMat);
    post.position.set(x, 0.18 + h / 2, z);
    assembly.add(post);
  }

  function addBaseShoe(): void {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.09, 0.12), metalMat);
    shoe.position.set(0, 0.16, 0.34);
    assembly.add(shoe);
  }

  function addStandoffs(): void {
    for (const x of [-1.42, -0.86, -0.28, 0.28, 0.86, 1.42]) {
      for (const y of [0.48, 0.92]) {
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 22), metalMat);
        button.rotation.x = Math.PI / 2;
        button.position.set(x, y, 0.425);
        assembly.add(button);
      }
    }
  }

  function addCables(): void {
    for (const x of [-1.75, -0.9, 0, 0.9, 1.75]) addPost(x, 0.34, 1.2);
    for (let i = 0; i < 6; i++) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 3.55, 10), metalMat);
      cable.rotation.z = Math.PI / 2;
      cable.position.set(0, 0.42 + i * 0.13, 0.34);
      assembly.add(cable);
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.65, 12), metalMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 1.42, 0.34);
    assembly.add(rail);
  }

  function applyMountDetails(): void {
    if (system === 'cable') return;
    if (mount === 'fascia') {
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.16, 0.08), metalMat);
      fascia.position.set(0, 0.18, 0.78);
      assembly.add(fascia);
      addStandoffs();
    } else if (mount === 'core') {
      for (const x of [-1.75, -0.9, 0, 0.9, 1.75]) {
        addPost(x, 0.34, 1.16);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.018, 22), metalMat);
        collar.position.set(x, 0.18, 0.34);
        assembly.add(collar);
      }
    } else if (mount === 'shoe' || system === 'frameless' || system === 'pool') {
      addBaseShoe();
    } else {
      for (const x of [-1.75, -0.9, 0, 0.9, 1.75]) {
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.09), metalMat);
        clamp.position.set(x, 0.22, 0.34);
        assembly.add(clamp);
      }
    }
  }

  function build(animate: boolean): void {
    disposeGroup(assembly, new Set([metalMat, glassMat]));
    assembly.scale.set(1, 1, 1);
    if (system === 'cable') {
      addCables();
    } else {
      for (const x of [-1.18, 0, 1.18]) addPanel(x, 1.1);
      if (system === 'standoff') addStandoffs();
      if (system === 'posted') {
        for (const x of [-1.78, -0.6, 0.6, 1.78]) addPost(x);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.65, 12), metalMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(0, 1.42, 0.34);
        assembly.add(cap);
      }
      if (system === 'pool') {
        const gateLine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.08, 0.035), metalMat);
        gateLine.position.set(0.58, 0.72, 0.38);
        assembly.add(gateLine);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), metalMat);
        latch.position.set(0.68, 0.82, 0.42);
        assembly.add(latch);
      }
      applyMountDetails();
    }
    applyGlassLook(glassMat, glassLabel, solidity, false);
    if (animate && !prefersReducedMotion()) {
      gsap.fromTo(assembly.scale, { y: 0.02 }, { y: 1, duration: 0.9, ease: 'power3.out' });
      assembly.children.forEach((child, i) => {
        child.scale.set(0.001, 0.001, 0.001);
        gsap.to(child.scale, { x: 1, y: 1, z: 1, duration: 0.55, ease: 'back.out(2)', delay: i * 0.035 });
      });
    }
  }

  function buildProcess(): void {
    disposeGroup(processGroup);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.35, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.018, 0.018), beamMat);
    beam.position.set(0, 1.55, 0.34);
    processGroup.add(beam);
    for (const x of [-1.6, -0.8, 0, 0.8, 1.6]) {
      const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 18), beamMat);
      mark.position.set(x, 0.095, 0.34);
      processGroup.add(mark);
    }
  }

  build(false);
  buildProcess();

  return {
    group,
    setSystem(label: string): void {
      system = railSystemFor(label);
      build(true);
    },
    setGlass(label: string): void {
      glassLabel = label;
      applyGlassLook(glassMat, label, solidity, true);
    },
    setFinish(label: string): void {
      applyMetalLook(metalMat, label, true);
    },
    setMounting(label: string): void {
      mount = railMountFor(label);
      build(true);
    },
    setSolidity(t: number): void {
      const target = Math.max(0, Math.min(1, t));
      if (prefersReducedMotion()) {
        solidity = target;
        applyGlassLook(glassMat, glassLabel, solidity, false);
        return;
      }
      gsap.to({ s: solidity }, {
        s: target,
        duration: 1,
        ease: 'power2.inOut',
        onUpdate(this: gsap.core.Tween) {
          solidity = (this.targets()[0] as { s: number }).s;
          applyGlassLook(glassMat, glassLabel, solidity, false);
        },
      });
    },
    pulse(): void {
      if (prefersReducedMotion()) return;
      gsap.fromTo(assembly.scale, { x: 1.025, y: 1.02, z: 1.025 }, { x: 1, y: 1, z: 1, duration: 0.75, ease: 'power3.out' });
    },
    setProcess(on: boolean): void {
      processGroup.visible = on && !prefersReducedMotion();
    },
    idle(dt: number): void {
      elapsed += dt;
      group.rotation.y = Math.sin(elapsed * 0.12) * 0.055;
      if (processGroup.visible) {
        processGroup.position.y = Math.sin(elapsed * 2.4) * 0.025;
      }
    },
    dispose(): void {
      disposeGroup(assembly);
      disposeGroup(processGroup);
      deck.geometry.dispose(); deckMat.dispose();
      tileMat.dispose();
      metalMat.dispose(); glassMat.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Commercial                                                         */
/* ------------------------------------------------------------------ */

type CommercialType = 'storefront' | 'curtain' | 'partitions' | 'doors';
type CommercialScope = 'small' | 'medium' | 'full' | 'tower';

function commercialTypeFor(label: string): CommercialType {
  const v = label.toLowerCase();
  if (v.includes('curtain')) return 'curtain';
  if (v.includes('partition') || v.includes('office')) return 'partitions';
  if (v.includes('door') || v.includes('hardware')) return 'doors';
  return 'storefront';
}

function commercialScopeFor(label: string): CommercialScope {
  const v = label.toLowerCase();
  if (v.includes('curtain') || v.includes('multi') || v.includes('story')) return 'tower';
  if (v.includes('full')) return 'full';
  if (v.includes('medium') || v.includes('build')) return 'medium';
  return 'small';
}

function frameScaleFor(label: string): number {
  const v = label.toLowerCase();
  if (v.includes('frameless') || v.includes('minimal')) return 0.5;
  if (v.includes('thermal')) return 1.35;
  if (v.includes('stainless') || v.includes('architectural')) return 0.85;
  return 1;
}

export function createCommercialRig(): CommercialRig {
  const group = new THREE.Group();
  group.visible = false;

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x122238, roughness: 0.72, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 2.4), floorMat);
  floor.position.y = 0.02;
  group.add(floor);

  const assembly = new THREE.Group();
  group.add(assembly);
  const processGroup = new THREE.Group();
  processGroup.visible = false;
  group.add(processGroup);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xcfd8df, roughness: 0.28, metalness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.5, metalness: 0.25 });
  const glassMat = makeGlassMaterial();
  const sealMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.36 });
  let type: CommercialType = 'storefront';
  let scope: CommercialScope = 'medium';
  let glassLabel = 'Clear Insulated';
  let frameScale = 1;
  let solidity = 0.18;
  let elapsed = 0;

  function profile(): number {
    return 0.045 * frameScale;
  }

  function frameBox(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    assembly.add(mesh);
  }

  function glassPane(w: number, h: number, x: number, y: number, z: number, rotY = 0): void {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.018), glassMat);
    pane.position.set(x, y, z);
    pane.rotation.y = rotY;
    pane.renderOrder = 2;
    assembly.add(pane);
    const edge = lineBox(w, h, 0.02);
    edge.position.copy(pane.position);
    edge.rotation.y = rotY;
    assembly.add(edge);
  }

  function addVertical(x: number, y1: number, y2: number, z: number, rotY = 0): void {
    frameBox(profile(), y2 - y1, 0.08, x, (y1 + y2) / 2, z, rotY);
  }

  function addHorizontal(x1: number, x2: number, y: number, z: number, rotY = 0): void {
    frameBox(x2 - x1 + profile(), profile(), 0.08, (x1 + x2) / 2, y, z, rotY);
  }

  function addGlassOpening(x1: number, x2: number, y1: number, y2: number, z: number, rotY = 0): void {
    const inset = profile() * 1.35;
    const w = Math.max(0.08, x2 - x1 - inset * 2);
    const h = Math.max(0.08, y2 - y1 - inset * 2);
    glassPane(w, h, (x1 + x2) / 2, (y1 + y2) / 2, z, rotY);
  }

  function addDoorLeaf(x1: number, x2: number, y1: number, y2: number, handleSide: 'left' | 'right'): void {
    addGlassOpening(x1, x2, y1, y2, 0.36);
    const leafX = (x1 + x2) / 2;
    frameBox(x2 - x1, profile() * 0.85, 0.09, leafX, y1 + 0.08, 0.385);
    frameBox(x2 - x1, profile() * 0.85, 0.09, leafX, y2 - 0.08, 0.385);
    const handleX = handleSide === 'right' ? x2 - 0.12 : x1 + 0.12;
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 12), frameMat);
    pull.position.set(handleX, (y1 + y2) / 2, 0.43);
    assembly.add(pull);
    const closer = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.055), frameMat);
    closer.position.set(leafX, y2 - 0.11, 0.43);
    assembly.add(closer);
  }

  function storefrontWidth(): number {
    if (scope === 'small') return 2.75;
    if (scope === 'full' || scope === 'tower') return 4.1;
    return 3.55;
  }

  function buildStorefront(): void {
    const w = storefrontWidth();
    const left = -w / 2;
    const right = w / 2;
    const sill = 0.14;
    const transom = 1.42;
    const head = 2.08;
    const doorW = Math.min(0.64, w * 0.18);
    const xs = [left, -doorW, 0, doorW, right];

    addHorizontal(left, right, sill, 0.36);
    addHorizontal(left, right, transom, 0.36);
    addHorizontal(left, right, head, 0.36);
    xs.forEach((x) => addVertical(x, sill, head, 0.36));

    // Lower side lites and paired entrance doors.
    addGlassOpening(xs[0], xs[1], sill, transom, 0.36);
    addDoorLeaf(xs[1], xs[2], sill, transom, 'right');
    addDoorLeaf(xs[2], xs[3], sill, transom, 'left');
    addGlassOpening(xs[3], xs[4], sill, transom, 0.36);

    // Separate transom lites per bay, not one sheet behind the mullions.
    for (let i = 0; i < xs.length - 1; i++) addGlassOpening(xs[i], xs[i + 1], transom, head, 0.36);

    const threshold = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.035, 0.12), darkMat);
    threshold.position.set(0, sill - 0.055, 0.38);
    assembly.add(threshold);
  }

  function buildCurtainWall(): void {
    const levels = scope === 'tower' ? 4 : 3;
    const cols = scope === 'small' ? 3 : 4;
    const w = 3.1;
    const h = 2.45;
    const left = -w / 2;
    const right = w / 2;
    const bottom = 0.1;
    const bayH = (h - bottom) / levels;
    for (let c = 0; c <= cols; c++) addVertical(left + (w / cols) * c, bottom, h, 0.36);
    for (let r = 0; r <= levels; r++) addHorizontal(left, right, bottom + bayH * r, 0.36);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < levels; r++) {
        addGlassOpening(left + (w / cols) * c, left + (w / cols) * (c + 1), bottom + bayH * r, bottom + bayH * (r + 1), 0.36);
      }
    }
  }

  function buildPartitions(): void {
    const left = -1.45;
    const right = 1.35;
    const sill = 0.12;
    const head = 1.72;
    const doorLeft = -0.18;
    const doorRight = 0.5;
    [left, doorLeft, doorRight, right].forEach((x) => addVertical(x, sill, head, 0.36));
    addHorizontal(left, right, sill, 0.36);
    addHorizontal(left, right, head, 0.36);
    addGlassOpening(left, doorLeft, sill, head, 0.36);
    addDoorLeaf(doorLeft, doorRight, sill, head, 'right');
    addGlassOpening(doorRight, right, sill, head, 0.36);

    const returnX = right;
    const returnZ1 = -1.16;
    const returnZ2 = -0.16;
    frameBox(profile(), head - sill, 0.07, returnX, (sill + head) / 2, returnZ1, Math.PI / 2);
    frameBox(profile(), head - sill, 0.07, returnX, (sill + head) / 2, returnZ2, Math.PI / 2);
    frameBox(returnZ2 - returnZ1 + profile(), profile(), 0.07, returnX, sill, (returnZ1 + returnZ2) / 2, Math.PI / 2);
    frameBox(returnZ2 - returnZ1 + profile(), profile(), 0.07, returnX, head, (returnZ1 + returnZ2) / 2, Math.PI / 2);
    glassPane(0.86, head - sill - profile() * 2.7, returnX, (sill + head) / 2, -0.66, Math.PI / 2);
  }

  function buildDoors(): void {
    const left = -1.1;
    const right = 1.1;
    const sill = 0.12;
    const head = 1.88;
    for (const x of [left, 0, right]) addVertical(x, sill, head, 0.36);
    addHorizontal(left, right, sill, 0.36);
    addHorizontal(left, right, head, 0.36);
    addDoorLeaf(left, 0, sill, head, 'right');
    addDoorLeaf(0, right, sill, head, 'left');
    const panic = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.82, 12), frameMat);
    panic.rotation.z = Math.PI / 2;
    panic.position.set(0, 0.82, 0.43);
    assembly.add(panic);
  }

  function applyImpactDetails(): void {
    const impact = /impact|hurricane|laminated/i.test(glassLabel);
    if (!impact) return;
    for (const obj of assembly.children) {
      const mesh = obj as THREE.Mesh;
      if (mesh.material !== glassMat) continue;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.012, 0.01), sealMat);
      stripe.position.copy(mesh.position);
      stripe.position.z += 0.025;
      stripe.rotation.z = 0.28;
      assembly.add(stripe);
    }
  }

  function build(animate: boolean): void {
    disposeGroup(assembly, new Set([frameMat, darkMat, glassMat, sealMat]));
    if (type === 'curtain') buildCurtainWall();
    else if (type === 'partitions') buildPartitions();
    else if (type === 'doors') buildDoors();
    else buildStorefront();
    applyGlassLook(glassMat, glassLabel, solidity, false);
    applyImpactDetails();
    if (animate && !prefersReducedMotion()) {
      assembly.children.forEach((child, i) => {
        child.scale.set(0.001, 0.001, 0.001);
        gsap.to(child.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(1.9)', delay: i * 0.025 });
      });
    }
  }

  function buildProcess(): void {
    disposeGroup(processGroup);
    const blueprintMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.9), blueprintMat);
    sheet.position.set(-1.65, 1.35, 0.2);
    sheet.rotation.y = -0.25;
    processGroup.add(sheet);
    const stamp = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 42), blueprintMat);
    stamp.position.set(1.35, 1.55, 0.28);
    processGroup.add(stamp);
  }

  build(false);
  buildProcess();

  return {
    group,
    setProjectType(label: string): void {
      type = commercialTypeFor(label);
      build(true);
    },
    setGlass(label: string): void {
      glassLabel = label;
      build(true);
    },
    setFraming(label: string): void {
      frameScale = frameScaleFor(label);
      applyMetalLook(frameMat, label, true);
      build(true);
    },
    setScope(label: string): void {
      scope = commercialScopeFor(label);
      build(true);
    },
    setSolidity(t: number): void {
      const target = Math.max(0, Math.min(1, t));
      if (prefersReducedMotion()) {
        solidity = target;
        applyGlassLook(glassMat, glassLabel, solidity, false);
        return;
      }
      gsap.to({ s: solidity }, {
        s: target,
        duration: 1,
        ease: 'power2.inOut',
        onUpdate(this: gsap.core.Tween) {
          solidity = (this.targets()[0] as { s: number }).s;
          applyGlassLook(glassMat, glassLabel, solidity, false);
        },
      });
    },
    pulse(): void {
      if (prefersReducedMotion()) return;
      gsap.fromTo(assembly.scale, { x: 1.02, y: 1.018, z: 1.02 }, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'power3.out' });
    },
    setProcess(on: boolean): void {
      processGroup.visible = on && !prefersReducedMotion();
    },
    idle(dt: number): void {
      elapsed += dt;
      group.rotation.y = Math.sin(elapsed * 0.1) * 0.05;
      if (processGroup.visible) processGroup.rotation.y = Math.sin(elapsed * 0.7) * 0.08;
    },
    dispose(): void {
      disposeGroup(assembly);
      disposeGroup(processGroup);
      floor.geometry.dispose(); floorMat.dispose();
      frameMat.dispose(); darkMat.dispose(); glassMat.dispose(); sealMat.dispose();
    },
  };
}
