/**
 * Cinematic full-viewport slideshow.
 * Three service flows: showers (full configurator + AI visualization),
 * railings (info-style walkthrough), commercial (info-style walkthrough).
 */
import { images } from '../data/image-map';
import { getBathroomPhoto } from '../utils/bathroom-photo';

export type ServiceType = 'showers' | 'railings' | 'commercial';

let slideshowEl: HTMLElement | null = null;
let currentSlide: HTMLElement | null = null;
let currentSlideId: string | null = null;
let activeService: ServiceType = 'showers';
let activeSlideOrder: string[] = [];

export function getCurrentSlideId(): string | null {
  return currentSlideId;
}
export function getActiveService(): ServiceType {
  return activeService;
}
let galleryInterval: ReturnType<typeof setInterval> | null = null;
let carouselInterval: ReturnType<typeof setInterval> | null = null; // legacy, retained for safety

const SLIDE_ORDER_BY_SERVICE: Record<ServiceType, string[]> = {
  showers: ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process', 'quote'],
  railings: ['intro', 'gallery', 'rail-types', 'rail-glass', 'rail-finish', 'rail-mounting', 'process', 'quote'],
  commercial: ['intro', 'gallery', 'com-types', 'com-glass', 'com-framing', 'com-scope', 'process', 'quote'],
};

/* ---- Public API ---- */

export function createSlideshow(service: ServiceType = 'showers'): void {
  if (slideshowEl) return;
  activeService = service;
  activeSlideOrder = SLIDE_ORDER_BY_SERVICE[service];

  const ss = document.createElement('div');
  ss.id = 'tour-slideshow';
  ss.className = 'tour-slideshow';
  ss.dataset.service = service;

  ss.appendChild(h('div', { className: 'ss-progress', innerHTML: '<div class="ss-progress-bar" id="ss-progress-bar"></div>' }));
  ss.appendChild(h('div', { className: 'ss-counter', id: 'ss-counter', textContent: '1 / ' + activeSlideOrder.length }));

  if (service === 'showers') {
    ss.appendChild(buildIntroSlide());
    ss.appendChild(buildGallerySlide());
    ss.appendChild(buildEnclosuresSlide());
    ss.appendChild(buildGlassSlide());
    ss.appendChild(buildHardwareSlide());
    ss.appendChild(buildAccessoriesSlide());
    ss.appendChild(buildExtrasSlide());
    ss.appendChild(buildProcessSlide());
    ss.appendChild(buildQuoteSummarySlide());
  } else if (service === 'railings') {
    ss.appendChild(buildRailIntroSlide());
    ss.appendChild(buildRailGallerySlide());
    ss.appendChild(buildRailTypesSlide());
    ss.appendChild(buildRailGlassSlide());
    ss.appendChild(buildRailFinishSlide());
    ss.appendChild(buildRailMountingSlide());
    ss.appendChild(buildProcessSlide());
    ss.appendChild(buildQuoteSummarySlide());
  } else if (service === 'commercial') {
    ss.appendChild(buildComIntroSlide());
    ss.appendChild(buildComGallerySlide());
    ss.appendChild(buildComTypesSlide());
    ss.appendChild(buildComGlassSlide());
    ss.appendChild(buildComFramingSlide());
    ss.appendChild(buildComScopeSlide());
    ss.appendChild(buildProcessSlide());
    ss.appendChild(buildQuoteSummarySlide());
  }

  document.body.appendChild(ss);
  slideshowEl = ss;
  requestAnimationFrame(() => ss.classList.add('active'));
}

export function showSlide(slideId: string): Promise<void> {
  return new Promise((resolve) => {
    if (!slideshowEl) { resolve(); return; }
    const target = slideshowEl.querySelector(`#slide-${slideId}`) as HTMLElement;
    if (!target) { resolve(); return; }
    if (currentSlide === target) { resolve(); return; }

    if (currentSlide) {
      currentSlide.classList.add('exiting');
      currentSlide.classList.remove('active');
      currentSlide.querySelectorAll('.slide-el.revealed').forEach(el => el.classList.remove('revealed'));
      const old = currentSlide;
      setTimeout(() => old.classList.remove('exiting'), 900);
    }

    // Clean up intervals when leaving slides
    if (galleryInterval && slideId !== 'gallery') { clearInterval(galleryInterval); galleryInterval = null; }
    if (carouselInterval && slideId !== 'enclosures') { clearInterval(carouselInterval); carouselInterval = null; }
    // Hide buyer's guide popup when leaving the gallery slide
    if (slideId !== 'gallery') hideBuyerGuidePopup();

    const delay = currentSlide ? 400 : 0;
    setTimeout(() => {
      target.classList.add('active');
      currentSlide = target;
      currentSlideId = slideId;

      const els = target.querySelectorAll('.slide-el');
      els.forEach((el, i) => setTimeout(() => (el as HTMLElement).classList.add('revealed'), 120 + i * 140));

      if (slideId === 'gallery') {
        startGalleryFade();
        // Buyer's guide popup only on the showers gallery slide
        if (activeService === 'showers') {
          setTimeout(() => {
            if (currentSlideId === 'gallery') showBuyerGuidePopup();
          }, 6000);
        }
      }

      const total = activeSlideOrder.length;
      const idx = activeSlideOrder.indexOf(slideId);
      const bar = document.getElementById('ss-progress-bar');
      if (bar && idx >= 0) bar.style.width = `${((idx + 1) / total) * 100}%`;
      const ctr = document.getElementById('ss-counter');
      if (ctr && idx >= 0) ctr.textContent = `${idx + 1} / ${total}`;

      resolve();
    }, delay);
  });
}

export function endSlideshow(): Promise<void> {
  return new Promise((resolve) => {
    if (!slideshowEl) { resolve(); return; }
    if (galleryInterval) { clearInterval(galleryInterval); galleryInterval = null; }
    if (carouselInterval) { clearInterval(carouselInterval); carouselInterval = null; }
    slideshowEl.classList.add('fade-out');
    slideshowEl.classList.remove('active');
    setTimeout(() => { slideshowEl?.remove(); slideshowEl = null; currentSlide = null; resolve(); }, 900);
  });
}

