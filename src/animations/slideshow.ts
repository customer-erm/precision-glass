/**
 * Cinematic full-viewport slideshow.
 * Three service flows: showers (full configurator + AI visualization),
 * railings (info-style walkthrough), commercial (info-style walkthrough).
 */
import { images } from '../data/image-map';

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
    { key: 'accessories', label: 'Add-Ons' },
    { key: 'extras', label: 'Upgrades' },
  ].forEach((f) => {
    const row = h('div', { className: 'ss-quote-row' });
    row.appendChild(h('span', { className: 'ss-quote-label', textContent: f.label }));
    row.appendChild(h('span', { className: 'ss-quote-value', id: `qs-${f.key}`, textContent: '\u2014' }));
    selections.appendChild(row);
  });
  card.appendChild(selections);

  // Customer contact details (filled progressively as the agent collects them)
  const contact = h('div', { className: 'ss-quote-contact', id: 'qs-contact' });
  const contactHeader = h('div', { className: 'ss-quote-contact-header', textContent: 'Contact' });
  contact.appendChild(contactHeader);
  [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'budget', label: 'Budget' },
  ].forEach((f) => {
    const row = h('div', { className: 'ss-quote-row ss-quote-contact-row', id: `qs-contact-${f.key}` });
    row.appendChild(h('span', { className: 'ss-quote-label', textContent: f.label }));
    row.appendChild(h('span', { className: 'ss-quote-value', id: `qs-${f.key}`, textContent: '\u2014' }));
    contact.appendChild(row);
  });
  card.appendChild(contact);
  layout.appendChild(card);

  // RIGHT — AI-generated image
  const imgWrap = h('div', { className: 'ss-quote-img-wrap' });
  const img = h('img', { id: 'qs-generated-img', className: 'ss-quote-gen-img', alt: 'Your custom shower visualization' });
  const spinner = h('div', { className: 'ss-quote-spinner' });
  spinner.innerHTML = '<div class="ss-spinner"></div><span>Generating your shower visualization...</span>';
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
        <h3>Quote Sent!</h3>
        <p>Our specialists will reach out within 24 hours for next steps.</p>
      </div>
      <div class="ss-quote-sent-stage ss-quote-sent-stage-actions" id="qs-sent-stage-actions">
        <h3>What's next?</h3>
        <p>Save your visualization, explore more, or build another.</p>
        <div class="ss-sent-actions">
          <button class="ss-action-btn ss-action-secondary" id="qs-download-btn" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download Visualization</span>
          </button>
          <a class="ss-action-btn ss-action-secondary" href="https://eliteresultsmarketing.com" target="_blank" rel="noopener">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Visit Website</span>
          </a>
          <button class="ss-action-btn ss-action-primary" id="quote-restart-btn" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            <span>Start Over</span>
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

  const layout = h('div', { className: 'ss-info-layout slide-el' });

  const imgWrap = h('div', { className: 'ss-info-img' });
  imgWrap.appendChild(h('img', { src: opts.imageSrc, alt: opts.heading }));
  layout.appendChild(imgWrap);

  const list = h('ul', { className: 'ss-info-bullets' });
  opts.bullets.forEach((b) => {
    const li = h('li', { className: 'ss-info-bullet' });
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
    sub: 'From minimal to fully thermally broken — pick the right system for the budget and look',
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
    label: 'SCOPE & TIMELINE',
    heading: 'Project Scale',
    sub: 'Tell us the size of the job and your timeline — we handle everything from a single door to multi-story facades',
    imageSrc: images.commercial.gallery[3],
    bullets: [
      { title: 'Small / Repair', desc: 'Single door, a few panels, replacement glass, hardware swap. Usually one-day or one-week turnaround.' },
      { title: 'Medium Build-Out', desc: 'Office suite, restaurant front, retail tenant improvement. Typical 2-6 week timeline including measure and fabrication.' },
      { title: 'Full Storefront', desc: 'New construction or major remodel storefront, doors, and signage glass. 4-10 weeks depending on engineering.' },
      { title: 'Curtain Wall / Multi-Story', desc: 'Engineered structural glazing, code stamping, and crane installation. 8 weeks to several months depending on scope.' },
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

  // Wire up Start Over + Download buttons (idempotent: cloning replaces listeners)
  const restartBtn = document.getElementById('quote-restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => window.location.reload(), { once: true });
  }
  const downloadBtn = document.getElementById('qs-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
      if (!img || !img.src || !img.classList.contains('loaded')) {
        console.warn('[Download] Visualization not ready yet');
        return;
      }
      const a = document.createElement('a');
      a.href = img.src;
      a.download = 'precision-glass-shower-visualization.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }
}
