import './shower-studio.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createShowerRig,
  DEFAULT_SHOWER_TUNING,
  readSavedShowerDesigns,
  SHOWER_DESIGNS_STORAGE_KEY,
  type SavedShowerDesign,
  type ShowerModelTuning,
  type ShowerRig,
} from '../experience/shower-model';

type TuningKey = keyof ShowerModelTuning;

const STORAGE_KEY = 'pg:shower-model-studio';

const ENCLOSURES = [
  'Single Door',
  'Door + Panel',
  '90 Corner',
  'Neo-Angle',
  'Frameless Slider',
  'Splash Panel',
  'Steam Shower',
  'Custom Layout',
];

const GLASS = ['Clear Glass', 'Frosted Glass', 'Rain Glass'];
const FINISHES = ['Polished Chrome', 'Brushed Nickel', 'Matte Black', 'Polished Brass', 'Satin Brass'];
const HANDLES = ['Pull Handle', 'U-Handle', 'Ladder Pull', 'Knob'];
const EXTRAS = ['None', 'Grid Patterns', 'Steam Upgrade', 'Grid Patterns + Steam Upgrade'];

const CONTROL_GROUPS: Array<{
  title: string;
  controls: Array<{ key: TuningKey; label: string; min: number; max: number; step: number; unit?: string }>;
}> = [
  {
    title: 'Clips and Hinges',
    controls: [
      { key: 'clipScale', label: 'Clip face size', min: 0.35, max: 1.25, step: 0.01 },
      { key: 'clipDepth', label: 'Clip projection', min: 0.25, max: 1.2, step: 0.01 },
      { key: 'clipBevel', label: 'Connector bevel', min: 0.001, max: 0.024, step: 0.001, unit: 'm' },
      { key: 'hingeScale', label: 'Hinge size', min: 0.35, max: 1.25, step: 0.01 },
    ],
  },
  {
    title: 'Slider Rail',
    controls: [
      { key: 'sliderFixedPanelZ', label: 'Fixed glass plane', min: 0.56, max: 0.82, step: 0.002, unit: 'm' },
      { key: 'sliderDoorPanelZ', label: 'Sliding glass plane', min: 0.58, max: 0.88, step: 0.002, unit: 'm' },
      { key: 'sliderFixedEndX', label: 'Fixed panel end', min: -0.25, max: 0.35, step: 0.005, unit: 'm' },
      { key: 'sliderDoorStartX', label: 'Door start', min: -0.3, max: 0.2, step: 0.005, unit: 'm' },
      { key: 'sliderDoorEndX', label: 'Door end', min: 0.38, max: 0.82, step: 0.005, unit: 'm' },
      { key: 'railCenterX', label: 'Rail center', min: -0.2, max: 0.2, step: 0.005, unit: 'm' },
      { key: 'railLength', label: 'Rail length', min: 1.1, max: 1.8, step: 0.005, unit: 'm' },
      { key: 'railDiameter', label: 'Rail diameter', min: 0.012, max: 0.052, step: 0.001, unit: 'm' },
      { key: 'railYOffset', label: 'Rail height', min: -0.16, max: 0.04, step: 0.002, unit: 'm' },
      { key: 'railProjection', label: 'Rail projection', min: 0.04, max: 0.22, step: 0.002, unit: 'm' },
      { key: 'wallBracketScale', label: 'Wall bracket size', min: 0.35, max: 1.35, step: 0.01 },
      { key: 'hangerScale', label: 'Hanger size', min: 0.35, max: 1.35, step: 0.01 },
      { key: 'hangerDrop', label: 'Hanger drop', min: 0.045, max: 0.22, step: 0.002, unit: 'm' },
      { key: 'hangerProjection', label: 'Hanger projection', min: -0.04, max: 0.12, step: 0.002, unit: 'm' },
      { key: 'rollerStartX', label: 'First roller position', min: -0.1, max: 0.28, step: 0.005, unit: 'm' },
      { key: 'rollerScale', label: 'Roller size', min: 0.45, max: 1.35, step: 0.01 },
      { key: 'rollerSpread', label: 'Roller spacing', min: 0.22, max: 0.62, step: 0.01, unit: 'm' },
      { key: 'rollerProjection', label: 'Roller projection', min: -0.02, max: 0.14, step: 0.002, unit: 'm' },
      { key: 'rollerYOffset', label: 'Roller height offset', min: -0.035, max: 0.04, step: 0.002, unit: 'm' },
      { key: 'floorGuideScale', label: 'Floor guide size', min: 0.35, max: 1.35, step: 0.01 },
      { key: 'floorGuideX', label: 'Floor guide position', min: -0.1, max: 0.42, step: 0.005, unit: 'm' },
      { key: 'floorGuideProjection', label: 'Floor guide projection', min: -0.06, max: 0.08, step: 0.002, unit: 'm' },
    ],
  },
  {
    title: 'Light and Material',
    controls: [
      { key: 'metalRoughnessScale', label: 'Metal roughness', min: 0.25, max: 1.8, step: 0.01 },
      { key: 'metalEnv', label: 'Metal reflection', min: 0.3, max: 3.2, step: 0.05 },
      { key: 'glassOpacityScale', label: 'Glass visibility', min: 0.35, max: 1.45, step: 0.01 },
      { key: 'glassEnv', label: 'Glass reflection', min: 0.5, max: 3.8, step: 0.05 },
    ],
  },
];