/* ---- Helpers ---- */

function h(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'textContent') el.textContent = v;
    else if (k === 'innerHTML') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  return el;
}

function makeSlide(id: string): HTMLElement {
  return h('div', { className: 'tour-slide', id: `slide-${id}` });
}

function makeHeader(label: string, heading: string, sub?: string): HTMLElement {
  const wrap = h('div', { className: 'slide-header slide-el' });
  wrap.appendChild(h('div', { className: 'slide-label', textContent: label }));
  wrap.appendChild(h('h3', { className: 'slide-heading', textContent: heading }));
  if (sub) wrap.appendChild(h('p', { className: 'slide-sub', textContent: sub }));
  return wrap;
}

function startGalleryFade(): void {
  const imgs = document.querySelectorAll('.ss-gallery-fade img');
  if (!imgs.length) return;
  let idx = 0;
  imgs[0].classList.add('gf-active');
  galleryInterval = setInterval(() => {
    imgs[idx].classList.remove('gf-active');
    idx = (idx + 1) % imgs.length;
    imgs[idx].classList.add('gf-active');
  }, 4000);
}

export function showBuyerGuidePopup(): void {
  let popup = document.getElementById('buyer-guide-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'buyer-guide-popup';
    popup.className = 'buyer-guide-popup';
    popup.innerHTML = `
      <img src="/images/buyersguide.png" alt="Free Frameless Shower Buyer's Guide" />
      <div class="bg-popup-caption">Free Buyer's Guide</div>
    `;
    document.body.appendChild(popup);
  }
  // Force reflow then add visible class for animation
  void popup.offsetWidth;
  popup.classList.add('visible');
}

export function hideBuyerGuidePopup(): void {
  const popup = document.getElementById('buyer-guide-popup');
  if (popup) popup.classList.remove('visible');
}

/* ---- Slide Builders ---- */

function buildIntroSlide(): HTMLElement {
  const slide = makeSlide('intro');
  const bg = h('div', { className: 'slide-bg' });
  bg.appendChild(h('img', { src: images.showers.hero, alt: 'Frameless shower' }));
  slide.appendChild(bg);
  const content = h('div', { className: 'slide-content slide-center' });
  content.appendChild(h('h2', { className: 'slide-title slide-el', textContent: 'Frameless Shower Enclosures' }));
  content.appendChild(h('p', { className: 'slide-subtitle slide-el', textContent: 'No frames. No compromises. Precision-cut glass that transforms your bathroom into something extraordinary.' }));
  slide.appendChild(content);
  return slide;
}

function buildGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('PORTFOLIO', 'Our Recent Work'));
  const container = h('div', { className: 'ss-gallery-fade slide-el' });
  images.showers.gallery.forEach((src, i) => {
    container.appendChild(h('img', { src, alt: `Installation ${i + 1}` }));
  });
  content.appendChild(container);
  slide.appendChild(content);
  return slide;
}

