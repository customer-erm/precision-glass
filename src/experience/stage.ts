/**
 * The WebGL stage — one continuous 3D space the whole tour lives inside.
 * Deep-navy atmosphere, drafting grid, drifting particles, and a product
 * pedestal where the parametric shower assembles. The camera dollies
 * between "stations" as slides change; the DOM content floats above.
 *
 * This module (and three.js with it) is only ever loaded via dynamic
 * import from the cinematic controller — landing stays light.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from '../animations/engine';
import { isLowPowerDevice, prefersReducedMotion } from './flag';
import { createShowerRig, type ShowerRig } from './shower-model';

export interface CameraSpec {
  /** Orbit angle around the pedestal in radians (0 = straight on). */
  angle: number;
  /** Distance from the look target. */
  distance: number;
  /** Camera height. */
  height: number;
  /** Shift the look target sideways so the model frames left/right of the DOM content. */
  lateral?: number;
  /** Height of the look target (default 1.1 — mid-glass). */
  targetHeight?: number;
}

export interface Stage {
  canvas: HTMLCanvasElement;
  shower: ShowerRig;
  moveCamera(spec: CameraSpec, duration?: number): void;
  /** Finale: dolly straight through the glass. Resolves at the moment of pass-through. */
  pushThroughGlass(): Promise<void>;
  /** Float the customer's bathroom photo in the scene as a soft "vision" panel. */
  setBackdropPhoto(dataUrl: string): void;
  setActive(active: boolean): void;
  dispose(): void;
}

const NAVY = 0x050d1a;

function makeSoftMaskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 170;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 85, 20, 128, 85, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 170);
  return new THREE.CanvasTexture(c);
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(125, 211, 252, 0.85)');
  g.addColorStop(0.35, 'rgba(80, 150, 220, 0.25)');
  g.addColorStop(1, 'rgba(10, 25, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createStage(container: HTMLElement): Stage {
  const lowPower = isLowPowerDevice();

  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.3 : 1.75));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.id = 'stage-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  scene.fog = new THREE.FogExp2(NAVY, 0.048);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
  const lookTarget = new THREE.Vector3(0, 1.1, 0);
  camera.position.set(0, 2.2, 9);
  camera.lookAt(lookTarget);

  // Environment for glass + metal reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  /* ---- Atmosphere ---- */

  const grid = new THREE.GridHelper(60, 120, 0x2a6a9a, 0x10283f);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.42;
  scene.add(grid);

  const particleCount = lowPower ? 140 : 380;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 26;
    positions[i * 3 + 1] = Math.random() * 8 + 0.2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 26;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color: 0x9fd8ff, size: 0.035, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(particles);

  const glowTex = makeGlowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(9, 9, 1);
  glow.position.set(0, 1.6, -2.2);
  scene.add(glow);

  /* ---- Lights ---- */

  scene.add(new THREE.AmbientLight(0x32507a, 0.65));
  const key = new THREE.DirectionalLight(0xeaf4ff, 2.3);
  key.position.set(4, 7, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0x5fd4ff, 26, 24);
  rim.position.set(-4.5, 3.2, -3);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffd9a8, 8, 16);
  warm.position.set(3.5, 1.2, 3.5);
  scene.add(warm);
  // Cool dramatic key spot raking across the glass from the front-right
  const spot = new THREE.SpotLight(0x9cc8ff, 30, 30, 0.5, 0.9, 1.2);
  spot.position.set(3.2, 6.2, 5.5);
  spot.target.position.set(0, 1.1, 0);
  scene.add(spot, spot.target);

  /* ---- Shower rig on its pedestal ---- */

  const shower = createShowerRig({ cheapGlass: lowPower });
  scene.add(shower.group);

  /* ---- Customer-photo "vision" backdrop ---- */

  let backdrop: THREE.Mesh | null = null;
  let backdropTex: THREE.Texture | null = null;
  let backdropMask: THREE.CanvasTexture | null = null;

  function setBackdropPhoto(dataUrl: string): void {
    new THREE.TextureLoader().load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (backdrop) {
        ((backdrop.material as THREE.MeshBasicMaterial).map)?.dispose();
        (backdrop.material as THREE.MeshBasicMaterial).map = tex;
        (backdrop.material as THREE.MeshBasicMaterial).needsUpdate = true;
        backdropTex = tex;
        return;
      }
      backdropTex = tex;
      backdropMask = makeSoftMaskTexture();
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        alphaMap: backdropMask,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      });
      backdrop = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.45), mat);
      backdrop.position.set(3.4, 2.9, -4.6);
      backdrop.rotation.y = -0.5;
      backdrop.renderOrder = 1;
      scene.add(backdrop);
      gsap.to(mat, { opacity: 0.34, duration: 2.2, ease: 'power2.out' });
      if (!prefersReducedMotion()) {
        gsap.to(backdrop.position, { y: 3.05, duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      }
    });
  }

  /* ---- Render loop ---- */

  let active = true;
  let disposed = false;
  const clock = new THREE.Clock();

  function resize(): void {
    const w = container.clientWidth || window.innerWidth;
    const hgt = container.clientHeight || window.innerHeight;
    renderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function tick(): void {
    if (disposed) return;
    requestAnimationFrame(tick);
    if (!active || document.hidden) return;
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    particles.rotation.y += dt * 0.012;
    glow.material.opacity = 0.42 + Math.sin(t * 0.6) * 0.08;
    shower.idle(dt);
    camera.lookAt(lookTarget);
    renderer.render(scene, camera);
  }
  tick();

  /* ---- Camera choreography ---- */

  function specToPosition(spec: CameraSpec): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const target = new THREE.Vector3(spec.lateral ?? 0, spec.targetHeight ?? 1.1, 0);
    const pos = new THREE.Vector3(
      target.x + Math.sin(spec.angle) * spec.distance,
      spec.height,
      target.z + Math.cos(spec.angle) * spec.distance,
    );
    return { pos, target };
  }

  function moveCamera(spec: CameraSpec, duration = 1.6): void {
    const { pos, target } = specToPosition(spec);
    if (prefersReducedMotion()) {
      camera.position.copy(pos);
      lookTarget.copy(target);
      return;
    }
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power3.inOut', overwrite: 'auto' });
    gsap.to(lookTarget, { x: target.x, y: target.y, z: target.z, duration, ease: 'power3.inOut', overwrite: 'auto' });
    if (camera.fov !== 42) {
      gsap.to(camera, { fov: 42, duration, ease: 'power3.inOut', overwrite: 'auto', onUpdate: () => camera.updateProjectionMatrix() });
    }
  }

  function pushThroughGlass(): Promise<void> {
    return new Promise((resolve) => {
      if (prefersReducedMotion()) { resolve(); return; }
      const tl = gsap.timeline();
      // Line up straight-on, then dolly through the front glass.
      tl.to(lookTarget, { x: 0, y: 1.15, z: 0, duration: 0.7, ease: 'power2.inOut' }, 0)
        .to(camera.position, { x: 0, y: 1.3, z: 4.2, duration: 0.7, ease: 'power2.inOut' }, 0)
        .to(camera.position, { z: -0.4, y: 1.15, duration: 1.5, ease: 'power3.in' })
        .to(camera, { fov: 54, duration: 1.5, ease: 'power3.in', onUpdate: () => camera.updateProjectionMatrix() }, '<')
        .add(() => resolve(), '-=0.35');
    });
  }

  function dispose(): void {
    disposed = true;
    window.removeEventListener('resize', resize);
    shower.dispose();
    particleGeo.dispose();
    glowTex.dispose();
    backdrop?.geometry.dispose();
    backdropTex?.dispose();
    backdropMask?.dispose();
    scene.environment?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    canvas: renderer.domElement,
    shower,
    moveCamera,
    pushThroughGlass,
    setBackdropPhoto,
    setActive: (v: boolean) => { active = v; if (v) clock.getDelta(); },
    dispose,
  };
}
