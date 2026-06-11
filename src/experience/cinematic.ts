/**
 * Cinematic controller — wraps the untouched classic slideshow engine with:
 *   - the persistent WebGL stage (lazy-loaded three.js chunk)
 *   - camera dollies between stations on every slide change
 *   - materialize/dematerialize DOM choreography
 *   - the parametric shower that assembles as choices land
 *   - the finale: push-through-the-glass into the AI render + before/after
 *
 * The DOM the classic engine builds is reused verbatim, so manual-nav's
 * click wiring and the agent tools keep working with zero changes.
 */
import * as classic from '../animations/slideshow';
import type { ServiceType } from '../animations/slideshow';
import { gsap } from '../animations/engine';
import { getBathroomPhoto } from '../utils/bathroom-photo';
import { materializeSlide, dematerializeSlide, revealRender } from './materialize';
import { onChoice, onPreview } from './events';
import { prefersReducedMotion } from './flag';
import type { Stage, CameraSpec } from './stage';
import './cinematic.css';

/* ------------------------------------------------------------------ */
/*  Camera stations                                                     */
/* ------------------------------------------------------------------ */

const ARRIVAL: CameraSpec = { angle: 0.1, distance: 12, height: 4.4 };

const SHOWER_STATIONS: Record<string, CameraSpec> = {
  intro: { angle: 0.55, distance: 7.2, height: 2.5 },
  gallery: { angle: -0.85, distance: 6.6, height: 2.0, lateral: 0.4 },
  enclosures: { angle: 0.05, distance: 5.4, height: 1.7 },
  glass: { angle: -0.5, distance: 3.7, height: 1.5 },
  hardware: { angle: 0.8, distance: 3.1, height: 1.35 },
  accessories: { angle: 1.0, distance: 2.7, height: 1.25, lateral: 0.25 },
  extras: { angle: -0.3, distance: 4.8, height: 2.3 },
  process: { angle: 0.4, distance: 6.2, height: 2.1 },
  quote: { angle: 0, distance: 4.2, height: 1.3 }, // approach before push-through
};

function stationFor(service: ServiceType, slideId: string, index: number): CameraSpec {
  if (service === 'showers' && SHOWER_STATIONS[slideId]) return SHOWER_STATIONS[slideId];
  // Railings / commercial: a slow generic orbit through the atmosphere
  return { angle: -0.9 + index * 0.32, distance: 7.5, height: 2.2 + (index % 3) * 0.4 };
}

/** Named showcase angles the voice agent can request via set_camera_view. */
const CAMERA_VIEWS: Record<string, CameraSpec> = {
  front: { angle: 0, distance: 4.4, height: 1.5 },
  side: { angle: 1.25, distance: 4.2, height: 1.5 },
  closeup: { angle: -0.45, distance: 2.3, height: 1.35 },
  overview: { angle: 0.45, distance: 7.6, height: 3.1 },
};

const SLIDE_ORDER_BY_SERVICE: Record<string, string[]> = {
  showers: ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process', 'quote'],
  railings: ['intro', 'gallery', 'rail-types', 'rail-glass', 'rail-finish', 'rail-mounting', 'process', 'quote'],
  commercial: ['intro', 'gallery', 'com-types', 'com-glass', 'com-framing', 'com-scope', 'process', 'quote'],
};

/* ------------------------------------------------------------------ */
/*  Controller state                                                    */
/* ------------------------------------------------------------------ */

let stage: Stage | null = null;
let stageLoading = false;
let pendingSpec: CameraSpec | null = null;
let unsubChoice: (() => void) | null = null;
let unsubPreview: (() => void) | null = null;
let activeServiceLocal: ServiceType = 'showers';
let pushedThrough = false;
const chosen = new Set<string>();

function root(): HTMLElement | null {
  return document.getElementById('tour-slideshow');
}

function mountStage(): void {
  if (stage || stageLoading) return;
  stageLoading = true;
  import('./stage')
    .then(({ createStage }) => {
      const host = root();
      if (!host) { stageLoading = false; return; }
      stage = createStage(host);
      stage.shower.group.visible = activeServiceLocal === 'showers';
      host.classList.add('stage-ready');
      // Cinematic arrival: drift in from far out, then settle on the queued station
      const target = pendingSpec ?? stationFor(activeServiceLocal, 'intro', 0);
      pendingSpec = null;
      if (!prefersReducedMotion()) {
        stage.moveCamera(ARRIVAL, 0.01);
        setTimeout(() => stage?.moveCamera(target, 3.0), 60);
      } else {
        stage.moveCamera(target, 0.01);
      }
      stageLoading = false;
    })
    .catch((err) => {
      console.warn('[Cinematic] Stage failed to load — continuing with DOM-only cinematics:', err);
      stageLoading = false;
    });
}

function applyChoice(category: string, value: string): void {
  if (!stage || activeServiceLocal !== 'showers') return;
  const rig = stage.shower;
  switch (category) {
    case 'enclosure': rig.setEnclosure(value); break;
    case 'glass': rig.setGlass(value); break;
    case 'hardware': rig.setHardware(value); break;
    case 'handle':
      if (!/^(n\/a|none)$/i.test(value.trim())) rig.setHandle(value);
      break;
    default: break;
  }
  if (['enclosure', 'glass', 'hardware', 'handle', 'extras'].includes(category)) {
    chosen.add(category);
    rig.setSolidity(0.15 + chosen.size * 0.17);
    rig.pulse();
  }
}