function buildEnclosuresSlide(): HTMLElement {
  const slide = makeSlide('enclosures');
  const content = h('div', { className: 'slide-content' });
  const count = images.showers.enclosures.length;
  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Configuration', `All ${count} styles \u2014 every layout we build`));

  const grid = h('div', { className: 'ss-enc-grid slide-el' });
  images.showers.enclosures.forEach((item) => {
    const card = h('div', { className: 'ss-enc-card' });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildGlassSlide(): HTMLElement {
  const slide = makeSlide('glass');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('GLASS OPTIONS', 'Select Your Glass'));
  const grid = h('div', { className: 'ss-glass-grid' });
  images.showers.glass.forEach((item) => {
    const card = h('div', { className: 'ss-glass-card slide-el' });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildHardwareSlide(): HTMLElement {
  const slide = makeSlide('hardware');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('HARDWARE FINISHES', 'Choose Your Finish'));
  const grid = h('div', { className: 'ss-hw-grid' });
  images.showers.hardware.filter(i => i.id !== 'hw-other').forEach((item) => {
    const card = h('div', { className: 'ss-hw-card slide-el' });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    card.appendChild(h('h4', { textContent: item.label }));
    card.appendChild(h('p', { textContent: item.desc }));
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildAccessoriesSlide(): HTMLElement {
  const slide = makeSlide('accessories');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('HANDLES & ACCESSORIES', 'Choose Your Style', 'Solid brass \u00B7 Lifetime warranty \u00B7 All finishes'));
  const items = ['acc-pull', 'acc-uhandle', 'acc-ladder', 'acc-knob', 'acc-towel', 'acc-hook', 'acc-bar'];
  const grid = h('div', { className: 'ss-acc-grid' });
  images.showers.accessories.filter(a => items.includes(a.id)).forEach((item) => {
    const card = h('div', { className: 'ss-acc-card slide-el' });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildExtrasSlide(): HTMLElement {
  const slide = makeSlide('extras');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('PREMIUM UPGRADES', 'Elevate Your Shower'));
  const grid = h('div', { className: 'ss-extras-grid' });

  const gridImg = images.showers.accessories.find(a => a.id === 'acc-grid');
  if (gridImg) {
    const card = h('div', { className: 'ss-extra-card slide-el' });
    card.appendChild(h('img', { src: gridImg.src, alt: 'Grid Patterns' }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: 'Decorative Grid Patterns' }));
    info.appendChild(h('p', { textContent: 'French, colonial, or custom grid designs applied to your glass panels for architectural character.' }));
    card.appendChild(info);
    grid.appendChild(card);
  }

  const steamImg = images.showers.enclosures.find(e => e.id === 'enc-steam');
  if (steamImg) {
    const card = h('div', { className: 'ss-extra-card slide-el' });
    card.appendChild(h('img', { src: steamImg.src, alt: 'Steam Shower' }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: 'Steam Shower Enclosure' }));
    info.appendChild(h('p', { textContent: 'Fully sealed floor-to-ceiling glass for a complete spa experience at home.' }));
    card.appendChild(info);
    grid.appendChild(card);
  }

  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildProcessSlide(): HTMLElement {
  const slide = makeSlide('process');
  const content = h('div', { className: 'slide-content' });
  const processByService: Record<ServiceType, {
    heading: string;
    sub?: string;
    steps: Array<{ num: string; title: string; desc: string; src: string }>;
  }> = {
    showers: {
      heading: 'From Approval to Enjoyment',
      steps: [
        { num: '1', title: 'Proposal Review', desc: 'We package your design notes for a specialist to review.', src: images.process[0].src },
        { num: '2', title: 'Precision Measuring', desc: 'Laser-accurate templates. Every fraction of an inch.', src: images.process[1].src },
        { num: '3', title: 'Glass Ordering', desc: 'Custom cut, polished, and tempered after field measure.', src: images.process[2].src },
        { num: '4', title: 'Installation Day', desc: 'Professional installation once scope and schedule are confirmed.', src: images.process[3].src },
        { num: '5', title: 'Enjoy', desc: 'Step into your new frameless shower.', src: images.showers.hero },
      ],
    },
    railings: {
      heading: 'From Field Review to Clear Views',
      sub: 'The team confirms structure, code, anchoring, and finish before quoting or scheduling.',
      steps: [
        { num: '1', title: 'Project Intake', desc: 'Capture deck, stair, balcony, pool, or fascia conditions for staff review.', src: images.railings.gallery[0] },
        { num: '2', title: 'Site Measure', desc: 'Verify spans, substrate, slopes, edge distances, and railing height requirements.', src: images.process[1].src },
        { num: '3', title: 'Engineering Check', desc: 'Confirm wind load, guardrail code, anchoring, and marine-grade hardware.', src: images.railings.gallery[2] },
        { num: '4', title: 'Fabrication Plan', desc: 'Glass panels and metal components are specified after field verification.', src: images.process[2].src },
        { num: '5', title: 'Install Coordination', desc: 'Crew access, core drilling, waterproofing, and final walkthrough are planned.', src: images.railings.hero },
      ],
    },
    commercial: {
      heading: 'From Scope Review to Punchlist',
      sub: 'Commercial projects move through code, submittal, fabrication, and installation review.',
      steps: [
        { num: '1', title: 'Scope Review', desc: 'Capture drawings, opening sizes, doors, hardware, schedule, and site access.', src: images.commercial.gallery[0] },
        { num: '2', title: 'Code & Submittals', desc: 'Review energy code, impact requirements, NOAs, permits, and shop drawing needs.', src: images.process[1].src },
        { num: '3', title: 'System Specification', desc: 'Select glass make-up, aluminum depth, finish, sealants, and hardware package.', src: images.commercial.gallery[2] },
        { num: '4', title: 'Fabrication Planning', desc: 'Frames, glass, doors, and anchors are ordered after verification.', src: images.process[2].src },
        { num: '5', title: 'Install & Punchlist', desc: 'Licensed crew coordinates access, protection, final adjustment, and closeout.', src: images.commercial.hero },
      ],
    },
  };
  const process = processByService[activeService];
  content.appendChild(makeHeader('THE PROCESS', process.heading, process.sub));
  const steps = process.steps;
  const grid = h('div', { className: 'ss-process-strip' });
  steps.forEach((step) => {
    const card = h('div', { className: 'ss-process-step slide-el' });
    card.appendChild(h('div', { className: 'ss-step-num', textContent: step.num }));
    card.appendChild(h('img', { src: step.src, alt: step.title }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: step.title }));
    info.appendChild(h('p', { textContent: step.desc }));
    card.appendChild(info);
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

/* ------------------------------------------------------------------ */
/*  Quote build-sheet: steps, thumbnails, progress, anticipation viz   */
/* ------------------------------------------------------------------ */

const QUOTE_STEPS_BY_SERVICE: Record<ServiceType, Array<{ key: string; label: string }>> = {
  showers: [
    { key: 'enclosure', label: 'Enclosure' },
    { key: 'glass', label: 'Glass' },
    { key: 'hardware', label: 'Hardware finish' },
    { key: 'handle', label: 'Handle' },
    { key: 'extras', label: 'Upgrades' },
  ],
  railings: [
    { key: 'enclosure', label: 'Rail system' },
    { key: 'glass', label: 'Glass spec' },
    { key: 'hardware', label: 'Finish' },
    { key: 'handle', label: 'Mounting' },
  ],
  commercial: [
    { key: 'enclosure', label: 'Project type' },
    { key: 'glass', label: 'Glass spec' },
    { key: 'hardware', label: 'Framing' },
    { key: 'handle', label: 'Scope' },
  ],
};

function quoteSteps(): Array<{ key: string; label: string }> {
  return QUOTE_STEPS_BY_SERVICE[activeService] || QUOTE_STEPS_BY_SERVICE.showers;
}

const STEP_CHECK_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;

const QUOTE_STATUS_LINES = [
  'Measuring your space…',
  'Cutting your glass to size…',
  'Tempering for safety…',
  'Matching your hardware finish…',
  'Polishing the edges…',
  'Setting the hinges…',
  'Adding the final details…',
];

// Resolve a chosen value (e.g. "Matte Black") to a thumbnail from the library.
function thumbForStep(key: string, value: string): string | null {
  const v = (value || '').toLowerCase();
  if (!v || v === 'none' || v === 'n/a' || v === 'pending') return null;
  if (activeService === 'railings') {
    if (key === 'enclosure') return images.railings.gallery[1] || images.railings.hero;
    if (key === 'glass') return images.railings.gallery[2] || images.railings.hero;
    if (key === 'hardware') return images.railings.gallery[3] || images.railings.hero;
    if (key === 'handle') return images.railings.gallery[4] || images.railings.hero;
  }
  if (activeService === 'commercial') {
    if (key === 'enclosure') return images.commercial.gallery[0] || images.commercial.hero;
    if (key === 'glass') return images.commercial.gallery[1] || images.commercial.hero;
    if (key === 'hardware') return images.commercial.gallery[2] || images.commercial.hero;
    if (key === 'handle') return images.commercial.gallery[3] || images.commercial.hero;
  }
  const find = (list: Array<{ label: string; src: string }>, keywords: Array<[string, string]>): string | null => {
    for (const [kw, label] of keywords) {
      if (v.includes(kw)) { const m = list.find((x) => x.label === label); if (m) return m.src; }
    }
    return null;
  };
  if (key === 'enclosure') {
    return find(images.showers.enclosures, [
      ['splash', 'Splash Panel'], ['walk', 'Splash Panel'], ['90', '90° Corner'], ['corner', '90° Corner'],
      ['neo', 'Neo-Angle'], ['slider', 'Frameless Slider'], ['slide', 'Frameless Slider'], ['curved', 'Curved'],
      ['arch', 'Arched'], ['steam', 'Steam Shower'], ['custom', 'Custom'], ['panel', 'Door + Panel'],
      ['single', 'Single Door'], ['door', 'Single Door'],
    ]);
  }
  if (key === 'glass') {
    return find(images.showers.glass, [['clear', 'Clear Glass'], ['frost', 'Frosted Glass'], ['rain', 'Rain Glass']]);
  }
  if (key === 'hardware') {
    return find(images.showers.hardware, [
      ['chrome', 'Polished Chrome'], ['nickel', 'Brushed Nickel'], ['matte', 'Matte Black'], ['black', 'Matte Black'],
      ['polished brass', 'Polished Brass'], ['satin', 'Satin Brass'], ['brass', 'Polished Brass'],
    ]);
  }
  if (key === 'handle') {
    return find(images.showers.accessories, [['ladder', 'Ladder Pulls'], ['u-handle', 'U-Handles'], ['u handle', 'U-Handles'], ['knob', 'Knobs'], ['pull', 'Pull Handles']]);
  }
  if (key === 'accessories') {
    return find(images.showers.accessories, [['towel', 'Towel Bars'], ['hook', 'Robe Hooks'], ['robe', 'Robe Hooks'], ['support', 'Support Bars'], ['bar', 'Support Bars'], ['grid', 'Grid Patterns']]);
  }
  if (key === 'extras') {
    return find(images.showers.accessories, [['grid', 'Grid Patterns']]) || find(images.showers.enclosures, [['steam', 'Steam Shower']]);
  }
  return null;
}

// Map a step key to its value across all three service flows (chat/voice share keys).
function valueForStep(choices: Record<string, string>, key: string): string {
  const pick = (...keys: string[]): string => {
    for (const k of keys) { const val = (choices[k] || '').trim(); if (val) return val; }
    return '';
  };
  switch (key) {
    case 'enclosure': return pick('enclosure', 'rail-type', 'com-type');
    case 'glass': return pick('glass', 'rail-glass', 'com-glass');
    case 'hardware': return pick('hardware', 'rail-finish', 'com-framing');
    case 'handle': return pick('handle', 'rail-mounting', 'com-scope');
    default: return pick(key);
  }
}

let quoteStatusTimer: ReturnType<typeof setInterval> | null = null;
let quoteRevealed = false;

function setQuoteVizImage(): void {
  const vizImg = document.getElementById('qs-viz-img') as HTMLImageElement | null;
  if (!vizImg || vizImg.src) return; // only set once
  const photo = activeService === 'showers' ? getBathroomPhoto() : null;
  const fallback = activeService === 'railings'
    ? images.railings.hero
    : activeService === 'commercial'
      ? images.commercial.hero
      : images.showers.hero;
  vizImg.src = photo?.dataUrl || fallback;
}

function startQuoteStatusCycle(): void {
  if (quoteStatusTimer || quoteRevealed) return;
  const statusEl = document.getElementById('qs-spinner-status');
  if (!statusEl) return;
  let i = 0;
  statusEl.textContent = QUOTE_STATUS_LINES[0];
  quoteStatusTimer = setInterval(() => {
    i = (i + 1) % QUOTE_STATUS_LINES.length;
    statusEl.style.opacity = '0';
    setTimeout(() => { statusEl.textContent = QUOTE_STATUS_LINES[i]; statusEl.style.opacity = '1'; }, 220);
  }, 2000);
}

function stopQuoteStatusCycle(): void {
  if (quoteStatusTimer) { clearInterval(quoteStatusTimer); quoteStatusTimer = null; }
}

/**
 * Paint the build sheet from the current choices: fill each step's value +
 * thumbnail, tick off completed rows, advance the progress bar, and prime the
 * bottom anticipation visualization. Safe to call repeatedly.
 */
export function renderQuoteVisuals(choices: Record<string, string>): void {
  setQuoteVizImage();
  if (!quoteRevealed) startQuoteStatusCycle();

  let done = 0;
  const steps = quoteSteps();
  for (const step of steps) {
    const value = valueForStep(choices, step.key);
    if (!value) continue;
    done++;
    const valEl = document.getElementById(`qs-${step.key}`);
    const lower = value.toLowerCase();
    if (valEl) valEl.textContent = lower === 'n/a' || lower === 'none' ? 'Not needed' : value;
    const row = document.getElementById(`qs-step-${step.key}`);
    if (row) row.classList.add('done');
    const thumbSrc = thumbForStep(step.key, value);
    const thumbImg = document.getElementById(`qst-${step.key}`) as HTMLImageElement | null;
    if (thumbImg && thumbSrc && !thumbImg.src) thumbImg.src = thumbSrc;
    if (row) row.classList.toggle('no-thumb', !thumbSrc);
  }

  // Door-guidance sub-line under the enclosure step
  const dp = (choices.doorPlacement || '').trim();
  const dpEl = document.getElementById('qs-doorPlacement');
  if (dpEl) dpEl.textContent = dp ? `Door: ${dp}` : '';

  // Contact rows (kept for the printable proposal)
  for (const k of ['name', 'email', 'phone', 'location', 'timeline', 'notes']) {
    const v = (choices[k] || '').trim();
    if (!v) continue;
    const el = document.getElementById(`qs-${k}`);
    if (el) { el.textContent = v; el.classList.add('filled'); }
    document.getElementById(`qs-contact-${k}`)?.classList.add('filled');
  }

  // Progress bar + count
  const countEl = document.getElementById('qs-progress-count');
  const fillEl = document.getElementById('qs-progress-fill');
  if (countEl) countEl.textContent = String(done);
  if (fillEl) fillEl.style.width = `${Math.round((done / steps.length) * 100)}%`;
}

/**
 * The render is ready: reveal it over the blurred anticipation viz, stop the
 * status cycle, and finish the progress bar.
 */
export function markQuoteRenderReady(url: string): void {
  const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
  if (img && url) { img.src = url; img.classList.add('loaded'); }
  quoteRevealed = true;
  stopQuoteStatusCycle();
  document.querySelector('.ss-quote-img-wrap')?.classList.add('revealed');
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (spinner) spinner.style.display = 'none';
  const fillEl = document.getElementById('qs-progress-fill');
  if (fillEl) fillEl.style.width = '100%';
}

function buildQuoteSummarySlide(): HTMLElement {
  const slide = makeSlide('quote');
  const content = h('div', { className: 'slide-content slide-center' });
  const stepsForService = quoteSteps();
  const serviceTitle = activeService === 'railings'
    ? 'Your glass railing brief'
    : activeService === 'commercial'
      ? 'Your commercial glass brief'
      : 'Your custom shower';
  const imageAlt = activeService === 'showers'
    ? 'Your custom shower visualization'
    : activeService === 'railings'
      ? 'Glass railing project reference'
      : 'Commercial glass project reference';
  const spinnerText = activeService === 'showers' ? 'Preparing your render...' : 'Preparing your project brief...';
  const downloadLabel = activeService === 'showers' ? 'Download Rendering' : 'Download Reference';

  // Side-by-side layout: build-sheet LEFT, anticipation/reveal RIGHT (stacks on mobile)
  const layout = h('div', { className: 'ss-quote-layout slide-el' });

  // LEFT — build sheet
  const card = h('div', { className: 'ss-quote-card' });

  const header = h('div', { className: 'ss-quote-header' });
  header.appendChild(h('div', { className: 'ss-quote-logo', textContent: 'PRECISION GLASS' }));
  header.appendChild(h('h3', { textContent: serviceTitle }));
  const progress = h('div', { className: 'ss-quote-progress' });
  progress.innerHTML = `
    <div class="ss-quote-progress-head">
      <span class="ss-quote-progress-label">Design progress</span>
      <span class="ss-quote-progress-count"><strong id="qs-progress-count">0</strong> / ${stepsForService.length} steps</span>
    </div>
    <div class="ss-quote-progress-track"><div class="ss-quote-progress-fill" id="qs-progress-fill"></div></div>
  `;
  header.appendChild(progress);
  card.appendChild(header);

  // Step checklist \u2014 each row checks off + reveals a thumbnail as it's chosen
  const steps = h('div', { className: 'ss-quote-steps', id: 'qs-steps' });
  stepsForService.forEach((f, i) => {
    const row = h('div', { className: 'ss-quote-step', id: `qs-step-${f.key}` });
    row.setAttribute('style', `--step-i:${i}`);
    const thumb = h('div', { className: 'ss-quote-step-thumb' });
    thumb.appendChild(h('span', { className: 'ss-quote-step-num', textContent: String(i + 1) }));
    thumb.appendChild(h('img', { id: `qst-${f.key}`, alt: '', loading: 'lazy' }));
    row.appendChild(thumb);
    const body = h('div', { className: 'ss-quote-step-body' });
    body.appendChild(h('span', { className: 'ss-quote-step-label', textContent: f.label }));
    body.appendChild(h('span', { className: 'ss-quote-step-value', id: `qs-${f.key}`, textContent: 'Pending' }));
    if (f.key === 'enclosure') {
      // Door-guidance sub-line lives under the enclosure (keeps #qs-doorPlacement for the report)
      body.appendChild(h('span', { className: 'ss-quote-step-sub', id: 'qs-doorPlacement' }));
    }
    row.appendChild(body);
    row.appendChild(h('span', { className: 'ss-quote-step-check', innerHTML: STEP_CHECK_SVG }));
    steps.appendChild(row);
  });
  card.appendChild(steps);

  // Compact contact block (kept for the printable proposal \u2014 fills as collected)
  const contact = h('div', { className: 'ss-quote-contact', id: 'qs-contact' });
  contact.appendChild(h('div', { className: 'ss-quote-contact-header', textContent: 'Your details' }));
  const contactRows = h('div', { className: 'ss-quote-contact-rows' });
  [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'timeline', label: 'Project Stage' },
    { key: 'notes', label: 'Notes' },
  ].forEach((f) => {
    const row = h('div', { className: 'ss-quote-row ss-quote-contact-row', id: `qs-contact-${f.key}` });
    row.appendChild(h('span', { className: 'ss-quote-label', textContent: f.label }));
    row.appendChild(h('span', { className: 'ss-quote-value', id: `qs-${f.key}`, textContent: '\u2014' }));
    contactRows.appendChild(row);
  });
  contact.appendChild(contactRows);
  card.appendChild(contact);
  layout.appendChild(card);

  // RIGHT — anticipation visualization → render reveal
  const imgWrap = h('div', { className: 'ss-quote-img-wrap' });
  // Blurred bathroom underlay (their uploaded photo, or a tasteful generic) that
  // builds anticipation while the render generates, then the render reveals on top.
  imgWrap.appendChild(h('img', { id: 'qs-viz-img', className: 'ss-quote-viz-bg', alt: '' }));
  imgWrap.appendChild(h('div', { className: 'ss-quote-scan', 'aria-hidden': 'true' }));
  const img = h('img', { id: 'qs-generated-img', className: 'ss-quote-gen-img', alt: imageAlt });
  const spinner = h('div', { className: 'ss-quote-spinner' });
  spinner.innerHTML = '<div class="ss-spinner"></div><span id="qs-spinner-status">Preparing your render…</span>';
  const spinnerStatus = spinner.querySelector('#qs-spinner-status');
  if (spinnerStatus) spinnerStatus.textContent = spinnerText;
  imgWrap.appendChild(img);
  imgWrap.appendChild(spinner);
  layout.appendChild(imgWrap);

  // "Quote sent" success overlay — first shows a celebratory check + message,
  // then morphs into an action panel with Start Over + Download buttons.
  const sentOverlay = h('div', { className: 'ss-quote-sent', id: 'qs-sent-overlay' });
  sentOverlay.innerHTML = `
    <div class="ss-quote-sent-card" id="qs-sent-card">
      <div class="ss-quote-sent-stage ss-quote-sent-stage-celebrate" id="qs-sent-stage-celebrate">
        <svg class="ss-quote-sent-check" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="11" class="ss-check-circle"/>
          <path d="M7 12.5l3.5 3.5L17 9" class="ss-check-mark"/>
        </svg>
        <h3>Proposal Prepared</h3>
        <p>Your design brief is ready for staff review. Pricing and timing stay with the human team.</p>
        <button class="ss-home-reset-btn" id="quote-home-btn" type="button">
          <span>Reset / Home</span>
        </button>
      </div>
      <div class="ss-quote-sent-stage ss-quote-sent-stage-actions" id="qs-sent-stage-actions">
        <h3>Save Your Brief</h3>
        <p>Keep the proposal summary and visualization for the staff follow-up.</p>
        <div class="ss-sent-actions">
          <button class="ss-action-btn ss-action-primary" id="qs-proposal-btn" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
            <span>Save PDF Proposal</span>
          </button>
          <button class="ss-action-btn ss-action-secondary" id="qs-download-btn" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>${downloadLabel}</span>
          </button>
          <button class="ss-action-btn ss-action-primary" id="quote-restart-btn" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            <span>Reset / Home</span>
          </button>
        </div>
      </div>
    </div>
  `;
  slide.appendChild(sentOverlay);

  // Wire button handlers (assigned after the slide is in the DOM via showQuoteSent)

  content.appendChild(layout);
  slide.appendChild(content);
  return slide;
}

/* ------------------------------------------------------------------ */
/*  Generic info slide (image + headline + bullets) for non-shower flows */
/* ------------------------------------------------------------------ */

function buildInfoSlide(opts: {
  id: string;
  label: string;
  heading: string;
  sub?: string;
  imageSrc: string;
  bullets: { title: string; desc: string }[];
}): HTMLElement {
  const slide = makeSlide(opts.id);
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader(opts.label, opts.heading, opts.sub));

  const layout = h('div', { className: 'ss-info-layout' });

  const imgWrap = h('div', { className: 'ss-info-img slide-el' });
  imgWrap.appendChild(h('img', { src: opts.imageSrc, alt: opts.heading }));
  layout.appendChild(imgWrap);

  const list = h('ul', { className: 'ss-info-bullets' });
  opts.bullets.forEach((b) => {
    const li = h('li', { className: 'ss-info-bullet slide-el' });
    li.appendChild(h('h4', { textContent: b.title }));
    li.appendChild(h('p', { textContent: b.desc }));
    list.appendChild(li);
  });
  layout.appendChild(list);

  content.appendChild(layout);
  slide.appendChild(content);
  return slide;
}

/* ------------------------------------------------------------------ */
/*  Railings flow                                                      */
/* ------------------------------------------------------------------ */

function buildRailIntroSlide(): HTMLElement {
  const slide = makeSlide('intro');
  const bg = h('div', { className: 'slide-bg' });
  bg.appendChild(h('img', { src: images.railings.hero, alt: 'Glass railing' }));
  slide.appendChild(bg);
  const content = h('div', { className: 'slide-content slide-center' });
  content.appendChild(h('h2', { className: 'slide-title slide-el', textContent: 'Architectural Glass Railings' }));
  content.appendChild(h('p', { className: 'slide-subtitle slide-el', textContent: 'Crystal-clear sightlines, code-compliant safety, and a sleek modern profile for stairs, decks, balconies, and pool surrounds.' }));
  slide.appendChild(content);
  return slide;
}

function buildRailGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('PORTFOLIO', 'Recent Railing Installations'));
  const container = h('div', { className: 'ss-gallery-fade slide-el' });
  images.railings.gallery.forEach((src, i) => {
    container.appendChild(h('img', { src, alt: `Railing ${i + 1}` }));
  });
  content.appendChild(container);
  slide.appendChild(content);
  return slide;
}

function buildRailTypesSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'rail-types',
    label: 'RAIL SYSTEMS',
    heading: 'Choose Your Railing System',
    sub: 'Four core systems — every install is engineered for your space and code requirements',
    imageSrc: images.railings.gallery[1],
    bullets: [
      { title: 'Frameless Glass Panel', desc: 'Top and bottom shoes hold the glass — no posts. Cleanest, most modern look. Perfect for unobstructed views.' },
      { title: 'Standoff Glass', desc: 'Heavy-duty stainless standoff buttons mount the glass to a wall, fascia, or stair stringer. Industrial elegance.' },
      { title: 'Posted Glass', desc: 'Stainless or aluminum posts at intervals with glass infill. Stronger feel, easier code compliance for elevated decks.' },
      { title: 'Cable Rail', desc: 'Tensioned stainless cable infill between metal posts. Maximum view, lower cost, popular for waterfront homes.' },
    ],
  });
}

function buildRailGlassSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'rail-glass',
    label: 'GLASS OPTIONS',
    heading: 'Glass Type & Thickness',
    sub: 'All railing glass is fully tempered to safety code',
    imageSrc: images.railings.gallery[2],
    bullets: [
      { title: 'Clear Tempered (1/2")', desc: 'The standard. Maximum transparency, fully tempered to ANSI Z97.1 / building code.' },
      { title: 'Low-Iron Ultra-Clear', desc: 'Eliminates the green tint of standard glass — water and sky look truer. Ideal for pools and oceanfront views.' },
      { title: 'Tinted (Bronze / Gray)', desc: 'Adds privacy and reduces glare. Pairs beautifully with darker hardware finishes.' },
      { title: 'Frosted / Acid-Etched', desc: 'Privacy panels for balconies and pool surrounds while still letting light through.' },
    ],
  });
}

function buildRailFinishSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'rail-finish',
    label: 'HARDWARE FINISH',
    heading: 'Pick Your Metal Finish',
    sub: 'All railing hardware is marine-grade — built for South Florida humidity and salt air',
    imageSrc: images.railings.gallery[3],
    bullets: [
      { title: 'Polished Stainless 316', desc: 'Bright mirror finish, marine grade. The classic look for pool decks and waterfront installations.' },
      { title: 'Brushed Satin Stainless', desc: 'Soft satin texture, hides fingerprints, modern look that pairs with most exterior tones.' },
      { title: 'Matte Black Aluminum', desc: 'Powder-coated aluminum, bold contemporary contrast against light siding or pale stone.' },
      { title: 'Bronze / Champagne', desc: 'Warm anodized finish for traditional and transitional homes.' },
    ],
  });
}

function buildRailMountingSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'rail-mounting',
    label: 'MOUNTING',
    heading: 'How It Attaches',
    sub: 'We engineer the right mount for your substrate — concrete, wood, steel, or stone',
    imageSrc: images.railings.gallery[4],
    bullets: [
      { title: 'Top Mount', desc: 'Anchors directly into the surface of the deck or stair tread. The most common — clean look, easy to install.' },
      { title: 'Side / Fascia Mount', desc: 'Mounts to the vertical face of the deck or balcony. Frees up walking surface, preferred for tight spaces.' },
      { title: 'Core-Drilled', desc: 'Posts set into a drilled and grouted hole in concrete. Strongest connection, ideal for commercial.' },
      { title: 'Embedded Shoe', desc: 'A continuous aluminum base shoe that hides the anchors entirely. The cleanest possible look.' },
    ],
  });
}

