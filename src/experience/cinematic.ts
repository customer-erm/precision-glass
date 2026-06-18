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
import { getState } from '../utils/state';
import { materializeSlide, dematerializeSlide, revealRender } from './materialize';
import { onChoice, onPreview } from './events';
import { extrasCompat } from './compat';
import { prefersReducedMotion } from './flag';
import type { Stage, CameraSpec } from './stage';
import './cinematic.css';

/* ------------------------------------------------------------------ */
/*  Camera stations                                                     */
/* ------------------------------------------------------------------ */

const ARRIVAL: CameraSpec = { angle: 0.1, distance: 9.5, height: 3.6 };

/**
 * Option slides use a split stage: the 3D model owns the left two-thirds
 * of the frame (the lateral offset pushes it left of center) while the
 * option cards stack in the right third and fade in one by one.
 */
const SIDE_SLIDES_BY_SERVICE: Record<ServiceType, Set<string>> = {
  showers: new Set(['gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process']),
  railings: new Set(['gallery', 'rail-types', 'rail-glass', 'rail-finish', 'rail-mounting', 'process']),
  commercial: new Set(['gallery', 'com-types', 'com-glass', 'com-framing', 'com-scope', 'process']),
};

const SHOWER_STATIONS: Record<string, CameraSpec> = {
  intro: { angle: 0.55, distance: 6.8, height: 2.4, lateral: -0.85 }, // copy left, model right
  gallery: { angle: -0.6, distance: 6.6, height: 1.9, lateral: 1.55 },
  enclosures: { angle: 0.05, distance: 5.0, height: 1.7, lateral: 1.15 },
  glass: { angle: -0.5, distance: 3.6, height: 1.5, lateral: 0.95 },
  hardware: { angle: 0.7, distance: 2.0, height: 1.3, targetHeight: 1.05, lateral: 0.55 },
  accessories: { angle: 1.0, distance: 2.6, height: 1.25, lateral: 0.85 },
  extras: { angle: -0.3, distance: 4.6, height: 2.2, lateral: 1.0 },
  process: { angle: 0.45, distance: 5.4, height: 1.8, lateral: 1.05 },
  quote: { angle: 0, distance: 4.2, height: 1.3 }, // approach before push-through
};

const RAILING_STATIONS: Record<string, CameraSpec> = {
  intro: { angle: 0.52, distance: 7.2, height: 2.35, lateral: -0.75 },
  gallery: { angle: -0.55, distance: 6.8, height: 2.1, lateral: 1.55 },
  'rail-types': { angle: 0.05, distance: 4.7, height: 1.55, lateral: 1.1, targetHeight: 0.78 },
  'rail-glass': { angle: -0.45, distance: 3.9, height: 1.35, lateral: 0.95, targetHeight: 0.8 },
  'rail-finish': { angle: 0.72, distance: 3.35, height: 1.3, lateral: 0.85, targetHeight: 0.72 },
  'rail-mounting': { angle: 1.08, distance: 3.7, height: 1.45, lateral: 0.9, targetHeight: 0.45 },
  process: { angle: 0.35, distance: 5.4, height: 2.0, lateral: 1.05, targetHeight: 0.8 },
  quote: { angle: 0, distance: 5.2, height: 1.65 },
};

const COMMERCIAL_STATIONS: Record<string, CameraSpec> = {
  intro: { angle: 0.48, distance: 7.4, height: 2.45, lateral: -0.8, targetHeight: 1.1 },
  gallery: { angle: -0.5, distance: 7.0, height: 2.15, lateral: 1.55, targetHeight: 1.05 },
  'com-types': { angle: 0.02, distance: 5.0, height: 1.75, lateral: 1.05, targetHeight: 1.0 },
  'com-glass': { angle: -0.48, distance: 4.3, height: 1.62, lateral: 0.95, targetHeight: 1.02 },
  'com-framing': { angle: 0.6, distance: 3.7, height: 1.45, lateral: 0.85, targetHeight: 1.0 },
  'com-scope': { angle: 0.9, distance: 4.7, height: 1.85, lateral: 0.95, targetHeight: 1.12 },
  process: { angle: 0.28, distance: 5.6, height: 2.25, lateral: 1.05, targetHeight: 1.1 },
  quote: { angle: 0, distance: 5.4, height: 1.75 },
};

