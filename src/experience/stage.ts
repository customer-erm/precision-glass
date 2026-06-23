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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from '../animations/engine';
import { isLowPowerDevice, prefersReducedMotion } from './flag';
import { createShowerRig, makeStudioEnvTexture, type ShowerRig } from './shower-model';
import { createCommercialRig, createRailingRig, type CommercialRig, type RailingRig } from './service-models';
import type { ServiceType } from '../animations/slideshow';

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
  railings: RailingRig;
  commercial: CommercialRig;
  setService(service: ServiceType): void;
  moveCamera(spec: CameraSpec, duration?: number): void;
  /** Finale: dolly straight through the glass. Resolves at the moment of pass-through. */
  pushThroughGlass(): Promise<void>;
  /** Re-home the canvas into a new container (used by the pre-warm flow). */
  adopt(host: HTMLElement): void;
  setActive(active: boolean): void;
  dispose(): void;
}

const NAVY = 0x050d1a;

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

export function createStage(initialContainer: HTMLElement): Stage {
  let container = initialContainer;
  const lowPower = isLowPowerDevice();

  // preserveDrawingBuffer lets us snapshot the live 3D render (canvas.toDataURL)
  // for the printable proposal at any time, not just within a single frame.
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.3 : 1.75));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'stage-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  scene.fog = new THREE.FogExp2(NAVY, 0.048);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
  const lookTarget = new THREE.Vector3(0, 1.1, 0);
  camera.position.set(0, 2.2, 9);
  camera.lookAt(lookTarget);

  // Hands-on inspection: drag to orbit, wheel/pinch to zoom, right-drag /
  // two-finger to pan. The DOM slides pass pointer events through to the
  // canvas wherever there's no content. A scripted camera move (station
  // dolly) takes the wheel back until the user grabs it again.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target = lookTarget;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 2.0;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.52;
  let userDriving = false;
  let cameraTweening = false;
  controls.addEventListener('start', () => {
    userDriving = true;
    cameraTweening = false;
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(lookTarget);
    gsap.killTweensOf(camera);
  });

  // Environment for glass + metal reflections — a high-contrast studio map
  // (bright window bars on a dark room) so the glass picks up crisp streaks.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSrc = makeStudioEnvTexture();
  envSrc.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(envSrc).texture;
  envSrc.dispose();
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

  scene.add(new THREE.AmbientLight(0x32507a, 0.5));
  const key = new THREE.DirectionalLight(0xeaf4ff, 2.9);
  key.position.set(4, 7, 5);
  key.castShadow = !lowPower;
  key.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.00035;
  scene.add(key);
  const rim = new THREE.PointLight(0x5fd4ff, 34, 24);
  rim.position.set(-4.5, 3.2, -3);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffd9a8, 8, 16);
  warm.position.set(3.5, 1.2, 3.5);
  scene.add(warm);
  const glassStrip = new THREE.PointLight(0xf7fbff, 18, 10);
  glassStrip.position.set(-1.8, 2.4, 3.6);
  scene.add(glassStrip);
  // Cool dramatic key spot raking across the glass from the front-right
  const spot = new THREE.SpotLight(0x9cc8ff, 32, 30, 0.5, 0.9, 1.2);
  spot.position.set(3.2, 6.2, 5.5);
  spot.target.position.set(0, 1.1, 0);
  spot.castShadow = !lowPower;
  spot.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
  spot.shadow.bias = -0.00025;
  scene.add(spot, spot.target);

  // Bright, tight glint that rakes across the glass face to give frameless
  // panes a clean specular streak (the env map alone is intentionally subtle
  // now that the glass uses real transmission).
  const glassGlint = new THREE.SpotLight(0xffffff, 34, 14, 0.28, 0.5, 1.3);
  glassGlint.position.set(-2.6, 3.1, 3.2);
  glassGlint.target.position.set(0.25, 1.2, 0.62);
  scene.add(glassGlint, glassGlint.target);

  // A second soft highlight from the opposite front side so the streak reads
  // from either orbit angle.
  const glassGlint2 = new THREE.SpotLight(0xeaf4ff, 20, 14, 0.3, 0.6, 1.4);
  glassGlint2.position.set(3.0, 2.9, 3.0);
  glassGlint2.target.position.set(-0.2, 1.2, 0.62);
  scene.add(glassGlint2, glassGlint2.target);

  /* ---- Product rigs on the shared pedestal ---- */

  const shower = createShowerRig({ cheapGlass: lowPower });
  const railings = createRailingRig();
  const commercial = createCommercialRig();
  scene.add(shower.group);
  scene.add(railings.group);
  scene.add(commercial.group);

  function setService(service: ServiceType): void {
    shower.group.visible = service === 'showers';
    railings.group.visible = service === 'railings';
    commercial.group.visible = service === 'commercial';
  }
  setService('showers');

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart: { x: number; y: number } | null = null;

  function updatePointer(e: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  function onPointerDown(e: PointerEvent): void {
    pointerStart = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: PointerEvent): void {
    if (!pointerStart || !shower.group.visible) { pointerStart = null; return; }
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.hypot(dx, dy) > 6) return;
    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);
    if (shower.tryToggleDoor(raycaster)) {
      userDriving = false;
      cameraTweening = false;
    }
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

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
    if (shower.group.visible) shower.idle(dt);
    if (railings.group.visible) railings.idle(dt);
    if (commercial.group.visible) commercial.idle(dt);
    if (userDriving && !cameraTweening) controls.update();
    else camera.lookAt(lookTarget);
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
    userDriving = false; // scripted move takes the wheel back
    if (prefersReducedMotion()) {
      camera.position.copy(pos);
      lookTarget.copy(target);
      return;
    }
    cameraTweening = true;
    gsap.to(camera.position, {
      x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power3.inOut', overwrite: 'auto',
      onComplete: () => { cameraTweening = false; },
    });
    gsap.to(lookTarget, { x: target.x, y: target.y, z: target.z, duration, ease: 'power3.inOut', overwrite: 'auto' });
    if (camera.fov !== 42) {
      gsap.to(camera, { fov: 42, duration, ease: 'power3.inOut', overwrite: 'auto', onUpdate: () => camera.updateProjectionMatrix() });
    }
  }

  function pushThroughGlass(): Promise<void> {
    return new Promise((resolve) => {
      if (prefersReducedMotion()) { resolve(); return; }
      userDriving = false;
      cameraTweening = true;
      const tl = gsap.timeline({ onComplete: () => { cameraTweening = false; } });
      // Line up straight-on, then dolly through the front glass.
      tl.to(lookTarget, { x: 0, y: 1.15, z: 0, duration: 0.7, ease: 'power2.inOut' }, 0)
        .to(camera.position, { x: 0, y: 1.3, z: 4.2, duration: 0.7, ease: 'power2.inOut' }, 0)
        .to(camera.position, { z: -0.4, y: 1.15, duration: 1.5, ease: 'power3.in' })
        .to(camera, { fov: 54, duration: 1.5, ease: 'power3.in', onUpdate: () => camera.updateProjectionMatrix() }, '<')
        .add(() => resolve(), '-=0.35');
    });
  }

  function adopt(host: HTMLElement): void {
    container = host;
    host.prepend(renderer.domElement);
    resize();
  }

  function dispose(): void {
    disposed = true;
    window.removeEventListener('resize', resize);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    controls.dispose();
    shower.dispose();
    railings.dispose();
    commercial.dispose();
    particleGeo.dispose();
    glowTex.dispose();
    scene.environment?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    canvas: renderer.domElement,
    shower,
    railings,
    commercial,
    setService,
    moveCamera,
    pushThroughGlass,
    adopt,
    setActive: (v: boolean) => { active = v; if (v) clock.getDelta(); },
    dispose,
  };
}