/* ------------------------------------------------------------------ */
/*  Commercial flow                                                    */
/* ------------------------------------------------------------------ */

function buildComIntroSlide(): HTMLElement {
  const slide = makeSlide('intro');
  const bg = h('div', { className: 'slide-bg' });
  bg.appendChild(h('img', { src: images.commercial.hero, alt: 'Commercial glass' }));
  slide.appendChild(bg);
  const content = h('div', { className: 'slide-content slide-center' });
  content.appendChild(h('h2', { className: 'slide-title slide-el', textContent: 'Commercial Glass & Storefront' }));
  content.appendChild(h('p', { className: 'slide-subtitle slide-el', textContent: 'Storefronts, curtain walls, office partitions, and custom architectural glass — engineered, fabricated, and installed by our licensed team.' }));
  slide.appendChild(content);
  return slide;
}

function buildComGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('PORTFOLIO', 'Recent Commercial Projects'));
  const container = h('div', { className: 'ss-gallery-fade slide-el' });
  images.commercial.gallery.forEach((src, i) => {
    container.appendChild(h('img', { src, alt: `Commercial ${i + 1}` }));
  });
  content.appendChild(container);
  slide.appendChild(content);
  return slide;
}

function buildComTypesSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'com-types',
    label: 'PROJECT TYPE',
    heading: 'What Are We Building?',
    sub: 'Tell us the scope and we\u2019ll bring the right engineering and crew',
    imageSrc: images.commercial.gallery[0],
    bullets: [
      { title: 'Storefront System', desc: 'Aluminum-framed entry walls with insulated glass, doors, transoms, and sidelites. Retail, restaurant, and office building entries.' },
      { title: 'Curtain Wall', desc: 'Multi-story exterior glazing systems, fully engineered, code-stamped, and installed with structural sealants.' },
      { title: 'Interior Partitions', desc: 'Frameless glass office walls, conference rooms, and demountable systems for modern open-plan workspaces.' },
      { title: 'Doors & Hardware', desc: 'All-glass entry doors, automatic sliders, herculite doors, and full hardware packages with closers and panic devices.' },
    ],
  });
}

function buildComGlassSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'com-glass',
    label: 'GLASS SPECIFICATIONS',
    heading: 'Glass Type & Performance',
    sub: 'Hurricane code, energy code, and aesthetic — we\u2019ll spec to your needs',
    imageSrc: images.commercial.gallery[1],
    bullets: [
      { title: 'Clear Insulated (IGU)', desc: 'Standard double-pane insulated units. Energy efficient, sound dampening, and the workhorse of commercial glazing.' },
      { title: 'Low-E Coated', desc: 'Energy-saving coating that reflects heat. Required for most Florida energy code compliance.' },
      { title: 'Hurricane / Impact Rated', desc: 'Laminated impact glass meeting Miami-Dade NOA and Florida Building Code. Mandatory for HVHZ projects.' },
      { title: 'Tinted / Spandrel / Frosted', desc: 'Privacy, solar control, and architectural accent options — bronze, gray, blue, frosted, or custom ceramic frit.' },
    ],
  });
}

function buildComFramingSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'com-framing',
    label: 'FRAMING',
    heading: 'Framing System',
    sub: 'From minimal to fully thermally broken - pick the right system for the look, code needs, and performance',
    imageSrc: images.commercial.gallery[2],
    bullets: [
      { title: 'Standard Aluminum', desc: 'Clear anodized or painted aluminum framing in 1-3/4" or 2" depths. Workhorse storefront system.' },
      { title: 'Thermally Broken', desc: 'Insulated aluminum frames that meet stricter energy code. Required for many new commercial builds.' },
      { title: 'Frameless / Minimal', desc: 'All-glass walls with point supports or slim ceiling tracks. Premium look for high-end retail and offices.' },
      { title: 'Stainless / Architectural', desc: 'Custom stainless steel, bronze, or specialty finishes for signature buildings and historic restorations.' },
    ],
  });
}