function stationFor(service: ServiceType, slideId: string, index: number): CameraSpec {
  const stations: Record<ServiceType, Record<string, CameraSpec>> = {
    showers: SHOWER_STATIONS,
    railings: RAILING_STATIONS,
    commercial: COMMERCIAL_STATIONS,
  };
  const spec = stations[service]?.[slideId];
  if (spec) {
    // Mobile split: options live in a bottom sheet, so center the model and
    // aim low — it frames in the open top half of the screen.
    if (SIDE_SLIDES_BY_SERVICE[service]?.has(slideId) && window.innerWidth < 768) {
      return { ...spec, lateral: 0, targetHeight: 0.35, height: spec.height + 0.5, distance: spec.distance + 3.2 };
    }
    return spec;
  }
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
let prewarmed: Stage | null = null;
let prewarmHost: HTMLElement | null = null;

/**
 * Fully boot the WebGL stage on homepage idle — download three.js, create
 * the renderer, compile the glass shaders, render a few warm-up frames in
 * a hidden full-viewport host — so the morph into the tour is instant.
 */
function prewarmStage(): void {
  if (prewarmed || stage || stageLoading) return;
  import('./flag').then(({ isCinematic }) => {
    if (!isCinematic()) return;
    import('./stage').then(({ createStage }) => {
      if (prewarmed || stage) return;
      prewarmHost = document.createElement('div');
      prewarmHost.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1;';
      document.body.appendChild(prewarmHost);
      prewarmed = createStage(prewarmHost);
      // A few live frames force shader compilation, then sleep until needed
      setTimeout(() => prewarmed?.setActive(false), 1200);
      console.log('[Cinematic] Stage pre-warmed');
    }).catch(() => { /* loads on demand later */ });
  });
}

if (typeof window !== 'undefined') {
  const idle = (window as unknown as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback
    ?? ((fn: () => void) => setTimeout(fn, 1500));
  idle(prewarmStage);
}
let pendingSpec: CameraSpec | null = null;
let unsubChoice: (() => void) | null = null;
let unsubPreview: (() => void) | null = null;
let activeServiceLocal: ServiceType = 'showers';
let pushedThrough = false;
let enclosureChoice = '';
const chosen = new Set<string>();

function root(): HTMLElement | null {
  return document.getElementById('tour-slideshow');
}

function adoptOrCreateStage(host: HTMLElement, createStage: (c: HTMLElement) => Stage): Stage {
  if (prewarmed) {
    const s = prewarmed;
    prewarmed = null;
    s.adopt(host);
    s.setActive(true);
    prewarmHost?.remove();
    prewarmHost = null;
    return s;
  }
  return createStage(host);
}

function mountStage(): void {
  if (stage || stageLoading) return;
  stageLoading = true;
  import('./stage')
    .then(({ createStage }) => {
      const host = root();
      if (!host) { stageLoading = false; return; }
      stage = adoptOrCreateStage(host, createStage);
      stage.setService(activeServiceLocal);
      host.classList.add('stage-ready');
      // Cinematic arrival: drift in from far out, then settle on the queued station
      const target = pendingSpec ?? stationFor(activeServiceLocal, 'intro', 0);
      pendingSpec = null;
      if (!prefersReducedMotion()) {
        stage.moveCamera(ARRIVAL, 0.01);
        setTimeout(() => stage?.moveCamera(target, 2.1), 60);
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
  if (!stage) return;
  let handled = false;
  if (activeServiceLocal === 'showers') {
    const rig = stage.shower;
    switch (category) {
      case 'enclosure': enclosureChoice = value; rig.setEnclosure(value); handled = true; break;
      case 'glass': rig.setGlass(value); handled = true; break;
      case 'hardware': rig.setHardware(value); handled = true; break;
      case 'handle':
        if (!/^(n\/a|none)$/i.test(value.trim())) rig.setHandle(value);
        handled = true;
        break;
      case 'extras': rig.setExtras(value); handled = true; break;
      default: break;
    }
    if (handled) {
      chosen.add(category);
      rig.setSolidity(0.15 + chosen.size * 0.17);
      rig.pulse();
    }
    return;
  }

  if (activeServiceLocal === 'railings') {
    const rig = stage.railings;
    switch (category) {
      case 'rail-type':
      case 'enclosure': rig.setSystem(value); handled = true; break;
      case 'rail-glass':
      case 'glass': rig.setGlass(value); handled = true; break;
      case 'rail-finish':
      case 'hardware': rig.setFinish(value); handled = true; break;
      case 'rail-mounting':
      case 'handle': rig.setMounting(value); handled = true; break;
      default: break;
    }
    if (handled) {
      chosen.add(category);
      rig.setSolidity(0.18 + chosen.size * 0.18);
      rig.pulse();
    }
    return;
  }

  if (activeServiceLocal === 'commercial') {
    const rig = stage.commercial;
    switch (category) {
      case 'com-type':
      case 'enclosure': rig.setProjectType(value); handled = true; break;
      case 'com-glass':
      case 'glass': rig.setGlass(value); handled = true; break;
      case 'com-framing':
      case 'hardware': rig.setFraming(value); handled = true; break;
      case 'com-scope':
      case 'handle': rig.setScope(value); handled = true; break;
      default: break;
    }
    if (handled) {
      chosen.add(category);
      rig.setSolidity(0.18 + chosen.size * 0.18);
      rig.pulse();
    }
  }
}

function applyModelPreview(category: string, value: string): void {
  if (!stage) return;
  if (activeServiceLocal === 'showers') {
    const rig = stage.shower;
    switch (category) {
      case 'enclosure': enclosureChoice = value; rig.setEnclosure(value); break;
      case 'glass': rig.setGlass(value); break;
      case 'hardware': rig.setHardware(value); break;
      case 'handle': rig.setHandle(value); break;
      default: break;
    }
  } else if (activeServiceLocal === 'railings') {
    const rig = stage.railings;
    switch (category) {
      case 'rail-type':
      case 'enclosure': rig.setSystem(value); break;
      case 'rail-glass':
      case 'glass': rig.setGlass(value); break;
      case 'rail-finish':
      case 'hardware': rig.setFinish(value); break;
      case 'rail-mounting':
      case 'handle': rig.setMounting(value); break;
      default: break;
    }
  } else if (activeServiceLocal === 'commercial') {
    const rig = stage.commercial;
    switch (category) {
      case 'com-type':
      case 'enclosure': rig.setProjectType(value); break;
      case 'com-glass':
      case 'glass': rig.setGlass(value); break;
      case 'com-framing':
      case 'hardware': rig.setFraming(value); break;
      case 'com-scope':
      case 'handle': rig.setScope(value); break;
      default: break;
    }
  }
}

function applyProcessState(slideId: string): void {
  if (!stage) return;
  stage.shower.setWater(activeServiceLocal === 'showers' && slideId === 'process');
  stage.railings.setProcess(activeServiceLocal === 'railings' && slideId === 'process');
  stage.commercial.setProcess(activeServiceLocal === 'commercial' && slideId === 'process');
}

function isSideSlide(slideId: string): boolean {
  return !!SIDE_SLIDES_BY_SERVICE[activeServiceLocal]?.has(slideId);
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
  applyModelPreview(category, value);
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
  enclosureChoice = '';
  pushedThrough = false;
  const host = root();
  host?.classList.add('cinematic', `cine-service-${service}`);
  if (host) host.dataset.service = service;
  // The tour is a fixed overlay — the page behind must never scroll
  document.body.style.overflow = 'hidden';

  // Trust signals under the intro copy
  if (host && service === 'showers') {
    const introContent = host.querySelector('#slide-intro .slide-content');
    if (introContent && !introContent.querySelector('.cine-intro-trust')) {
      const SHIELD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
      const AWARD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>';
      const CLOCK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
      const STAR = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      const trust = document.createElement('div');
      trust.className = 'cine-intro-trust slide-el';
      trust.innerHTML = `
        <span>${SHIELD}Licensed &amp; insured</span>
        <span>${AWARD}Lifetime warranty</span>
        <span>${CLOCK}Most installs in 1 day</span>
        <span>${STAR}20+ years in S. Florida</span>
      `;
      introContent.appendChild(trust);
    }
  }

  // Trim the enclosure list to the 8 signature styles so the side column
  // breathes — arched and fully-custom stay available by asking the agent.
  if (host && service === 'showers') {
    host.querySelectorAll<HTMLElement>('#slide-enclosures .ss-enc-card').forEach((card) => {
      const label = card.querySelector('h4')?.textContent?.toLowerCase() ?? '';
      if (label.includes('arched') || label.includes('custom')) card.remove();
    });
    const sub = host.querySelector('#slide-enclosures .slide-sub');
    if (sub) sub.textContent = '8 signature styles — arched tops & custom layouts on request';
  }
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

  // Shower-in-use mood (water + steam) while the customer pictures living
  // with it — the process slide is the daydream moment.
  applyProcessState(slideId);

  // Upgrades that don't apply to the chosen style are greyed out with a reason
  if (slideId === 'extras' && activeServiceLocal === 'showers') {
    applyExtrasCompatUI(host);
  }

  const target = host.querySelector(`#slide-${slideId}`) as HTMLElement | null;
  if (target) {
    const isSide = isSideSlide(slideId);
    target.classList.toggle('cine-side', isSide);
    // Agent-led modes: options roll in one by one while Alex talks them
    // through. Browse mode: snappy, the user drives.
    const mode = getState().currentMode;
    const slowReveal = isSide && (mode === 'voice' || mode === 'chat');
    materializeSlide(target, { stagger: slowReveal ? 0.45 : 0.07 });
  }
}

function applyExtrasCompatUI(host: HTMLElement): void {
  const compat = extrasCompat(enclosureChoice);
  host.querySelectorAll<HTMLElement>('#slide-extras .ss-extra-card').forEach((card) => {
    const label = card.querySelector('h4')?.textContent?.toLowerCase() ?? '';
    const isSteam = label.includes('steam');
    const isGrid = label.includes('grid');
    const ok = isSteam ? compat.steam : isGrid ? compat.grid : true;
    const reason = isSteam ? compat.steamReason : compat.gridReason;
    card.classList.toggle('cine-disabled', !ok);
    if (!ok) card.classList.remove('selected');
    card.querySelector('.cine-incompat-note')?.remove();
    if (!ok && reason && enclosureChoice) {
      const note = document.createElement('span');
      note.className = 'cine-incompat-note';
      note.textContent = `Not available with ${enclosureChoice} — ${reason}`;
      card.querySelector('.ss-card-info')?.appendChild(note);
    }
  });
}

export async function endSlideshow(): Promise<void> {
  unsubChoice?.();
  unsubChoice = null;
  unsubPreview?.();
  unsubPreview = null;
  document.body.style.overflow = '';
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
