/**
 * Cinematic full-viewport slideshow.
 * New slide set: intro, gallery (auto-fading 16:9), enclosures (featured + grid),
 * glass, hardware, accessories (handle focus), extras (grid/steam), process (5 steps),
 * quote summary (editorial layout).
 */
import { images } from '../data/image-map';

let slideshowEl: HTMLElement | null = null;
let currentSlide: HTMLElement | null = null;
let galleryInterval: ReturnType<typeof setInterval> | null = null;

const SLIDE_ORDER = ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process', 'quote'];
const TOTAL_SLIDES = SLIDE_ORDER.length;

/* ---- Public API ---- */

export function createSlideshow(): void {
  if (slideshowEl) return;

  const ss = document.createElement('div');
  ss.id = 'tour-slideshow';
  ss.className = 'tour-slideshow';

  // Progress bar
  const progress = h('div', { className: 'ss-progress' });
  progress.innerHTML = '<div class="ss-progress-bar" id="ss-progress-bar"></div>';
  ss.appendChild(progress);

  // Counter
  const counter = h('div', { className: 'ss-counter', id: 'ss-counter', textContent: '1 / ' + TOTAL_SLIDES });
  ss.appendChild(counter);

  // Build slides
  ss.appendChild(buildIntroSlide());
  ss.appendChild(buildGallerySlide());
  ss.appendChild(buildEnclosuresSlide());
  ss.appendChild(buildGlassSlide());
  ss.appendChild(buildHardwareSlide());
  ss.appendChild(buildAccessoriesSlide());
  ss.appendChild(buildExtrasSlide());
  ss.appendChild(buildProcessSlide());
  ss.appendChild(buildQuoteSummarySlide());

  document.body.appendChild(ss);
  slideshowEl = ss;
  requestAnimationFrame(() => ss.classList.add('active'));
}