function buildComScopeSlide(): HTMLElement {
  return buildInfoSlide({
    id: 'com-scope',
    label: 'SCOPE',
    heading: 'Project Scale',
    sub: 'Tell us the size of the job - we handle everything from a single door to multi-story facades',
    imageSrc: images.commercial.gallery[3],
    bullets: [
      { title: 'Small / Repair', desc: 'Single door, a few panels, replacement glass, or hardware swap. Staff confirms urgency and site access before scheduling.' },
      { title: 'Medium Build-Out', desc: 'Office suite, restaurant front, retail tenant improvement. Staff reviews site conditions before quoting or scheduling.' },
      { title: 'Full Storefront', desc: 'New construction or major remodel storefront, doors, and signage glass. Engineering review comes before quoting or scheduling.' },
      { title: 'Curtain Wall / Multi-Story', desc: 'Engineered structural glazing, code stamping, and crane installation. Scope review determines the next step.' },
    ],
  });
}

export function showQuoteSent(): void {
  const overlay = document.getElementById('qs-sent-overlay');
  if (!overlay) return;
  void overlay.offsetWidth;
  overlay.classList.add('visible');
  // After the celebration animation has had time to land, fade the
  // celebrate stage out and reveal the action buttons.
  setTimeout(() => {
    overlay.classList.add('show-actions');
  }, 3200);

  // Wire up Reset/Home + Download buttons.
  for (const resetBtn of document.querySelectorAll<HTMLElement>('#quote-home-btn, #quote-restart-btn')) {
    resetBtn.addEventListener('click', () => window.location.reload(), { once: true });
  }
  const proposalBtn = document.getElementById('qs-proposal-btn');
  if (proposalBtn) {
    proposalBtn.addEventListener('click', openPrintableProposal);
  }
  const downloadBtn = document.getElementById('qs-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadVisualization);
  }
}

