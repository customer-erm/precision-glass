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

  const { mesh: ring, mat: ringMat } = makeGlowRing(0x9fd8ff);
  ring.scale.set(1.25, 0.7, 1);
  group.add(ring);

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

  function frameBox(w: number, h: number, d: number, x: number, y: number, z: number): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    mesh.position.set(x, y, z);
    assembly.add(mesh);
  }

  function glassPane(w: number, h: number, x: number, y: number, z: number): void {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.024), glassMat);
    pane.position.set(x, y, z);
    pane.renderOrder = 2;
    assembly.add(pane);
    const edge = lineBox(w, h, 0.026);
    edge.position.copy(pane.position);
    assembly.add(edge);
  }

  function addDoor(x: number, y: number, h = 1.7): void {
    glassPane(0.48, h, x, y, 0.36);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 12), frameMat);
    pull.position.set(x + 0.16, y, 0.41);
    assembly.add(pull);
    const closer = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.055), frameMat);
    closer.position.set(x, y + h / 2 - 0.1, 0.42);
    assembly.add(closer);
  }

  function addScopeGhosts(): void {
    const count = scope === 'small' ? 0 : scope === 'medium' ? 1 : scope === 'full' ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const ghost = lineBox(0.72, 1.55 + i * 0.12, 0.035, 0x8fe5ff);
      ghost.position.set(1.95 + i * 0.34, 0.92 + i * 0.06, 0.36);
      (ghost.material as THREE.LineBasicMaterial).opacity = 0.28;
      assembly.add(ghost);
    }
  }

  function buildStorefront(): void {
    const fw = 0.045 * frameScale;
    frameBox(3.35, fw, 0.08, 0, 1.83, 0.36);
    frameBox(3.35, fw, 0.08, 0, 0.08, 0.36);
    for (const x of [-1.7, -0.58, 0.58, 1.7]) frameBox(fw, 1.78, 0.08, x, 0.95, 0.36);
    frameBox(3.35, fw, 0.08, 0, 1.35, 0.36);
    glassPane(0.94, 1.15, -1.13, 0.72, 0.36);
    addDoor(-0.28, 0.78, 1.38);
    addDoor(0.28, 0.78, 1.38);
    glassPane(0.94, 1.15, 1.13, 0.72, 0.36);
    glassPane(3.1, 0.38, 0, 1.58, 0.36);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.045), darkMat);
    sign.position.set(0, 2.05, 0.32);
    assembly.add(sign);
    addScopeGhosts();
  }

  function buildCurtainWall(): void {
    const levels = scope === 'tower' ? 4 : 3;
    const cols = scope === 'small' ? 3 : 4;
    const fw = 0.038 * frameScale;
    const w = 3.1;
    const h = 2.45;
    frameBox(w, fw, 0.08, 0, 0.1, 0.36);
    frameBox(w, fw, 0.08, 0, h, 0.36);
    for (let c = 0; c <= cols; c++) frameBox(fw, h, 0.08, -w / 2 + (w / cols) * c, h / 2, 0.36);
    for (let r = 0; r <= levels; r++) frameBox(w, fw, 0.08, 0, 0.1 + ((h - 0.1) / levels) * r, 0.36);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < levels; r++) {
        glassPane(w / cols - fw * 2, (h - 0.15) / levels - fw * 2, -w / 2 + (w / cols) * (c + 0.5), 0.22 + ((h - 0.15) / levels) * (r + 0.5), 0.36);
      }
    }
  }

  function buildPartitions(): void {
    const fw = 0.03 * frameScale;
    glassPane(2.1, 1.45, -0.35, 0.85, 0.36);
    glassPane(1.25, 1.45, 0.95, 0.85, -0.24);
    assembly.children[assembly.children.length - 2]?.rotateY?.(Math.PI / 2);
    assembly.children[assembly.children.length - 1]?.rotateY?.(Math.PI / 2);
    frameBox(2.2, fw, 0.07, -0.35, 1.58, 0.36);
    frameBox(2.2, fw, 0.07, -0.35, 0.12, 0.36);
    frameBox(fw, 1.48, 0.07, -1.45, 0.85, 0.36);
    frameBox(fw, 1.48, 0.07, 0.75, 0.85, 0.36);
    addDoor(0.15, 0.78, 1.28);
  }

  function buildDoors(): void {
    const fw = 0.05 * frameScale;
    frameBox(2.15, fw, 0.08, 0, 1.88, 0.36);
    frameBox(fw, 1.82, 0.08, -1.1, 0.98, 0.36);
    frameBox(fw, 1.82, 0.08, 1.1, 0.98, 0.36);
    addDoor(-0.27, 0.88, 1.62);
    addDoor(0.27, 0.88, 1.62);
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
      gsap.fromTo(ringMat, { opacity: 0.95 }, { opacity: 0.52, duration: 0.9, ease: 'power2.out' });
      gsap.fromTo(ring.scale, { x: 1.38, y: 0.8 }, { x: 1.25, y: 0.7, duration: 0.8, ease: 'power3.out' });
    },
    setProcess(on: boolean): void {
      processGroup.visible = on && !prefersReducedMotion();
    },
    idle(dt: number): void {
      elapsed += dt;
      group.rotation.y = Math.sin(elapsed * 0.1) * 0.05;
      ring.rotation.z = elapsed * 0.055;
      if (processGroup.visible) processGroup.rotation.y = Math.sin(elapsed * 0.7) * 0.08;
    },
    dispose(): void {
      disposeGroup(assembly);
      disposeGroup(processGroup);
      floor.geometry.dispose(); floorMat.dispose();
      ring.geometry.dispose(); ringMat.dispose();
      frameMat.dispose(); darkMat.dispose(); glassMat.dispose(); sealMat.dispose();
    },
  };
}
