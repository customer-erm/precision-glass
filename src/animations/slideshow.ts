/**
 * Cinematic full-viewport slideshow.
 * Enclosures = auto-scrolling carousel with contain images.
 * Quote summary includes AI-generated visualization.
 */
import { images } from '../data/image-map';

let slideshowEl: HTMLElement | null = null;
let currentSlide: HTMLElement | null = null;
let galleryInterval: ReturnType<typeof setInterval> | null = null;
let carouselInterval: ReturnType<typeof setInterval> | null = null;

const SLIDE_ORDER = ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process', 'quote'];
const TOTAL_SLIDES = SLIDE_ORDER.length;

/* ---- Public API ---- */

export function createSlideshow(): void {
  if (slideshowEl) return;

  const ss = document.createElement('div');
  ss.id = 'tour-slideshow';
  ss.className = 'tour-slideshow';

  ss.appendChild(h('div', { className: 'ss-progress', innerHTML: '<div class="ss-progress-bar" id="ss-progress-bar"></div>' }));
  ss.appendChild(h('div', { className: 'ss-counter', id: 'ss-counter', textContent: '1 / ' + TOTAL_SLIDES }));

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

    const delay = currentSlide ? 400 : 0;
    setTimeout(() => {
      target.classList.add('active');
      currentSlide = target;

      const els = target.querySelectorAll('.slide-el');
      els.forEach((el, i) => setTimeout(() => (el as HTMLElement).classList.add('revealed'), 120 + i * 140));

      if (slideId === 'gallery') startGalleryFade();
      if (slideId === 'enclosures') startCarouselScroll();

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

function startCarouselScroll(): void {
  const track = document.getElementById('enc-carousel-track');
  if (!track) return;
  let scrollPos = 0;
  const speed = 0.5;
  const step = () => {
    scrollPos += speed;
    if (scrollPos >= track.scrollWidth / 2) scrollPos = 0;
    track.style.transform = `translateX(-${scrollPos}px)`;
    carouselInterval = requestAnimationFrame(step) as unknown as ReturnType<typeof setInterval>;
  };
  carouselInterval = requestAnimationFrame(step) as unknown as ReturnType<typeof setInterval>;

  // Pause on hover
  const wrapper = track.parentElement;
  if (wrapper) {
    wrapper.addEventListener('mouseenter', () => {
      if (carouselInterval) cancelAnimationFrame(carouselInterval as unknown as number);
    });
    wrapper.addEventListener('mouseleave', () => {
      carouselInterval = requestAnimationFrame(step) as unknown as ReturnType<typeof setInterval>;
    });
  }
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
  content.appendChild(makeHeader('ENCLOSURE TYPES', 'Choose Your Configuration', 'All 9 styles shown \u2014 scroll or let them glide'));

  // Auto-scrolling carousel with contain-mode images
  const wrapper = h('div', { className: 'ss-carousel-wrapper slide-el' });
  const track = h('div', { className: 'ss-carousel-track', id: 'enc-carousel-track' });

  // Duplicate items for seamless loop
  const allItems = [...images.showers.enclosures, ...images.showers.enclosures];
  allItems.forEach((item) => {
    const card = h('div', { className: 'ss-carousel-card' });
    card.appendChild(h('img', { src: item.src, alt: item.label }));
    card.appendChild(h('h4', { textContent: item.label }));
    card.appendChild(h('p', { textContent: item.desc }));
    track.appendChild(card);
  });
  wrapper.appendChild(track);
  content.appendChild(wrapper);
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
  content.appendChild(makeHeader('THE PROCESS', 'From Approval to Enjoyment'));
  const steps = [
    { num: '1', title: 'Quote Approved', desc: 'We finalize your design and confirm all selections.', src: images.process[0].src },
    { num: '2', title: 'Precision Measuring', desc: 'Laser-accurate templates. Every fraction of an inch.', src: images.process[1].src },
    { num: '3', title: 'Glass Ordering', desc: 'Custom cut, polished, and tempered. 2\u20133 weeks.', src: images.process[2].src },
    { num: '4', title: 'Installation Day', desc: 'Professional install. Most projects done in one day.', src: images.process[3].src },
    { num: '5', title: 'Enjoy', desc: 'Step into your new frameless shower.', src: images.showers.hero },
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

  // Side-by-side layout: editorial LEFT, AI image RIGHT
  const layout = h('div', { className: 'ss-quote-layout slide-el' });

  // LEFT — editorial quote card
  const card = h('div', { className: 'ss-quote-card' });

  const header = h('div', { className: 'ss-quote-header' });
  header.appendChild(h('div', { className: 'ss-quote-logo', textContent: 'PrecisionGlass' }));
  header.appendChild(h('h3', { textContent: 'Your Custom Configuration' }));
  card.appendChild(header);

  const selections = h('div', { className: 'ss-quote-selections' });
  [
    { key: 'enclosure', label: 'Enclosure' },
    { key: 'glass', label: 'Glass' },
    { key: 'hardware', label: 'Hardware' },
    { key: 'handle', label: 'Handle' },
    { key: 'extras', label: 'Upgrades' },
  ].forEach((f) => {
    const row = h('div', { className: 'ss-quote-row' });
    row.appendChild(h('span', { className: 'ss-quote-label', textContent: f.label }));
    row.appendChild(h('span', { className: 'ss-quote-value', id: `qs-${f.key}`, textContent: '\u2014' }));
    selections.appendChild(row);
  });
  card.appendChild(selections);
  layout.appendChild(card);

  // RIGHT — AI-generated image
  const imgWrap = h('div', { className: 'ss-quote-img-wrap' });
  const img = h('img', { id: 'qs-generated-img', className: 'ss-quote-gen-img', alt: 'Your custom shower visualization' });
  const spinner = h('div', { className: 'ss-quote-spinner' });
  spinner.innerHTML = '<div class="ss-spinner"></div><span>Generating your shower visualization...</span>';
  imgWrap.appendChild(img);
  imgWrap.appendChild(spinner);
  layout.appendChild(imgWrap);

  // Submitted message spans full width
  const submitted = h('div', { className: 'ss-quote-submitted', id: 'quote-submitted-msg' });
  submitted.innerHTML = '<div class="ss-quote-check">&#10003;</div><h4>Quote Request Sent!</h4><p>We\'ll follow up within 24 hours with detailed pricing.</p>';
  layout.appendChild(submitted);

  content.appendChild(layout);
  slide.appendChild(content);
  return slide;
}
