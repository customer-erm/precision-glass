/**
 * Cinematic full-viewport slideshow for the guided tour.
 * Single-row carousel layouts. Everything fits above the fold.
 */
import { images } from '../data/image-map';
import { clearHighlight } from './tour';

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

    // Clear any highlight from previous slide
    clearHighlight();

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

    const delay = currentSlide ? 350 : 0;
    setTimeout(() => {
      target.classList.add('active');
      currentSlide = target;

      // Stagger reveal child elements
      const els = target.querySelectorAll('.slide-el');
      els.forEach((el, i) => {
        setTimeout(() => (el as HTMLElement).classList.add('revealed'), 80 + i * 120);
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
    clearHighlight();
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
    else el.setAttribute(k, v);
  }
  return el;
}

function makeSlide(id: string): HTMLElement {
  return h('div', { className: 'tour-slide', id: `slide-${id}` });
}

function makeHeader(label: string, heading: string, sub?: string): HTMLElement {
  const wrap = h('div', { className: 'slide-header' });
  wrap.appendChild(h('div', { className: 'slide-label slide-el', textContent: label }));
  wrap.appendChild(h('h3', { className: 'slide-heading slide-el', textContent: heading }));
  if (sub) wrap.appendChild(h('p', { className: 'slide-sub slide-el', textContent: sub }));
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
    textContent: 'Custom frameless glass enclosures designed, fabricated, and installed by our expert team.',
  }));
  slide.appendChild(content);

  return slide;
}

function buildGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('OUR WORK', 'Recent Installations'));

  // Single horizontal row of images
  const row = h('div', { className: 'ss-row slide-el' });
  images.showers.gallery.slice(0, 5).forEach((src, i) => {
    const item = h('div', { className: 'ss-row-item' });
    item.appendChild(h('img', { src, alt: `Project ${i + 1}` }));
    row.appendChild(item);
  });
  content.appendChild(row);
  slide.appendChild(content);

  return slide;
}

function buildEnclosuresSlide(): HTMLElement {
  const slide = makeSlide('enclosures');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Configuration', '9 styles to fit any bathroom layout'));

  // Single horizontal carousel row — images in contain mode so silhouettes are visible
  const row = h('div', { className: 'ss-carousel slide-el' });
  images.showers.enclosures.forEach((item) => {
    const card = h('div', { className: 'ss-carousel-card' });
    card.setAttribute('data-id', item.id);
    const imgWrap = h('div', { className: 'ss-carousel-img' });
    imgWrap.appendChild(h('img', { src: item.src, alt: item.label }));
    card.appendChild(imgWrap);
    card.appendChild(h('div', { className: 'ss-carousel-label', textContent: item.label }));
    row.appendChild(card);
  });
  content.appendChild(row);
  slide.appendChild(content);

  return slide;
}

function buildGlassSlide(): HTMLElement {
  const slide = makeSlide('glass');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('GLASS OPTIONS', 'Select Your Glass', 'Premium tempered safety glass'));

  // 3 large cards in a row
  const row = h('div', { className: 'ss-glass-row' });
  images.showers.glass.forEach((item) => {
    const card = h('div', { className: 'ss-glass-card slide-el' });
    card.setAttribute('data-id', item.id);
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-glass-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    row.appendChild(card);
  });
  content.appendChild(row);
  slide.appendChild(content);

  return slide;
}

function buildHardwareSlide(): HTMLElement {
  const slide = makeSlide('hardware');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('HARDWARE FINISHES', 'Choose Your Finish', 'Coordinate with your bathroom aesthetic'));

  // Single row of 6 circular swatches
  const row = h('div', { className: 'ss-hw-row' });
  images.showers.hardware.forEach((item) => {
    const card = h('div', { className: 'ss-hw-card slide-el' });
    card.setAttribute('data-id', item.id);
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    card.appendChild(h('div', { className: 'ss-hw-label', textContent: item.label }));
    row.appendChild(card);
  });
  content.appendChild(row);
  slide.appendChild(content);

  return slide;
}

function buildAccessoriesSlide(): HTMLElement {
  const slide = makeSlide('accessories');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('ACCESSORIES', 'Complete the Look', 'Solid brass construction · Lifetime warranty'));

  // Single row of key accessories
  const featured = ['acc-pull', 'acc-towel', 'acc-hinge', 'acc-uhandle', 'acc-knob', 'acc-bar'];
  const row = h('div', { className: 'ss-acc-row' });
  images.showers.accessories
    .filter((a) => featured.includes(a.id))
    .forEach((item) => {
      const card = h('div', { className: 'ss-acc-card slide-el' });
      card.setAttribute('data-id', item.id);
      card.appendChild(h('img', { src: item.src, alt: item.label }));
      card.appendChild(h('div', { className: 'ss-acc-label', textContent: item.label }));
      row.appendChild(card);
    });
  content.appendChild(row);
  slide.appendChild(content);

  return slide;
}

function buildProcessSlide(): HTMLElement {
  const slide = makeSlide('process');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('OUR PROCESS', 'From Vision to Reality', 'Four simple steps · About 3–4 weeks total'));

  const row = h('div', { className: 'ss-process-row' });
  images.process.forEach((item, i) => {
    const step = h('div', { className: 'ss-process-step slide-el' });
    step.appendChild(h('div', { className: 'ss-process-num', textContent: String(i + 1) }));
    step.appendChild(h('img', { src: item.src, alt: item.label }));
    step.appendChild(h('h4', { textContent: item.label }));
    step.appendChild(h('p', { textContent: item.desc }));
    row.appendChild(step);
  });
  content.appendChild(row);
  slide.appendChild(content);

  return slide;
}