interface StudioState {
  enclosure: string;
  glass: string;
  finish: string;
  handle: string;
  extras: string;
  tuning: ShowerModelTuning;
}

function loadState(): StudioState {
  const base: StudioState = {
    enclosure: 'Door + Panel',
    glass: 'Clear Glass',
    finish: 'Polished Chrome',
    handle: 'Pull Handle',
    extras: 'None',
    tuning: { ...DEFAULT_SHOWER_TUNING },
  };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return base;
    const parsed = JSON.parse(saved) as Partial<StudioState>;
    return {
      ...base,
      ...parsed,
      tuning: { ...DEFAULT_SHOWER_TUNING, ...(parsed.tuning || {}) },
    };
  } catch {
    return base;
  }
}

function saveState(state: StudioState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function writeSavedDesigns(designs: SavedShowerDesign[]): void {
  localStorage.setItem(SHOWER_DESIGNS_STORAGE_KEY, JSON.stringify(designs));
}

function saveDesignToSystem(state: StudioState): SavedShowerDesign {
  const name = window.prompt('Name this shower design', state.enclosure) || state.enclosure;
  const design: SavedShowerDesign = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    enclosure: state.enclosure,
    glass: state.glass,
    finish: state.finish,
    handle: state.handle,
    extras: state.extras,
    tuning: { ...state.tuning },
    updatedAt: new Date().toISOString(),
  };
  const designs = readSavedShowerDesigns().filter((item) => item.enclosure !== state.enclosure);
  designs.push(design);
  writeSavedDesigns(designs);
  return design;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  return node;
}

function makeSelect(label: string, options: string[], value: string, onChange: (value: string) => void): HTMLElement {
  const wrap = el('label', { className: 'studio-field' });
  wrap.append(el('span', { textContent: label }));
  const select = el('select');
  for (const option of options) {
    const opt = el('option', { value: option, textContent: option });
    if (option === value) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

function makeRange(
  key: TuningKey,
  label: string,
  state: StudioState,
  min: number,
  max: number,
  step: number,
  onInput: () => void,
  unit = '',
): HTMLElement {
  const wrap = el('label', { className: 'studio-range' });
  const row = el('span', { className: 'studio-range-label' });
  const name = el('span', { textContent: label });
  const value = el('output', { textContent: `${state.tuning[key].toFixed(step < 0.01 ? 3 : 2)}${unit}` });
  row.append(name, value);
  const input = el('input') as HTMLInputElement;
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(state.tuning[key]);
  input.addEventListener('input', () => {
    state.tuning[key] = Number(input.value);
    value.textContent = `${state.tuning[key].toFixed(step < 0.01 ? 3 : 2)}${unit}`;
    onInput();
  });
  wrap.append(row, input);
  return wrap;
}

function applyState(rig: ShowerRig, state: StudioState): void {
  rig.setEnclosure(state.enclosure);
  rig.setGlass(state.glass);
  rig.setHardware(state.finish);
  rig.setHandle(state.handle);
  rig.setExtras(state.extras === 'None' ? 'none' : state.extras);
  rig.setModelTuning(state.tuning);
  rig.setSolidity(1);
}

function updateJson(out: HTMLElement, state: StudioState): void {
  out.textContent = JSON.stringify(state, null, 2);
}

function renderSavedDesigns(list: HTMLElement): void {
  const designs = readSavedShowerDesigns();
  list.replaceChildren();
  if (!designs.length) {
    list.append(el('p', { textContent: 'No saved shower designs yet.' }));
    return;
  }
  for (const design of designs.slice().reverse()) {
    const row = el('div', { className: 'studio-saved-row' });
    const meta = el('div');
    meta.append(
      el('strong', { textContent: design.name }),
      el('span', { textContent: `${design.enclosure} - ${new Date(design.updatedAt).toLocaleString()}` }),
    );
    const load = el('button', { type: 'button', textContent: 'Load' });
    load.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enclosure: design.enclosure,
        glass: design.glass,
        finish: design.finish,
        handle: design.handle,
        extras: design.extras,
        tuning: design.tuning,
      }));
      window.location.reload();
    });
    const remove = el('button', { type: 'button', textContent: 'Delete' });
    remove.addEventListener('click', () => {
      writeSavedDesigns(readSavedShowerDesigns().filter((item) => item.id !== design.id));
      renderSavedDesigns(list);
    });
    row.append(meta, load, remove);
    list.append(row);
  }
}

