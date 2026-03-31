/**
 * Cinematic full-viewport slideshow for the guided tour.
 * Each slide fills 100vh, content animates in/out with staggered reveals.
 * No scrolling — everything happens above the fold.
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

  // Progress bar (sits above transcript bar)
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

  // Activate
  requestAnimationFrame(() => {
    ss.classList.add('active');
  });
}

export function showSlide(slideId: string): Promise<void> {
  return new Promise((resolve) => {
    if (!slideshowEl) { resolve(); return; }

    const target = slideshowEl.querySelector(`#slide-${slideId}`) as HTMLElement;
    if (!target) { console.warn(`[Slideshow] Slide not found: ${slideId}`); resolve(); return; }

    // Same slide — just resolve
    if (currentSlide === target) { resolve(); return; }

    // Exit current slide
    if (currentSlide) {
      currentSlide.classList.add('exiting');
      currentSlide.classList.remove('active');
      // Reset revealed state on exit
      currentSlide.querySelectorAll('.slide-el.revealed').forEach((el) => {
        el.classList.remove('revealed');
      });
      const old = currentSlide;
      setTimeout(() => old.classList.remove('exiting'), 900);
    }

    // Enter new slide after brief gap
    const delay = currentSlide ? 350 : 0;
    setTimeout(() => {
      target.classList.add('active');
      currentSlide = target;

      // Stagger reveal child elements
      const els = target.querySelectorAll('.slide-el');
      els.forEach((el, i) => {
        setTimeout(() => (el as HTMLElement).classList.add('revealed'), 80 + i * 100);
      });

      // Update progress bar
      const idx = SLIDE_ORDER.indexOf(slideId);
      const bar = document.getElementById('ss-progress-bar');
      if (bar && idx >= 0) {
        bar.style.width = `${((idx + 1) / TOTAL_SLIDES) * 100}%`;
      }

      // Update counter
      const counter = document.getElementById('ss-counter');
      if (counter && idx >= 0) {
        counter.textContent = `${idx + 1} / ${TOTAL_SLIDES}`;
      }

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
    else el.setAttribute(k, v);
  }
  return el;
}

function makeSlide(id: string): HTMLElement {
  return h('div', { className: 'tour-slide', id: `slide-${id}` });
}

function makeHeader(label: string, heading: string): HTMLElement {
  const wrap = h('div', { className: 'slide-header' });
  const lbl = h('div', { className: 'slide-label slide-el', textContent: label });
  const hd = h('h3', { className: 'slide-heading slide-el', textContent: heading });
  wrap.append(lbl, hd);
  return wrap;
}

/* ---- Slide Builders ---- */

function buildIntroSlide(): HTMLElement {
  const slide = makeSlide('intro');

  // Full background image
  const bg = h('div', { className: 'slide-bg' });
  bg.appendChild(h('img', { src: images.showers.hero, alt: 'Frameless shower enclosure' }));
  slide.appendChild(bg);

  // Centered content
  const content = h('div', { className: 'slide-content slide-center' });
  content.appendChild(h('h2', { className: 'slide-title slide-el', textContent: 'Frameless Shower Enclosures' }));
  content.appendChild(h('p', {
    className: 'slide-subtitle slide-el',
    textContent: 'Custom frameless glass enclosures designed, fabricated, and installed by our expert team. No frames. No compromises. Just clean lines and stunning clarity.',
  }));
  slide.appendChild(content);

  return slide;
}

function buildGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('OUR WORK', 'Craftsmanship You Can See'));

  const grid = h('div', { className: 'ss-gallery slide-el' });
  images.showers.gallery.slice(0, 6).forEach((src, i) => {
    const item = h('div', { className: 'ss-gallery-item' });
    item.appendChild(h('img', { src, alt: `Shower project ${i + 1}` }));
    grid.appendChild(item);
  });
  content.appendChild(grid);
  slide.appendChild(content);

  return slide;
}

function buildEnclosuresSlide(): HTMLElement {
  const slide = makeSlide('enclosures');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Configuration'));

  const grid = h('div', { className: 'ss-enc-grid' });
  images.showers.enclosures.forEach((item) => {
    const card = h('div', { className: 'ss-card slide-el' });
    card.setAttribute('data-id', item.id);
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-card-info' });
    info.appendChild(h('span', { className: 'ss-card-label', textContent: item.label }));
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
    card.setAttribute('data-id', item.id);
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-glass-info' });
    const title = h('h4', { textContent: item.label });
    const desc = h('p', { textContent: item.desc });
    info.append(title, desc);
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
  images.showers.hardware.forEach((item) => {
    const card = h('div', { className: 'ss-hw-card slide-el' });
    card.setAttribute('data-id', item.id);
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    card.appendChild(h('div', { className: 'ss-hw-label', textContent: item.label }));
    grid.appendChild(card);
  });
  content.appendChild(grid);
  slide.appendChild(content);

  return slide;
}

function buildAccessoriesSlide(): HTMLElement {
  const slide = makeSlide('accessories');
  const content = h('div', { className: 'slide-content' });

  content.appendChild(makeHeader('ACCESSORIES', 'Complete the Look'));

  // Show key accessories that the narration mentions
  const featured = ['acc-hinge', 'acc-pull', 'acc-uhandle', 'acc-towel', 'acc-bar', 'acc-knob'];
  const grid = h('div', { className: 'ss-acc-grid' });
  images.showers.accessories
    .filter((a) => featured.includes(a.id))
    .forEach((item) => {
      const card = h('div', { className: 'ss-acc-card slide-el' });
      card.setAttribute('data-id', item.id);
      card.appendChild(h('img', { src: item.src, alt: item.label }));
      const info = h('div', { className: 'ss-acc-info' });
      info.appendChild(h('div', { className: 'ss-acc-label', textContent: item.label }));
      info.appendChild(h('div', { className: 'ss-acc-desc', textContent: item.desc }));
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

  content.appendChild(makeHeader('OUR PROCESS', 'From Vision to Reality'));

  const grid = h('div', { className: 'ss-process-grid' });
  images.process.forEach((item, i) => {
    const step = h('div', { className: 'ss-process-step slide-el' });
    step.appendChild(h('div', { className: 'ss-process-num', textContent: String(i + 1) }));
    step.appendChild(h('img', { src: item.src, alt: item.label }));
    step.appendChild(h('h4', { textContent: item.label }));
    step.appendChild(h('p', { textContent: item.desc }));
    grid.appendChild(step);
  });
  content.appendChild(grid);
  slide.appendChild(content);

  return slide;
}
