/**
 * Cinematic full-viewport slideshow.
 * Each slide uses the full screen with large imagery and elegant transitions.
 * Reduced to 4 enclosure options, large cards, no tiny rows.
 */
import { images } from '../data/image-map';

let slideshowEl: HTMLElement | null = null;
let currentSlide: HTMLElement | null = null;

const SLIDE_ORDER = ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'process'];
const TOTAL_SLIDES = SLIDE_ORDER.length;

/* ---- Public API ---- */

export function createSlideshow(): void {
  if (slideshowEl) return;

  const ss = document.createElement('div');
  ss.id = 'tour-slideshow';
  ss.className = 'tour-slideshow';

  // Progress bar
  const progress = document.createElement('div');
  progress.className = 'ss-progress';
  progress.innerHTML = '<div class="ss-progress-bar" id="ss-progress-bar"></div>';
  ss.appendChild(progress);

  // Slide counter
  const counter = document.createElement('div');
  counter.className = 'ss-counter';
  counter.id = 'ss-counter';
  counter.textContent = '1 / 7';
  ss.appendChild(counter);

  // Build all slides
  ss.appendChild(buildIntroSlide());
  ss.appendChild(buildGallerySlide());
  ss.appendChild(buildEnclosuresSlide());
  ss.appendChild(buildGlassSlide());
  ss.appendChild(buildHardwareSlide());
  ss.appendChild(buildAccessoriesSlide());
  ss.appendChild(buildProcessSlide());

  document.body.appendChild(ss);
  slideshowEl = ss;

  requestAnimationFrame(() => {
    ss.classList.add('active');
  });
}

export function showSlide(slideId: string): Promise<void> {
  return new Promise((resolve) => {
    if (!slideshowEl) { resolve(); return; }

    const target = slideshowEl.querySelector(`#slide-${slideId}`) as HTMLElement;
    if (!target) { console.warn(`[Slideshow] Slide not found: ${slideId}`); resolve(); return; }
    if (currentSlide === target) { resolve(); return; }

    // Exit current slide
    if (currentSlide) {
      currentSlide.classList.add('exiting');
      currentSlide.classList.remove('active');
      currentSlide.querySelectorAll('.slide-el.revealed').forEach((el) => {
        el.classList.remove('revealed');
      });
      const old = currentSlide;
      setTimeout(() => old.classList.remove('exiting'), 900);
    }

    const delay = currentSlide ? 400 : 0;
    setTimeout(() => {
      target.classList.add('active');
      currentSlide = target;

      // Stagger reveal child elements
      const els = target.querySelectorAll('.slide-el');
      els.forEach((el, i) => {
        setTimeout(() => (el as HTMLElement).classList.add('revealed'), 100 + i * 150);
      });

      // Update progress
      const idx = SLIDE_ORDER.indexOf(slideId);
      const bar = document.getElementById('ss-progress-bar');
      if (bar && idx >= 0) bar.style.width = `${((idx + 1) / TOTAL_SLIDES) * 100}%`;
      const ctr = document.getElementById('ss-counter');
      if (ctr && idx >= 0) ctr.textContent = `${idx + 1} / ${TOTAL_SLIDES}`;

      resolve();
    }, delay);
  });
}

export function endSlideshow(): Promise<void> {
  return new Promise((resolve) => {
    if (!slideshowEl) { resolve(); return; }
    slideshowEl.classList.add('fade-out');
    slideshowEl.classList.remove('active');
    setTimeout(() => {
      slideshowEl?.remove();
      slideshowEl = null;
      currentSlide = null;
      resolve();
    }, 900);
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

/* ---- Slide Builders ---- */

function buildIntroSlide(): HTMLElement {
  const slide = makeSlide('intro');

  const bg = h('div', { className: 'slide-bg' });
  bg.appendChild(h('img', { src: images.showers.hero, alt: 'Frameless shower' }));
  slide.appendChild(bg);

  const content = h('div', { className: 'slide-content slide-center' });
  content.appendChild(h('h2', { className: 'slide-title slide-el', textContent: 'Frameless Shower Enclosures' }));
  content.appendChild(h('p', {
    className: 'slide-subtitle slide-el',
    textContent: 'Custom precision-cut glass. No metal frames. Designed, fabricated, and installed by our expert team.',
  }));
  slide.appendChild(content);

  return slide;
}

function buildGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('OUR WORK', 'Recent Installations'));

  // 2x2 grid of large images
  const grid = h('div', { className: 'ss-gallery-grid slide-el' });
  images.showers.gallery.slice(0, 4).forEach((src, i) => {
    const item = h('div', { className: 'ss-gallery-item' });
    item.appendChild(h('img', { src, alt: `Installation ${i + 1}` }));
    grid.appendChild(item);
  });
  content.appendChild(grid);
  slide.appendChild(content);

  return slide;
}

function buildEnclosuresSlide(): HTMLElement {
  const slide = makeSlide('enclosures');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Style'));

  // 4 most popular as large cards
  const popular = ['enc-single', 'enc-door-panel', 'enc-neo', 'enc-slider'];
  const grid = h('div', { className: 'ss-options-grid' });
  images.showers.enclosures
    .filter((item) => popular.includes(item.id))
    .forEach((item) => {
      const card = h('div', { className: 'ss-option-card slide-el' });
      card.setAttribute('data-id', item.id);
      card.appendChild(h('img', { src: item.src, alt: item.label }));
      const info = h('div', { className: 'ss-option-info' });
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

  const grid = h('div', { className: 'ss-options-grid ss-three-col' });
  images.showers.glass.forEach((item) => {
    const card = h('div', { className: 'ss-option-card slide-el' });
    card.setAttribute('data-id', item.id);
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-option-info' });
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

  // 5 finishes (skip "Other")
  const grid = h('div', { className: 'ss-options-grid ss-five-col' });
  images.showers.hardware
    .filter((item) => item.id !== 'hw-other')
    .forEach((item) => {
      const card = h('div', { className: 'ss-hw-finish slide-el' });
      card.setAttribute('data-id', item.id);
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

  content.appendChild(makeHeader('ACCESSORIES', 'Complete the Look', 'Solid brass construction \u00B7 Lifetime warranty \u00B7 All hardware finishes'));

  const featured = ['acc-pull', 'acc-towel', 'acc-hinge', 'acc-bar'];
  const grid = h('div', { className: 'ss-options-grid' });
  images.showers.accessories
    .filter((a) => featured.includes(a.id))
    .forEach((item) => {
      const card = h('div', { className: 'ss-option-card slide-el' });
      card.setAttribute('data-id', item.id);
      card.appendChild(h('img', { src: item.src, alt: item.label }));
      const info = h('div', { className: 'ss-option-info' });
      info.appendChild(h('h4', { textContent: item.label }));
      info.appendChild(h('p', { textContent: item.desc }));
      card.appendChild(info);
      grid.appendChild(card);
    });
  content.appendChild(grid);
  slide.appendChild(content);

  return slide;
}

function buildProcessSlide(): HTMLElement {
  const slide = makeSlide('process');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('OUR PROCESS', 'From Vision to Reality', 'Four simple steps \u00B7 About 3\u20134 weeks'));

  const grid = h('div', { className: 'ss-process-grid' });
  images.process.forEach((item, i) => {
    const step = h('div', { className: 'ss-process-card slide-el' });
    step.appendChild(h('div', { className: 'ss-process-num', textContent: String(i + 1) }));
    step.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-process-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    step.appendChild(info);
    grid.appendChild(step);
  });
  content.appendChild(grid);
  slide.appendChild(content);

  return slide;
}