export function showSlide(slideId: string): Promise<void> {
  return new Promise((resolve) => {
    if (!slideshowEl) { resolve(); return; }
    const target = slideshowEl.querySelector(`#slide-${slideId}`) as HTMLElement;
    if (!target) { console.warn(`[Slideshow] Not found: ${slideId}`); resolve(); return; }
    if (currentSlide === target) { resolve(); return; }

    // Exit current
    if (currentSlide) {
      currentSlide.classList.add('exiting');
      currentSlide.classList.remove('active');
      currentSlide.querySelectorAll('.slide-el.revealed').forEach(el => el.classList.remove('revealed'));
      const old = currentSlide;
      setTimeout(() => old.classList.remove('exiting'), 900);
    }

    // Stop gallery auto-fade if leaving gallery
    if (galleryInterval && slideId !== 'gallery') {
      clearInterval(galleryInterval);
      galleryInterval = null;
    }

    const delay = currentSlide ? 400 : 0;
    setTimeout(() => {
      target.classList.add('active');
      currentSlide = target;

      // Stagger reveals
      const els = target.querySelectorAll('.slide-el');
      els.forEach((el, i) => {
        setTimeout(() => (el as HTMLElement).classList.add('revealed'), 120 + i * 140);
      });

      // Start gallery auto-fade
      if (slideId === 'gallery') startGalleryFade();

      // Progress
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
    if (galleryInterval) { clearInterval(galleryInterval); galleryInterval = null; }
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

/* ---- Gallery auto-fade ---- */

function startGalleryFade(): void {
  const imgs = document.querySelectorAll('.ss-gallery-fade img');
  if (imgs.length === 0) return;
  let idx = 0;
  imgs[0].classList.add('gf-active');

  galleryInterval = setInterval(() => {
    imgs[idx].classList.remove('gf-active');
    idx = (idx + 1) % imgs.length;
    imgs[idx].classList.add('gf-active');
  }, 4000);
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
    textContent: 'No frames. No compromises. Just precision-cut glass that transforms your bathroom into something extraordinary.',
  }));
  slide.appendChild(content);
  return slide;
}

function buildGallerySlide(): HTMLElement {
  const slide = makeSlide('gallery');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('OUR WORK', 'Recent Installations'));

  // 16:9 fading slideshow container
  const container = h('div', { className: 'ss-gallery-fade slide-el' });
  images.showers.gallery.slice(0, 4).forEach((src, i) => {
    container.appendChild(h('img', { src, alt: `Installation ${i + 1}` }));
  });
  content.appendChild(container);
  slide.appendChild(content);
  return slide;
}

function buildEnclosuresSlide(): HTMLElement {
  const slide = makeSlide('enclosures');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Configuration'));

  const layout = h('div', { className: 'ss-enc-layout slide-el' });

  // Left: 2 large featured cards with contain images
  const featured = h('div', { className: 'ss-enc-featured' });
  const featuredItems = images.showers.enclosures.filter(
    (item) => item.id === 'enc-single' || item.id === 'enc-door-panel'
  );
  featuredItems.forEach((item) => {
    const card = h('div', { className: 'ss-enc-featured-card' });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    const info = h('div', { className: 'ss-enc-featured-info' });
    info.appendChild(h('h4', { textContent: item.label }));
    info.appendChild(h('p', { textContent: item.desc }));
    card.appendChild(info);
    featured.appendChild(card);
  });
  layout.appendChild(featured);

  // Right: grid of remaining options (small thumbnails)
  const grid = h('div', { className: 'ss-enc-grid' });
  const gridLabel = h('div', { className: 'ss-enc-grid-label', textContent: 'More Options' });
  grid.appendChild(gridLabel);
  const gridItems = h('div', { className: 'ss-enc-grid-items' });
  images.showers.enclosures
    .filter((item) => item.id !== 'enc-single' && item.id !== 'enc-door-panel')
    .forEach((item) => {
      const thumb = h('div', { className: 'ss-enc-thumb' });
      thumb.appendChild(h('img', { src: item.src, alt: item.label }));
      thumb.appendChild(h('span', { textContent: item.label }));
      gridItems.appendChild(thumb);
    });
  grid.appendChild(gridItems);
  layout.appendChild(grid);

  content.appendChild(layout);
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
  images.showers.hardware
    .filter((item) => item.id !== 'hw-other')
    .forEach((item) => {
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
  content.appendChild(makeHeader('HANDLES & ACCESSORIES', 'Choose Your Style', 'Solid brass \u00B7 Lifetime warranty \u00B7 All finishes available'));

  // Handle-focused: pull, u-handle, ladder, knob + towel, hook, bar
  const items = ['acc-pull', 'acc-uhandle', 'acc-ladder', 'acc-knob', 'acc-towel', 'acc-hook', 'acc-bar'];
  const grid = h('div', { className: 'ss-acc-grid' });
  images.showers.accessories
    .filter((a) => items.includes(a.id))
    .forEach((item) => {
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

  // Grid patterns
  const gridCard = h('div', { className: 'ss-extra-card slide-el' });
  const gridImg = images.showers.accessories.find((a) => a.id === 'acc-grid');
  if (gridImg) gridCard.appendChild(h('img', { src: gridImg.src, alt: 'Grid Patterns' }));
  const gridInfo = h('div', { className: 'ss-card-info' });
  gridInfo.appendChild(h('h4', { textContent: 'Decorative Grid Patterns' }));
  gridInfo.appendChild(h('p', { textContent: 'Add architectural character with French, colonial, or custom grid designs applied to your glass panels.' }));
  gridCard.appendChild(gridInfo);
  grid.appendChild(gridCard);

  // Steam shower
  const steamCard = h('div', { className: 'ss-extra-card slide-el' });
  const steamImg = images.showers.enclosures.find((e) => e.id === 'enc-steam');
  if (steamImg) steamCard.appendChild(h('img', { src: steamImg.src, alt: 'Steam Shower' }));
  const steamInfo = h('div', { className: 'ss-card-info' });
  steamInfo.appendChild(h('h4', { textContent: 'Steam Shower Enclosure' }));
  steamInfo.appendChild(h('p', { textContent: 'Fully sealed enclosure with floor-to-ceiling glass for a complete spa experience at home. Includes ventilation considerations.' }));
  steamCard.appendChild(steamInfo);
  grid.appendChild(steamCard);

  content.appendChild(grid);
  slide.appendChild(content);
  return slide;
}

function buildProcessSlide(): HTMLElement {
  const slide = makeSlide('process');
  const content = h('div', { className: 'slide-content' });
  content.appendChild(makeHeader('THE PROCESS', 'From Approval to Enjoyment'));

  const steps = [
    { num: '1', title: 'Quote Approved', desc: 'We finalize your design, confirm selections, and schedule everything.', src: images.process[0].src },
    { num: '2', title: 'Precision Measuring', desc: 'Laser-accurate templates of your space. Every fraction of an inch matters.', src: images.process[1].src },
    { num: '3', title: 'Glass Ordering', desc: 'Custom cut, polished, and tempered to your exact specifications. 2-3 weeks.', src: images.process[2].src },
    { num: '4', title: 'Installation Day', desc: 'Professional install by certified technicians. Most projects completed in one day.', src: images.process[3].src },
    { num: '5', title: 'Enjoy', desc: 'Step into your brand new frameless shower. Backed by our lifetime warranty.', src: images.showers.hero },
  ];

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

function buildQuoteSummarySlide(): HTMLElement {
  const slide = makeSlide('quote');
  const content = h('div', { className: 'slide-content slide-center' });

  const card = h('div', { className: 'ss-quote-card slide-el' });

  // Header
  const header = h('div', { className: 'ss-quote-header' });
  header.appendChild(h('div', { className: 'ss-quote-logo', textContent: 'PrecisionGlass' }));
  header.appendChild(h('h3', { textContent: 'Your Custom Configuration' }));
  header.appendChild(h('p', { textContent: 'Here\'s what we\'ve put together based on your preferences.' }));
  card.appendChild(header);

  // Selection rows
  const selections = h('div', { className: 'ss-quote-selections' });
  const fields = [
    { key: 'enclosure', label: 'Enclosure Style' },
    { key: 'glass', label: 'Glass Type' },
    { key: 'hardware', label: 'Hardware Finish' },
    { key: 'handle', label: 'Handle Style' },
    { key: 'extras', label: 'Upgrades' },
  ];
  fields.forEach((f) => {
    const row = h('div', { className: 'ss-quote-row' });
    row.appendChild(h('span', { className: 'ss-quote-label', textContent: f.label }));
    row.appendChild(h('span', { className: 'ss-quote-value', id: `qs-${f.key}`, textContent: '\u2014' }));
    selections.appendChild(row);
  });
  card.appendChild(selections);

  // Submitted message (hidden initially)
  const submitted = h('div', { className: 'ss-quote-submitted', id: 'quote-submitted-msg' });
  submitted.innerHTML = '<div class="ss-quote-check">&#10003;</div><h4>Quote Request Sent!</h4><p>We\'ll follow up within 24 hours with detailed pricing.</p>';
  card.appendChild(submitted);

  content.appendChild(card);
  slide.appendChild(content);
  return slide;
}