export function mountShowerModelStudio(host: HTMLElement): void {
  const state = loadState();
  host.replaceChildren();
  document.body.classList.add('shower-studio-body');

  const root = el('section', { className: 'shower-studio' });
  const viewport = el('div', { className: 'studio-viewport' });
  const panel = el('aside', { className: 'studio-panel' });

  const header = el('header', { className: 'studio-topbar' });
  header.append(
    el('div', { innerHTML: '<strong>Shower Model Studio</strong><span>Procedural hardware tuning for the live tour model</span>' }),
  );
  const home = el('a', { className: 'studio-home', href: '/', textContent: 'Back to site' });
  header.append(home);

  const stageShell = el('div', { className: 'studio-stage-shell' });
  stageShell.append(viewport);
  const hint = el('div', { className: 'studio-hint', textContent: 'Drag to orbit. Scroll to zoom. Right-drag to pan.' });
  stageShell.append(hint);

  const title = el('div', { className: 'studio-panel-title' });
  title.append(el('strong', { textContent: 'Model Controls' }), el('span', { textContent: 'Adjust the exact hardware proportions and shine.' }));
  panel.append(title);

  const rigSection = el('section', { className: 'studio-section' });
  rigSection.append(
    makeSelect('Shower style', ENCLOSURES, state.enclosure, (value) => {
      state.enclosure = value;
      applyState(rig, state);
      saveState(state);
      updateJson(json, state);
    }),
    makeSelect('Glass', GLASS, state.glass, (value) => {
      state.glass = value;
      applyState(rig, state);
      saveState(state);
      updateJson(json, state);
    }),
    makeSelect('Finish', FINISHES, state.finish, (value) => {
      state.finish = value;
      applyState(rig, state);
      saveState(state);
      updateJson(json, state);
    }),
    makeSelect('Handle', HANDLES, state.handle, (value) => {
      state.handle = value;
      applyState(rig, state);
      saveState(state);
      updateJson(json, state);
    }),
    makeSelect('Upgrade overlay', EXTRAS, state.extras, (value) => {
      state.extras = value;
      applyState(rig, state);
      saveState(state);
      updateJson(json, state);
    }),
  );
  panel.append(rigSection);

  const json = el('pre', { className: 'studio-json' });
  const applyTuning = () => {
    rig.setModelTuning(state.tuning);
    rig.setGlass(state.glass);
    rig.setHardware(state.finish);
    rig.setExtras(state.extras === 'None' ? 'none' : state.extras);
    rig.setSolidity(1);
    saveState(state);
    updateJson(json, state);
  };

  for (const group of CONTROL_GROUPS) {
    const section = el('section', { className: 'studio-section' });
    section.append(el('h2', { textContent: group.title }));
    for (const control of group.controls) {
      section.append(makeRange(control.key, control.label, state, control.min, control.max, control.step, applyTuning, control.unit));
    }
    panel.append(section);
  }

  const actions = el('div', { className: 'studio-actions' });
  const save = el('button', { type: 'button', textContent: 'Save to system' });
  const savedList = el('div', { className: 'studio-saved-list' });
  save.addEventListener('click', () => {
    saveDesignToSystem(state);
    renderSavedDesigns(savedList);
    save.textContent = 'Saved';
    setTimeout(() => { save.textContent = 'Save to system'; }, 1100);
  });
  const reset = el('button', { type: 'button', textContent: 'Reset tuning' });
  reset.addEventListener('click', () => {
    state.tuning = { ...DEFAULT_SHOWER_TUNING };
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
  const copy = el('button', { type: 'button', textContent: 'Copy preset JSON' });
  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(JSON.stringify(state, null, 2));
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = 'Copy preset JSON'; }, 1100);
  });
  actions.append(save, reset, copy);
  const savedSection = el('section', { className: 'studio-section studio-saved-section' });
  savedSection.append(el('h2', { textContent: 'Saved tour designs' }), savedList);
  renderSavedDesigns(savedList);
  panel.append(actions, savedSection, json);

  root.append(header, stageShell, panel);
  host.append(root);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewport.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d12);
  scene.fog = new THREE.FogExp2(0x090d12, 0.035);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 80);
  camera.position.set(1.32, 1.5, 4.35);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.02, 1.12, 0.55);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.45;
  controls.maxDistance = 8;
  controls.update();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xd8ecff, 0x1a2028, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 3.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0x91d6ff, 36, 12);
  rim.position.set(-3.2, 2.4, -2.6);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffd4a3, 18, 10);
  warm.position.set(2.2, 1.3, 2.4);
  scene.add(warm);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.8, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x151a20,
      roughness: 0.32,
      metalness: 0.08,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const grid = new THREE.GridHelper(8, 32, 0x4b6175, 0x252c35);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.22;
  scene.add(grid);

  const rig = createShowerRig({ cheapGlass: false });
  rig.group.position.set(0, 0, 0);
  scene.add(rig.group);
  applyState(rig, state);
  updateJson(json, state);

  const resize = () => {
    const w = viewport.clientWidth || 1;
    const h = viewport.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(viewport);
  resize();

  let disposed = false;
  function tick(): void {
    if (disposed) return;
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  window.addEventListener('beforeunload', () => {
    disposed = true;
    ro.disconnect();
    controls.dispose();
    rig.dispose();
    renderer.dispose();
    env.dispose();
  }, { once: true });
}
