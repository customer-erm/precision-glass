/**
 * Cinematic full-viewport slideshow.
 * Three service flows: showers (full configurator + AI visualization),
 * railings (info-style walkthrough), commercial (info-style walkthrough).
 */
import { images } from '../data/image-map';
import { getBathroomPhoto } from '../utils/bathroom-photo';
import { addInfoButton } from '../sections/buyer-guide-modal';
import { getState, setState } from '../utils/state';
import { saveUser } from '../utils/user-storage';
import { emitPreview } from '../experience/events';

export type ServiceType = 'showers' | 'railings' | 'commercial';

let slideshowEl: HTMLElement | null = null;
let currentSlide: HTMLElement | null = null;
let currentSlideId: string | null = null;
let activeService: ServiceType = 'showers';
let activeSlideOrder: string[] = [];
let infoIntroHighlighted = false;

export function getCurrentSlideId(): string | null {
  return currentSlideId;
}
export function getActiveService(): ServiceType {
  return activeService;
}
let galleryInterval: ReturnType<typeof setInterval> | null = null;
let carouselInterval: ReturnType<typeof setInterval> | null = null; // legacy, retained for safety

const SLIDE_ORDER_BY_SERVICE: Record<ServiceType, string[]> = {
  showers: ['intro', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process', 'quote'],
  railings: ['intro', 'gallery', 'rail-types', 'rail-glass', 'rail-finish', 'rail-mounting', 'process', 'quote'],
  commercial: ['intro', 'gallery', 'com-types', 'com-glass', 'com-framing', 'com-scope', 'process', 'quote'],
};

/* ---- Public API ---- */

export function createSlideshow(service: ServiceType = 'showers'): void {
  if (slideshowEl) return;
  activeService = service;
  activeSlideOrder = SLIDE_ORDER_BY_SERVICE[service];
  infoIntroHighlighted = false;
  readyQuoteImageUrl = null;
  quoteRevealed = false;

  const ss = document.createElement('div');
  ss.id = 'tour-slideshow';
  ss.className = 'tour-slideshow';
  ss.dataset.service = service;

  ss.appendChild(h('div', { className: 'ss-progress', innerHTML: '<div class="ss-progress-bar" id="ss-progress-bar"></div>' }));
  ss.appendChild(h('div', { className: 'ss-counter', id: 'ss-counter', textContent: '1 / ' + activeSlideOrder.length }));

  if (service === 'showers') {
    ss.appendChild(buildIntroSlide());
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
  wireSharedOptionPreview(ss);
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

      runSlideAssembly(target);
      if (activeService === 'showers' && slideId === 'enclosures') {
        window.setTimeout(() => highlightInfoButtons(target), 900);
      }

      if (slideId === 'gallery') {
        startGalleryFade();
        // Buyer's guide popup only on the showers gallery slide
        if (activeService === 'showers') {
          const guideDelay = document.body.classList.contains('chat-active') ? 900 : 6000;
          setTimeout(() => {
            if (currentSlideId === 'gallery') showBuyerGuidePopup();
          }, guideDelay);
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

function highlightInfoButtons(target: HTMLElement): void {
  if (infoIntroHighlighted) return;
  const buttons = Array.from(target.querySelectorAll<HTMLElement>('.card-info-btn'));
  if (!buttons.length) return;
  infoIntroHighlighted = true;
  target.classList.add('info-intro-active');
  window.setTimeout(() => target.classList.remove('info-intro-active'), 5600);
  buttons.forEach((btn, i) => {
    btn.style.setProperty('--info-pulse-delay', `${i * 90}ms`);
    btn.classList.add('info-intro-highlight');
    window.setTimeout(() => btn.classList.remove('info-intro-highlight'), 5200);
  });
}

function runSlideAssembly(target: HTMLElement): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = Array.from(target.querySelectorAll<HTMLElement>('.slide-el'));
  els.forEach((el) => {
    el.classList.remove('revealed', 'assembling');
    el.getAnimations().forEach((animation) => animation.cancel());
  });

  const headingEls = target.querySelectorAll<HTMLElement>('.slide-title, .slide-heading, .slide-label, .slide-subtitle, .slide-sub');
  headingEls.forEach((el) => {
    el.classList.remove('text-assembling');
    el.getAnimations().forEach((animation) => animation.cancel());
  });

  if (reduced) {
    els.forEach((el) => el.classList.add('revealed'));
    return;
  }

  els.forEach((el, i) => {
    const isCard = el.matches('.ss-enc-card, .ss-glass-card, .ss-hw-card, .ss-acc-card, .ss-extra-card, .ss-process-step, .ss-info-bullet');
    const delay = 90 + i * (isCard ? 58 : 100);
    window.setTimeout(() => {
      el.classList.add('revealed', 'assembling');
      el.animate([
        {
          opacity: 0,
          transform: isCard ? 'translate3d(18px, 10px, 0) scale(0.94)' : 'translate3d(0, 22px, 0) scale(0.98)',
          filter: 'blur(10px)',
          clipPath: 'inset(0 100% 0 0)',
        },
        {
          opacity: 0.72,
          transform: isCard ? 'translate3d(-2px, -1px, 0) scale(1.015)' : 'translate3d(0, -2px, 0) scale(1.005)',
          filter: 'blur(1px)',
          clipPath: 'inset(0 0 0 0)',
          offset: 0.78,
        },
        {
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)',
          filter: 'blur(0)',
          clipPath: 'inset(0 0 0 0)',
        },
      ], {
        duration: isCard ? 620 : 760,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both',
      });
      window.setTimeout(() => el.classList.remove('assembling'), 850);
    }, delay);
  });

  headingEls.forEach((el, i) => {
    window.setTimeout(() => {
      el.classList.add('text-assembling');
      window.setTimeout(() => el.classList.remove('text-assembling'), 820);
    }, 90 + i * 80);
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
  if (label) wrap.appendChild(h('div', { className: 'slide-label', textContent: label }));
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
      <button class="bg-popup-email-toggle" type="button" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
        <span>Enter email</span>
      </button>
      <form class="bg-popup-email-form" hidden>
        <input type="email" required placeholder="you@example.com" aria-label="Email for buyer's guide" />
        <button type="submit">Send</button>
      </form>
      <div class="bg-popup-confirm" hidden>We'll send it right over.</div>
    `;
    document.body.appendChild(popup);
    wireBuyerGuidePopup(popup);
  }
  // Force reflow then add visible class for animation
  void popup.offsetWidth;
  popup.classList.add('visible');
}

function wireBuyerGuidePopup(popup: HTMLElement): void {
  const toggle = popup.querySelector<HTMLButtonElement>('.bg-popup-email-toggle');
  const form = popup.querySelector<HTMLFormElement>('.bg-popup-email-form');
  const input = popup.querySelector<HTMLInputElement>('.bg-popup-email-form input');
  const confirm = popup.querySelector<HTMLElement>('.bg-popup-confirm');
  toggle?.addEventListener('click', () => {
    if (!form || !input) return;
    const open = form.hidden;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  });
  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!input?.value || !input.checkValidity()) {
      input?.reportValidity();
      return;
    }
    const email = input.value.trim();
    setState({ customerEmail: email });
    saveUser({ email });
    form.hidden = true;
    if (confirm) confirm.hidden = false;
    toggle?.setAttribute('aria-expanded', 'false');
  });
}

function optionLabel(card: HTMLElement): string {
  return (card.getAttribute('data-label') || card.querySelector('h4')?.textContent || '').trim();
}

function previewCategory(slideId: string, card: HTMLElement): string | null {
  if (slideId === 'accessories') {
    return card.getAttribute('data-accessory-kind') === 'addon' ? 'accessories' : 'handle';
  }
  const bySlide: Record<string, string> = {
    enclosures: 'enclosure',
    glass: 'glass',
    hardware: 'hardware',
    extras: 'extras',
    'rail-types': 'rail-type',
    'rail-glass': 'rail-glass',
    'rail-finish': 'rail-finish',
    'rail-mounting': 'rail-mounting',
    'com-types': 'com-type',
    'com-glass': 'com-glass',
    'com-framing': 'com-framing',
    'com-scope': 'com-scope',
  };
  return bySlide[slideId] || null;
}

function previewValue(slideId: string, label: string): string {
  if (slideId !== 'extras') return label;
  if (/none|skip|no upgrade/i.test(label)) return 'none';
  if (/steam/i.test(label)) return 'Steam Upgrade';
  if (/grid/i.test(label)) return 'Grid Patterns';
  return label;
}

function selectedExtrasPreviewValue(slide: HTMLElement | null): string {
  const selected = Array.from(slide?.querySelectorAll<HTMLElement>('.ss-extra-card.selected') ?? [])
    .map(optionLabel)
    .join(' ');
  const grid = /grid/i.test(selected);
  const steam = /steam/i.test(selected);
  if (grid && steam) return 'Grid Patterns + Steam Upgrade';
  if (grid) return 'Grid Patterns';
  if (steam) return 'Steam Upgrade';
  return 'none';
}

function wireSharedOptionPreview(root: HTMLElement): void {
  root.addEventListener('click', (ev) => {
    const mode = getState().currentMode;
    if (mode === 'browse' || mode === 'chat') return;
    const target = ev.target as HTMLElement;
    if (target.closest('.card-info-btn')) return;
    const card = target.closest<HTMLElement>('.ss-enc-card, .ss-glass-card, .ss-hw-card, .ss-acc-card, .ss-extra-card, .ss-rail-card, .ss-com-card');
    if (!card) return;
    const slide = card.closest<HTMLElement>('.tour-slide');
    const slideId = slide?.id.replace(/^slide-/, '') || '';
    const category = previewCategory(slideId, card);
    const label = optionLabel(card);
    if (!category || !label) return;

    card.classList.add('browse-option');
    if (slideId === 'accessories' && category === 'accessories') {
      card.classList.toggle('selected');
    } else if (slideId === 'extras') {
      if (/none|skip|no upgrade/i.test(label)) {
        slide?.querySelectorAll<HTMLElement>('.ss-extra-card.selected').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
      } else {
        slide?.querySelectorAll<HTMLElement>('.ss-extra-none.selected').forEach((el) => el.classList.remove('selected'));
        card.classList.toggle('selected');
      }
    } else {
      slide?.querySelectorAll<HTMLElement>('.browse-option.selected').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
    }
    emitPreview(category, slideId === 'extras' ? selectedExtrasPreviewValue(slide) : previewValue(slideId, label));
  });
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

  const timeline = h('div', { className: 'ss-intro-timeline', 'aria-label': 'Shower designer steps' });
  [
    ['01', 'Choose Layout', 'Pick the enclosure style that fits the opening.'],
    ['02', 'Select Glass', 'Clear, privacy, or textured glass direction.'],
    ['03', 'Hardware Finish', 'Match the room with chrome, nickel, black, or brass.'],
    ['04', 'Handles & Add-ons', 'Dial in pulls, towel bars, hooks, grids, or steam.'],
    ['05', 'Visualize Design', 'Generate the final shower visualization.'],
  ].forEach(([num, title, desc], i) => {
    const step = h('div', { className: 'ss-intro-step slide-el' });
    step.style.setProperty('--step-index', String(i));
    step.appendChild(h('span', { className: 'ss-intro-step-num', textContent: num }));
    const copy = h('div', { className: 'ss-intro-step-copy' });
    copy.appendChild(h('strong', { textContent: title }));
    copy.appendChild(h('span', { textContent: desc }));
    step.appendChild(copy);
    timeline.appendChild(step);
  });
  slide.appendChild(timeline);
  return slide;
}

function buildGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });
  // Showers: a single-at-a-time 9:16 portrait cross-fade of real install photos.
  // Other services keep the 16:9 cross-fade.
  const vertical = activeService === 'showers' && images.showers.galleryVertical.length
    ? images.showers.galleryVertical
    : null;
  const srcs = vertical ?? images[activeService].gallery;
  const container = h('div', { className: `ss-gallery-fade slide-el${vertical ? ' ss-gallery-portrait' : ''}` });
  srcs.forEach((src, i) => {
    container.appendChild(h('img', { src, alt: `Installation ${i + 1}` }));
  });
  content.appendChild(container);
  slide.appendChild(content);
  // Section title, pinned top-left of the slide (hidden during the chat tour).
  slide.appendChild(makeHeader('', 'Recent Work'));
  return slide;
}

function buildEnclosuresSlide(): HTMLElement {
  const slide = makeSlide('enclosures');
  const content = h('div', { className: 'slide-content' });
  const count = images.showers.enclosures.length;
  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Configuration', `All ${count} styles \u2014 every layout we build`));

  const grid = h('div', { className: 'ss-enc-grid slide-el' });
  images.showers.enclosures.forEach((item) => {
    const card = h('div', { className: 'ss-enc-card browse-option', 'data-label': item.label });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    addInfoButton(card, item.label);
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildGlassSlide(): HTMLElement {
  const slide = makeSlide('glass');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('GLASS OPTIONS', 'Select Your Glass', 'Common choices shown - additional glass styles on request'));
  const grid = h('div', { className: 'ss-glass-grid' });
  images.showers.glass.forEach((item) => {
    const card = h('div', { className: 'ss-glass-card slide-el browse-option', 'data-label': item.label });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    addInfoButton(card, item.label);
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildHardwareSlide(): HTMLElement {
  const slide = makeSlide('hardware');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('HARDWARE FINISHES', 'Choose Your Finish', 'More hardware styles and specialty finishes available on request'));
  const grid = h('div', { className: 'ss-hw-grid' });
  images.showers.hardware.filter(i => i.id !== 'hw-other').forEach((item) => {
    const card = h('div', { className: 'ss-hw-card slide-el browse-option', 'data-label': item.label });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    card.appendChild(h('h4', { textContent: item.label }));
    card.appendChild(h('p', { textContent: item.desc }));
    addInfoButton(card, item.label);
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
  const items = ['acc-pull', 'acc-uhandle', 'acc-ladder', 'acc-knob', 'acc-towel', 'acc-hook'];
  const grid = h('div', { className: 'ss-acc-grid' });
  images.showers.accessories.filter(a => items.includes(a.id)).forEach((item) => {
    const kind = item.id === 'acc-hook' ? 'addon' : 'handle';
    const card = h('div', { className: 'ss-acc-card slide-el browse-option', 'data-accessory-kind': kind, 'data-label': item.label });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    addInfoButton(card, item.label);
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
    const card = h('div', { className: 'ss-extra-card slide-el browse-option', 'data-label': 'Decorative Grid Patterns' });
    card.appendChild(h('img', { src: gridImg.src, alt: 'Grid Patterns' }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: 'Decorative Grid Patterns' }));
    info.appendChild(h('p', { textContent: 'French, colonial, or custom grid designs applied to your glass panels for architectural character.' }));
    card.appendChild(info);
    addInfoButton(card, 'Decorative Grid Patterns');
    grid.appendChild(card);
  }

  const steamImg = images.showers.enclosures.find(e => e.id === 'enc-steam');
  if (steamImg) {
    const card = h('div', { className: 'ss-extra-card slide-el browse-option', 'data-label': 'Steam Shower Enclosure' });
    card.appendChild(h('img', { src: steamImg.src, alt: 'Steam Shower' }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('h4', { textContent: 'Steam Shower Enclosure' }));
    info.appendChild(h('p', { textContent: 'Fully sealed floor-to-ceiling glass for a complete spa experience at home.' }));
    card.appendChild(info);
    addInfoButton(card, 'Steam Shower Enclosure');
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
      ['neo', 'Neo-Angle'], ['slider', 'Frameless Slider'], ['slide', 'Frameless Slider'],
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
    return find(images.showers.accessories, [['towel', 'Towel Bars'], ['hook', 'Robe Hooks'], ['robe', 'Robe Hooks'], ['grid', 'Grid Patterns']]);
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
let readyQuoteImageUrl: string | null = null;

function updateBeforeAfterPosition(root: HTMLElement, value: string | number): void {
  const n = typeof value === 'number' ? value : Number(value);
  root.style.setProperty('--ba-pos', `${Number.isFinite(n) ? n : 50}%`);
}

function wireBeforeAfterSlider(root: HTMLElement): void {
  if (root.dataset.baWired === 'true') return;
  const input = root.querySelector<HTMLInputElement>('.ss-ba-range');
  if (!input) return;
  root.dataset.baWired = 'true';
  updateBeforeAfterPosition(root, input.value || 50);
  input.addEventListener('input', () => updateBeforeAfterPosition(root, input.value));
}

function setBeforeAfterImages(renderUrl: string): void {
  const photo = activeService === 'showers' ? getBathroomPhoto() : null;
  const wrap = document.querySelector<HTMLElement>('.ss-quote-img-wrap');
  const compare = document.getElementById('qs-before-after') as HTMLElement | null;
  const before = document.getElementById('qs-before-img') as HTMLImageElement | null;
  const after = document.getElementById('qs-after-img') as HTMLImageElement | null;
  if (!wrap || !compare || !before || !after) return;

  if (!photo?.dataUrl) {
    wrap.classList.remove('compare-active');
    compare.classList.remove('ready');
    return;
  }

  before.src = photo.dataUrl;
  after.onload = () => compare.classList.add('ready');
  after.src = renderUrl;
  if (after.complete) compare.classList.add('ready');
  wrap.classList.add('compare-active');
  wireBeforeAfterSlider(compare);
}

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
  for (const k of ['name', 'email', 'phone', 'address', 'location', 'timeline', 'budget', 'notes']) {
    const v = (choices[k] || '').trim();
    if (!v) continue;
    const el = document.getElementById(`qs-${k}`);
    if (el) { el.textContent = v; el.classList.add('filled'); }
    document.getElementById(`qs-contact-${k}`)?.classList.add('filled');
  }
  if (!choices.address && choices.location) {
    const el = document.getElementById('qs-address');
    if (el) { el.textContent = choices.location; el.classList.add('filled'); }
    document.getElementById('qs-contact-address')?.classList.add('filled');
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
  readyQuoteImageUrl = url || readyQuoteImageUrl;
  const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
  if (img && readyQuoteImageUrl) {
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => console.warn('[Quote] Generated image failed to render in the quote slide');
    img.src = readyQuoteImageUrl;
    if (img.complete) img.classList.add('loaded');
    setBeforeAfterImages(readyQuoteImageUrl);
  }
  quoteRevealed = true;
  stopQuoteStatusCycle();
  document.querySelector('.ss-quote-img-wrap')?.classList.add('revealed', 'has-image');
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (spinner) spinner.style.display = 'none';
  const inlineActions = document.getElementById('qs-inline-actions');
  if (inlineActions) inlineActions.classList.add('ready');
  wireQuoteActionButtons();
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

  const hiddenFields = h('div', { className: 'ss-quote-hidden-fields', 'aria-hidden': 'true' });
  ['name', 'email', 'phone', 'address', 'location', 'timeline', 'budget', 'notes'].forEach((key) => {
    hiddenFields.appendChild(h('span', { id: `qs-${key}`, textContent: '\u2014' }));
  });
  card.appendChild(hiddenFields);
  layout.appendChild(card);

  // RIGHT — anticipation visualization → render reveal
  const visualCol = h('div', { className: 'ss-quote-visual-col' });
  const imgWrap = h('div', { className: 'ss-quote-img-wrap' });
  // Blurred bathroom underlay (their uploaded photo, or a tasteful generic) that
  // builds anticipation while the render generates, then the render reveals on top.
  imgWrap.appendChild(h('img', { id: 'qs-viz-img', className: 'ss-quote-viz-bg', alt: '' }));
  imgWrap.appendChild(h('div', { className: 'ss-quote-scan', 'aria-hidden': 'true' }));
  const img = h('img', { id: 'qs-generated-img', className: 'ss-quote-gen-img', alt: imageAlt }) as HTMLImageElement;
  const beforeAfter = h('div', { id: 'qs-before-after', className: 'ss-before-after', 'aria-label': 'Before and after shower visualization comparison' });
  beforeAfter.appendChild(h('img', { id: 'qs-before-img', className: 'ss-ba-img ss-ba-before', alt: 'Uploaded bathroom before photo' }));
  const afterClip = h('div', { className: 'ss-ba-after' });
  afterClip.appendChild(h('img', { id: 'qs-after-img', className: 'ss-ba-img', alt: imageAlt }));
  beforeAfter.appendChild(afterClip);
  beforeAfter.appendChild(h('span', { className: 'ss-ba-label ss-ba-before-label', textContent: 'Before' }));
  beforeAfter.appendChild(h('span', { className: 'ss-ba-label ss-ba-after-label', textContent: 'After' }));
  beforeAfter.appendChild(h('span', { className: 'ss-ba-handle', 'aria-hidden': 'true' }));
  beforeAfter.appendChild(h('input', { className: 'ss-ba-range', type: 'range', min: '0', max: '100', value: '50', ariaLabel: 'Compare before and after visualization' }));
  const spinner = h('div', { className: 'ss-quote-spinner' });
  spinner.innerHTML = '<div class="ss-spinner"></div><span id="qs-spinner-status">Preparing your render…</span>';
  const spinnerStatus = spinner.querySelector('#qs-spinner-status');
  if (spinnerStatus) spinnerStatus.textContent = spinnerText;
  imgWrap.appendChild(img);
  imgWrap.appendChild(beforeAfter);
  imgWrap.appendChild(spinner);
  visualCol.appendChild(imgWrap);
  const inlineActions = h('div', { className: 'ss-quote-inline-actions', id: 'qs-inline-actions' });
  inlineActions.innerHTML = `
    <button class="ss-action-btn ss-action-primary" id="qs-inline-proposal-btn" type="button">
      <span>Save PDF Proposal</span>
    </button>
    <button class="ss-action-btn ss-action-secondary" id="qs-inline-download-btn" type="button">
      <span>${downloadLabel}</span>
    </button>
  `;
  visualCol.appendChild(inlineActions);
  layout.appendChild(visualCol);
  if (readyQuoteImageUrl) {
    img.onload = () => img.classList.add('loaded');
    img.src = readyQuoteImageUrl;
    if (img.complete) img.classList.add('loaded');
    setBeforeAfterImages(readyQuoteImageUrl);
    imgWrap.classList.add('revealed', 'has-image');
    spinner.style.display = 'none';
    inlineActions.classList.add('ready');
  }

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
  wireQuoteActionButtons();
}

function wireQuoteActionButtons(): void {
  [
    document.getElementById('qs-proposal-btn'),
    document.getElementById('qs-inline-proposal-btn'),
  ].forEach((btn) => {
    if (!btn || btn.dataset.wired === 'true') return;
    btn.dataset.wired = 'true';
    btn.addEventListener('click', () => { void downloadProposalPdf(); });
  });
  [
    document.getElementById('qs-download-btn'),
    document.getElementById('qs-inline-download-btn'),
  ].forEach((btn) => {
    if (!btn || btn.dataset.wired === 'true') return;
    btn.dataset.wired = 'true';
    btn.addEventListener('click', downloadVisualization);
  });
}

async function downloadProposalPdf(): Promise<void> {
  const serviceName = activeService.charAt(0).toUpperCase() + activeService.slice(1);
  const rows = [
    ['Service', serviceName],
    [activeService === 'commercial' ? 'Project type' : activeService === 'railings' ? 'Rail system' : 'Enclosure', quoteValue('qs-enclosure')],
    ['Door guidance', quoteValue('qs-doorPlacement')],
    ['Glass', quoteValue('qs-glass')],
    [activeService === 'commercial' ? 'Framing' : activeService === 'railings' ? 'Finish' : 'Hardware', quoteValue('qs-hardware')],
    [activeService === 'commercial' ? 'Scope' : activeService === 'railings' ? 'Mounting' : 'Handle', quoteValue('qs-handle')],
    ['Add-ons', quoteValue('qs-accessories')],
    ['Upgrades', quoteValue('qs-extras')],
    ['Name', quoteValue('qs-name')],
    ['Email', quoteValue('qs-email')],
    ['Phone', quoteValue('qs-phone')],
    ['Address', quoteValue('qs-address') || quoteValue('qs-location')],
    ['Budget', quoteValue('qs-budget')],
    ['Project stage', quoteValue('qs-timeline')],
    ['Notes', quoteValue('qs-notes')],
  ].filter(([, value]) => value);

  const image = await proposalImageJpeg();
  const pdf = makeSimplePdf({
    title: `${serviceName} Proposal Brief`,
    subtitle: `Prepared ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. Design-intake brief for staff review, not a final quote or schedule.`,
    rows,
    image,
  });
  saveBlob(pdf, 'precision-glass-proposal.pdf');
}

async function proposalImageJpeg(): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const source = document.getElementById('qs-generated-img') as HTMLImageElement | null;
  if (!source?.src || !source.classList.contains('loaded')) return null;
  try {
    const img = await loadImage(source.src);
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const hgt = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, hgt);
    ctx.drawImage(img, 0, 0, w, hgt);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return { bytes: dataUrlToBytes(dataUrl), width: w, height: hgt };
  } catch (err) {
    console.warn('[Proposal] Image embed failed:', err);
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBlobBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function makeSimplePdf(opts: {
  title: string;
  subtitle: string;
  rows: string[][];
  image: { bytes: Uint8Array; width: number; height: number } | null;
}): Blob {
  const enc = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(toBlobBuffer(bytes));
    len += bytes.length;
  };
  const obj = (body: string | Uint8Array, prefix = '', suffix = '') => {
    offsets.push(len);
    push(`${offsets.length} 0 obj\n${prefix}`);
    push(body);
    push(`${suffix}\nendobj\n`);
  };

  const imageName = opts.image ? '/Im1' : '';
  const lines: string[] = [];
  const textAt = (x: number, y: number, size: number, value: string) => {
    lines.push(`BT /F1 ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`);
  };
  const strokeLine = (x1: number, y1: number, x2: number, y2: number) => {
    lines.push(`0.72 0.80 0.88 RG 0.8 w ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const block = (x: number, y: number, maxChars: number, size: number, values: string[], leading = size + 5): number => {
    let cursor = y;
    for (const value of values) {
      for (const line of wrapPdfLine(value, maxChars)) {
        textAt(x, cursor, size, line);
        cursor -= leading;
      }
    }
    return cursor;
  };
  const rowBlock = (x: number, y: number, rows: string[][], maxChars: number): number => {
    let cursor = y;
    for (const [label, value] of rows) {
      textAt(x, cursor, 8, label.toUpperCase());
      cursor -= 12;
      for (const line of wrapPdfLine(value, maxChars)) {
        textAt(x, cursor, 10, line);
        cursor -= 13;
      }
      cursor -= 5;
    }
    return cursor;
  };

  const customerLabels = new Set(['Name', 'Email', 'Phone', 'Address', 'Budget', 'Project stage', 'Notes']);
  const configRows = opts.rows.filter(([label]) => !customerLabels.has(label));
  const customerRows = opts.rows.filter(([label]) => customerLabels.has(label));

  textAt(42, 758, 10, 'PRECISION GLASS');
  textAt(394, 758, 9, '(555) 014-4527');
  textAt(394, 744, 9, '1234 Sample Road, South Florida');
  textAt(394, 730, 9, 'precisionglass.example');
  strokeLine(42, 718, 570, 718);

  textAt(42, 684, 24, opts.title);
  block(42, 662, 76, 10, [opts.subtitle], 14);

  textAt(42, 618, 13, 'Configuration');
  rowBlock(42, 596, configRows.slice(0, 9), 42);

  let imageDraw = '';
  if (opts.image) {
    const maxW = 220;
    const maxH = 220;
    const scale = Math.min(maxW / opts.image.width, maxH / opts.image.height);
    const w = Math.round(opts.image.width * scale);
    const hgt = Math.round(opts.image.height * scale);
    const x = 350;
    const y = 396 + (maxH - hgt);
    textAt(x, 618, 13, 'Visualization');
    imageDraw = `q ${w} 0 0 ${hgt} ${x} ${y} cm ${imageName} Do Q`;
  } else {
    textAt(350, 618, 13, 'Visualization');
    block(350, 596, 34, 10, ['Rendering unavailable. Staff can still review the configuration and follow up.'], 14);
  }

  strokeLine(42, 362, 570, 362);
  textAt(42, 334, 13, 'Customer Details');
  rowBlock(42, 312, customerRows.slice(0, 7), 38);

  textAt(330, 334, 13, 'Next Steps');
  block(330, 312, 40, 10, [
    '1. Precision Glass reviews the design selections and project notes.',
    '2. A specialist confirms dimensions, curb or threshold conditions, and hinge or handle placement.',
    '3. Staff follows up to schedule field measurement and prepare a formal quote.',
    '4. Final pricing and installation timing are confirmed after measurements and scope review.',
  ], 14);

  strokeLine(42, 80, 570, 80);
  textAt(42, 58, 8, 'Design-intake document only. Not a final quote, contract, engineering drawing, or installation schedule.');

  const stream = `${lines.join('\n')}\n${imageDraw}\n`;

  push('%PDF-1.4\n');
  obj('<< /Type /Catalog /Pages 2 0 R >>');
  obj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> ${opts.image ? `/XObject << ${imageName} 5 0 R >>` : ''} >> /Contents ${opts.image ? '6' : '5'} 0 R >>`);
  obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  if (opts.image) {
    obj(opts.image.bytes, `<< /Type /XObject /Subtype /Image /Width ${opts.image.width} /Height ${opts.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${opts.image.bytes.length} >>\nstream\n`, '\nendstream');
  }
  obj(stream, `<< /Length ${enc.encode(stream).length} >>\nstream\n`, 'endstream');

  const xrefAt = len;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((off) => push(`${String(off).padStart(10, '0')} 00000 n \n`));
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function wrapPdfLine(value: string, max: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadVisualization(): Promise<void> {
  const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
  if (!img || !img.src || !img.classList.contains('loaded')) {
    console.warn('[Download] Visualization not ready yet');
    return;
  }
  const filename = activeService === 'showers'
    ? 'precision-glass-shower-rendering.png'
    : activeService === 'railings'
      ? 'precision-glass-railing-reference.png'
      : 'precision-glass-commercial-reference.png';
  try {
    const blob = img.src.startsWith('data:')
      ? new Blob([toBlobBuffer(dataUrlToBytes(img.src))], { type: img.src.slice(5, img.src.indexOf(';')) || 'image/png' })
      : await fetch(img.src).then((res) => res.blob());
    saveBlob(blob, filename);
  } catch (err) {
    console.warn('[Download] Blob save failed, falling back to link:', err);
    const a = document.createElement('a');
    a.href = img.src;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function quoteValue(id: string): string {
  const value = document.getElementById(id)?.textContent?.trim() || '';
  return value === '—' || value === 'â€”' ? '' : value;
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

// Snapshot the live WebGL stage (the parametric 3D design) as a compact JPEG
// data URL for the proposal. Returns '' if the canvas isn't capturable.
function captureStageRender(): string {
  const src = document.getElementById('stage-canvas') as HTMLCanvasElement | null;
  if (!src || !src.width || !src.height) return '';
  try {
    const maxW = 900;
    const scale = Math.min(1, maxW / src.width);
    const w = Math.round(src.width * scale);
    const hgt = Math.round(src.height * scale);
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = hgt;
    const ctx = tmp.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(src, 0, 0, w, hgt);
    const url = tmp.toDataURL('image/jpeg', 0.9);
    return url.length > 5000 ? url : '';
  } catch (err) {
    console.warn('[Proposal] 3D render capture failed', err);
    return '';
  }
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

  const renderUrl = captureStageRender();
  const renderMarkup = renderUrl
    ? `<h2>3D Design Render</h2><img class="rendering" src="${renderUrl}" alt="3D design render">`
    : '';

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
    ['Address', 'qs-address'],
    ['Budget', 'qs-budget'],
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
      <section>
        ${renderMarkup}
        <h2${renderMarkup ? ' style="margin-top:20px;"' : ''}>AI Visualization</h2>
        ${imageMarkup}
      </section>
    </div>
    <div class="note">Staff should verify field measurements, site conditions, code requirements, anchoring or framing details, access, hardware placement, and final scope before quoting or scheduling.</div>
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`);
  win.document.close();
}