/**
 * Agent-conducted preview: morph the model (or move the camera) while Alex
 * talks, without recording a selection or advancing the tour.
 */
function applyPreview(category: string, value: string): void {
  if (!stage) return;
  if (category === 'camera') {
    const view = CAMERA_VIEWS[value.toLowerCase().trim()];
    if (view) stage.moveCamera(view, 1.4);
    return;
  }
  if (activeServiceLocal !== 'showers') return;
  const rig = stage.shower;
  switch (category) {
    case 'enclosure': rig.setEnclosure(value); break;
    case 'glass': rig.setGlass(value); break;
    case 'hardware': rig.setHardware(value); break;
    case 'handle': rig.setHandle(value); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ */
/*  Facade implementation                                               */
/* ------------------------------------------------------------------ */

export function createSlideshow(service: ServiceType = 'showers'): void {
  const existed = !!root();
  classic.createSlideshow(service);
  if (existed) return;

  activeServiceLocal = service;
  chosen.clear();
  pushedThrough = false;
  root()?.classList.add('cinematic');
  mountStage();
  unsubChoice?.();
  unsubChoice = onChoice(({ category, value }) => applyChoice(category, value));
  unsubPreview?.();
  unsubPreview = onPreview(({ category, value }) => applyPreview(category, value));
}

export async function showSlide(slideId: string): Promise<void> {
  const host = root();
  if (!host) return classic.showSlide(slideId);

  const prevId = classic.getCurrentSlideId();
  if (prevId === slideId) return;

  const prevEl = prevId ? (host.querySelector(`#slide-${prevId}`) as HTMLElement | null) : null;
  if (prevEl) await dematerializeSlide(prevEl);

  const order = SLIDE_ORDER_BY_SERVICE[activeServiceLocal || 'showers'] || SLIDE_ORDER_BY_SERVICE.showers;
  const index = Math.max(0, order.indexOf(slideId));
  const isQuoteFinale = slideId === 'quote' && activeServiceLocal === 'showers';

  // Camera choreography
  if (stage) {
    if (isQuoteFinale && !pushedThrough && !prefersReducedMotion()) {
      pushedThrough = true;
      await stage.pushThroughGlass();
      host.classList.add('stage-dim');
    } else if (!isQuoteFinale) {
      if (pushedThrough) {
        // Came back from the quote slide — restore the orbit
        pushedThrough = false;
        host.classList.remove('stage-dim');
      }
      stage.moveCamera(stationFor(activeServiceLocal, slideId, index), 1.7);
    } else {
      host.classList.add('stage-dim');
    }
  } else {
    pendingSpec = stationFor(activeServiceLocal, slideId, index);
    if (isQuoteFinale) host.classList.add('stage-dim');
  }

  await classic.showSlide(slideId);

  const target = host.querySelector(`#slide-${slideId}`) as HTMLElement | null;
  if (target) materializeSlide(target);
}

export async function endSlideshow(): Promise<void> {
  unsubChoice?.();
  unsubChoice = null;
  unsubPreview?.();
  unsubPreview = null;
  await classic.endSlideshow();
  stage?.dispose();
  stage = null;
  pendingSpec = null;
  chosen.clear();
  pushedThrough = false;
}

export function renderQuoteVisuals(choices: Record<string, string>): void {
  classic.renderQuoteVisuals(choices);
}

export function markQuoteRenderReady(url: string): void {
  classic.markQuoteRenderReady(url);
  const wrap = document.querySelector('.ss-quote-img-wrap') as HTMLElement | null;
  if (!wrap) return;
  revealRender(wrap);
  installBeforeAfter(wrap);
}

/* ------------------------------------------------------------------ */
/*  Before / after comparison (finale, only when we have their photo)   */
/* ------------------------------------------------------------------ */

function installBeforeAfter(wrap: HTMLElement): void {
  if (wrap.querySelector('.cine-ba')) return;
  const photo = getBathroomPhoto();
  if (!photo) return; // no "before" to compare against
  const genImg = wrap.querySelector('#qs-generated-img') as HTMLImageElement | null;
  if (!genImg) return;

  wrap.classList.add('cine-has-before');

  const ba = document.createElement('div');
  ba.className = 'cine-ba';
  ba.innerHTML = `
    <span class="cine-ba-tag before">Before</span>
    <span class="cine-ba-tag after">After</span>
    <div class="cine-ba-line"></div>
    <input type="range" min="0" max="100" value="100" aria-label="Compare before and after" />
  `;
  wrap.appendChild(ba);

  const line = ba.querySelector('.cine-ba-line') as HTMLElement;
  const range = ba.querySelector('input') as HTMLInputElement;

  const apply = (v: number) => {
    genImg.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    line.style.left = `${v}%`;
    line.style.opacity = v <= 1 || v >= 99 ? '0.35' : '1';
  };
  range.addEventListener('input', () => apply(Number(range.value)));

  // Inviting first impression: sweep once from "before" to "after"
  if (!prefersReducedMotion()) {
    const proxy = { v: 0 };
    gsap.to(proxy, {
      v: 100, duration: 2.2, delay: 1.4, ease: 'power2.inOut',
      onUpdate: () => { range.value = String(Math.round(proxy.v)); apply(proxy.v); },
    });
  } else {
    apply(100);
  }
}