function downloadVisualization(): void {
  const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
  if (!img || !img.src || !img.classList.contains('loaded')) {
    console.warn('[Download] Visualization not ready yet');
    return;
  }
  const a = document.createElement('a');
  a.href = img.src;
  a.download = activeService === 'showers'
    ? 'precision-glass-shower-rendering.png'
    : activeService === 'railings'
      ? 'precision-glass-railing-reference.png'
      : 'precision-glass-commercial-reference.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function quoteValue(id: string): string {
  const value = document.getElementById(id)?.textContent?.trim() || '';
  return value === '—' ? '' : value;
}

function escapeReportText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function proposalRows(fields: Array<[string, string]>): string {
  return fields
    .map(([label, id]) => [label, quoteValue(id)] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `<tr><th>${escapeReportText(label)}</th><td>${escapeReportText(value)}</td></tr>`)
    .join('');
}

function openPrintableProposal(): void {
  const win = window.open('', '_blank', 'width=920,height=1100');
  if (!win) {
    console.warn('[Proposal] Popup blocked');
    return;
  }

  const image = document.getElementById('qs-generated-img') as HTMLImageElement | null;
  const imageAlt = activeService === 'showers' ? 'AI shower rendering' : 'Project reference image';
  const imageMarkup = image?.src && image.classList.contains('loaded')
    ? `<img class="rendering" src="${escapeReportText(image.src)}" alt="${escapeReportText(imageAlt)}">`
    : '<div class="rendering-placeholder">Project reference pending staff review</div>';

  const selectionRows = proposalRows([
    [activeService === 'commercial' ? 'Project type' : activeService === 'railings' ? 'Rail system' : 'Enclosure', 'qs-enclosure'],
    ['Door guidance', 'qs-doorPlacement'],
    ['Glass', 'qs-glass'],
    [activeService === 'commercial' ? 'Framing' : activeService === 'railings' ? 'Finish' : 'Hardware', 'qs-hardware'],
    [activeService === 'commercial' ? 'Scope' : activeService === 'railings' ? 'Mounting' : 'Handle', 'qs-handle'],
    ['Add-ons', 'qs-accessories'],
    ['Upgrades', 'qs-extras'],
  ]);
  const contactRows = proposalRows([
    ['Name', 'qs-name'],
    ['Email', 'qs-email'],
    ['Phone', 'qs-phone'],
    ['Location', 'qs-location'],
    ['Project stage', 'qs-timeline'],
    ['Notes', 'qs-notes'],
  ]);
  const service = activeService.charAt(0).toUpperCase() + activeService.slice(1);
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Precision Glass Proposal Brief</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 40px; font-family: Inter, Arial, sans-serif; color: #172033; background: #f6f8fb; }
    .page { max-width: 860px; margin: 0 auto; background: white; padding: 36px; border: 1px solid #d9e1ec; }
    .brand { font-size: 13px; text-transform: uppercase; letter-spacing: 0.16em; color: #3b82c4; font-weight: 800; }
    h1 { margin: 10px 0 8px; font-size: 34px; line-height: 1.08; color: #0c1930; }
    .sub { color: #5d6b82; line-height: 1.55; margin: 0 0 26px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
    .rendering { width: 100%; border-radius: 12px; border: 1px solid #d9e1ec; display: block; }
    .rendering-placeholder { min-height: 280px; border: 1px dashed #b9c7d9; border-radius: 12px; display: grid; place-items: center; color: #789; }
    h2 { margin: 0 0 12px; font-size: 16px; color: #0c1930; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
    th, td { border-top: 1px solid #e5ebf3; padding: 10px 0; text-align: left; vertical-align: top; font-size: 13px; }
    th { width: 38%; color: #637187; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
    td { color: #172033; font-weight: 650; }
    .note { margin-top: 24px; padding: 14px 16px; background: #edf6ff; border: 1px solid #c7e3ff; border-radius: 10px; color: #36506f; font-size: 12px; line-height: 1.5; }
    @media print { body { background: white; padding: 0; } .page { border: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <div class="brand">Precision Glass</div>
    <h1>${escapeReportText(service)} Proposal Brief</h1>
    <p class="sub">Prepared ${escapeReportText(today)} from the interactive design session. This is a design-intake brief for staff review, not a final quote, price, or installation schedule.</p>
    <div class="grid">
      <section>
        <h2>Configuration</h2>
        <table>${selectionRows || '<tr><td>No selections captured yet.</td></tr>'}</table>
        <h2>Customer Details</h2>
        <table>${contactRows || '<tr><td>No contact details captured yet.</td></tr>'}</table>
      </section>
      <section>${imageMarkup}</section>
    </div>
    <div class="note">Staff should verify field measurements, site conditions, code requirements, anchoring or framing details, access, hardware placement, and final scope before quoting or scheduling.</div>
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`);
  win.document.close();
}
