/**
 * Manual slideshow navigation for Browse mode.
 * Injects prev/next/done controls on top of the slideshow, makes the
 * existing option cards clickable (each click stores a choice and
 * advances), and converts the final quote slide into a fillable form.
 *
 * This module is a DRIVER for the existing slideshow engine — it doesn't
 * own the slideshow itself, just augments it with UI + click handlers.
 */

import { el } from '../utils/dom';
import {
  showSlide,
  getCurrentSlideId,
  getActiveService,
  endSlideshow,
  showQuoteSent,
  createSlideshow,
} from './slideshow';
import { playTransformAnimation } from './transform';
import { generateShowerImage } from '../gemini/image-gen';
import { saveUser } from '../utils/user-storage';
import { setState, getState } from '../utils/state';
import { getGuideEntry } from '../data/buyer-guide';
import { saveCustomerGeneration } from '../utils/save-generation';

/* ------------------------------------------------------------------ */
/*  Per-service slide order for manual walk                            */
/* ------------------------------------------------------------------ */

const SLIDE_ORDER_BY_SERVICE: Record<string, string[]> = {
  showers: ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process', 'quote'],
  railings: ['intro', 'gallery', 'rail-types', 'rail-glass', 'rail-finish', 'rail-mounting', 'process', 'quote'],
  commercial: ['intro', 'gallery', 'com-types', 'com-glass', 'com-framing', 'com-scope', 'process', 'quote'],
};

/* ------------------------------------------------------------------ */
/*  Choice accumulator                                                 */
/* ------------------------------------------------------------------ */

const browseChoices: Record<string, string> = {};

function choiceCategoryForSlide(slideId: string): string | null {
  // When ADVANCING to this slide, the user's choice on the PREVIOUS slide
  // should be saved under which category?
  const map: Record<string, string> = {
    glass: 'enclosure',
    hardware: 'glass',
    accessories: 'hardware',
    extras: 'handle',
    process: 'extras',
    quote: 'extras',
    'rail-glass': 'rail-type',
    'rail-finish': 'rail-glass',
    'rail-mounting': 'rail-finish',
    'com-glass': 'com-type',
    'com-framing': 'com-glass',
    'com-scope': 'com-framing',
  };
  return map[slideId] || null;
}

/* ------------------------------------------------------------------ */
/*  Public entry: start a browse-mode tour for a given service         */
/* ------------------------------------------------------------------ */

export async function startBrowseTour(
  service: 'showers' | 'railings' | 'commercial',
  startAtSlideId?: string,
): Promise<void> {
  // If a browse tour is already active for the same service, just jump there
  const existing = document.getElementById('tour-slideshow');
  if (existing && getActiveService() === service) {
    const target = startAtSlideId || 'intro';
    await showSlide(target);
    wireSlideInteraction();
    setTimeout(wireSlideInteraction, 400);
    setTimeout(wireSlideInteraction, 900);
    updateNavCounter();
    if (target === 'quote') {
      onEnterQuoteSlide();
      populateManualQuote();
    }
    return;
  }

  setState({ currentService: service, currentMode: 'browse', isTransformed: true });
  // Clear choices from any previous session
  for (const k of Object.keys(browseChoices)) delete browseChoices[k];

  await playTransformAnimation();
  createSlideshow(service);
  const startSlide = startAtSlideId || 'intro';
  await showSlide(startSlide);

  injectManualNavBar();
  wireSlideInteraction();
  setTimeout(wireSlideInteraction, 400);
  setTimeout(wireSlideInteraction, 900);

  if (startSlide === 'quote') {
    onEnterQuoteSlide();
    populateManualQuote();
  }
  updateNavCounter();
}

/* ------------------------------------------------------------------ */
/*  Inject the prev / next / done bottom nav                           */
/* ------------------------------------------------------------------ */

function injectManualNavBar(): void {
  if (document.getElementById('manual-nav-bar')) return;
  const bar = el('div', { className: 'manual-nav-bar', id: 'manual-nav-bar' });

  const prev = el('button', {
    className: 'manual-nav-btn manual-nav-prev',
    id: 'manual-nav-prev',
    type: 'button',
    textContent: '\u2190 Back',
  });
  prev.addEventListener('click', goPrev);

  const counter = el('span', { className: 'manual-nav-counter', id: 'manual-nav-counter', textContent: '' });

  const next = el('button', {
    className: 'manual-nav-btn manual-nav-next primary',
    id: 'manual-nav-next',
    type: 'button',
    textContent: 'Next \u2192',
  });
  next.addEventListener('click', goNext);

  const exit = el('button', {
    className: 'manual-nav-btn manual-nav-exit',
    id: 'manual-nav-exit',
    type: 'button',
    textContent: 'Exit tour',
  });
  exit.addEventListener('click', exitManualTour);

  const restart = el('button', {
    className: 'manual-nav-btn manual-nav-restart',
    id: 'manual-nav-restart',
    type: 'button',
    innerHTML: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span>Start over</span>',
    ariaLabel: 'Start over',
    title: 'Start over',
  });
  restart.addEventListener('click', () => {
    if (confirm('Start over? Your current selections will be cleared.')) {
      window.location.reload();
    }
  });

  bar.append(exit, prev, counter, next, restart);
  document.body.appendChild(bar);
  updateNavCounter();
}

function currentService(): string {
  return getActiveService() || 'showers';
}

function currentOrder(): string[] {
  return SLIDE_ORDER_BY_SERVICE[currentService()] || SLIDE_ORDER_BY_SERVICE.showers;
}

function updateNavCounter(): void {
  const c = document.getElementById('manual-nav-counter');
  if (!c) return;
  const order = currentOrder();
  const idx = order.indexOf(getCurrentSlideId() || '');
  const step = idx < 0 ? 1 : idx + 1;
  c.textContent = `${step} of ${order.length}`;

  // Hide prev on first slide, change "Next" label on quote
  const prev = document.getElementById('manual-nav-prev') as HTMLButtonElement | null;
  if (prev) prev.disabled = idx <= 0;
  const next = document.getElementById('manual-nav-next') as HTMLButtonElement | null;
  if (next) next.textContent = idx >= order.length - 1 ? 'Submit quote' : 'Next \u2192';
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

async function goNext(): Promise<void> {
  const order = currentOrder();
  const cur = getCurrentSlideId() || '';
  const idx = order.indexOf(cur);

  // On quote slide: submit the form
  if (cur === 'quote') {
    await submitManualQuote();
    return;
  }

  // Save any selected card as the choice for the NEXT slide's category
  const nextId = order[Math.min(idx + 1, order.length - 1)];
  const category = choiceCategoryForSlide(nextId);
  if (category) {
    const selected = document.querySelector(`#slide-${cur} .browse-option.selected`) as HTMLElement | null;
    if (selected) {
      const choice = selected.getAttribute('data-label') || selected.textContent?.trim() || '';
      if (choice) browseChoices[category] = choice;
    }
  }

  await showSlide(nextId);
  if (nextId === 'quote') onEnterQuoteSlide();
  // Wire immediately + again after a short delay so late-appearing .slide-el
  // cards (reveal animation) also get wired.
  wireSlideInteraction();
  setTimeout(wireSlideInteraction, 400);
  setTimeout(wireSlideInteraction, 900);
  updateNavCounter();

  if (nextId === 'quote') populateManualQuote();
}

async function goPrev(): Promise<void> {
  const order = currentOrder();
  const idx = order.indexOf(getCurrentSlideId() || '');
  if (idx <= 0) return;
  await showSlide(order[idx - 1]);
  wireSlideInteraction();
  setTimeout(wireSlideInteraction, 400);
  setTimeout(wireSlideInteraction, 900);
  updateNavCounter();
}

async function exitManualTour(): Promise<void> {
  document.getElementById('manual-nav-bar')?.remove();
  await endSlideshow();
  setState({ isTransformed: false, currentService: null });
  const hero = document.getElementById('hero');
  if (hero) {
    hero.style.display = '';
    hero.style.opacity = '1';
    hero.querySelectorAll<HTMLElement>('.hero-eyebrow, .hero-title, .hero-subtitle, .services-grid, .mode-picker-wrap, #mode-picker-wrap').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/*  Make slide option cards clickable                                  */
/* ------------------------------------------------------------------ */

function wireSlideInteraction(): void {
  const cur = getCurrentSlideId();
  if (!cur) return;
  const slideEl = document.getElementById(`slide-${cur}`);
  if (!slideEl) return;

  // Actual class names produced by slideshow.ts for each slide's option cards.
  const cardSelectors = [
    '.ss-enc-card',
    '.ss-glass-card',
    '.ss-hw-card',
    '.ss-acc-card',
    '.ss-extra-card',
    '.ss-rail-card',
    '.ss-com-card',
    '.ss-info-item',
  ];
  const cards = slideEl.querySelectorAll<HTMLElement>(cardSelectors.join(','));
  console.log(`[Manual] wireSlideInteraction slide=${cur} cards=${cards.length}`);

  cards.forEach((card) => {
    if (card.classList.contains('browse-wired')) return;
    card.classList.add('browse-wired', 'browse-option');
    card.style.cursor = 'pointer';
    // Derive a label from h4 if present
    const labelEl = card.querySelector('h4');
    const label = (labelEl?.textContent || '').trim();
    if (label) card.setAttribute('data-label', label);

    // Inject a learn-more info button if we have a buyer's-guide entry
    if (label && getGuideEntry(label) && !card.querySelector('.card-info-btn')) {
      const infoBtn = el('button', {
        className: 'card-info-btn',
        type: 'button',
        innerHTML: '<span aria-hidden="true">i</span><span class="sr-only">Learn more</span>',
        ariaLabel: `Learn more about ${label}`,
      });
      infoBtn.setAttribute('data-info-label', label);
      infoBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openBuyerGuideModal(label);
      });
      card.appendChild(infoBtn);
    }

    card.addEventListener('click', () => {
      slideEl.querySelectorAll('.browse-option.selected').forEach((e) => e.classList.remove('selected'));
      card.classList.add('selected');
      console.log('[Manual] Selected on', cur, '→', card.getAttribute('data-label'));
      const next = document.getElementById('manual-nav-next');
      if (next) next.classList.add('pulse-ready');
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Buyer's Guide modal                                                */
/* ------------------------------------------------------------------ */

function openBuyerGuideModal(label: string): void {
  const entry = getGuideEntry(label);
  if (!entry) return;

  let modal = document.getElementById('bg-modal');
  if (!modal) {
    modal = el('div', { className: 'bg-modal', id: 'bg-modal' });
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBuyerGuideModal();
    });
  }

  // Resolve image: prefer entry.image, else the card's own image
  let img = entry.image;
  if (!img) {
    const currentLabel = label.toLowerCase();
    const matchingCard = Array.from(document.querySelectorAll<HTMLElement>('.browse-option[data-label]')).find(
      (c) => (c.getAttribute('data-label') || '').toLowerCase() === currentLabel,
    );
    const cardImg = matchingCard?.querySelector('img') as HTMLImageElement | null;
    if (cardImg) img = cardImg.src;
  }

  modal.innerHTML = `
    <div class="bg-modal-card">
      <button type="button" class="bg-modal-close" aria-label="Close">\u2715</button>
      <div class="bg-modal-body">
        ${img ? `<div class="bg-modal-image"><img src="${img}" alt="${escapeAttr(entry.title)}"></div>` : ''}
        <div class="bg-modal-content">
          <div class="bg-modal-eyebrow">Buyer\u2019s guide</div>
          <h2 class="bg-modal-title">${escapeHtml(entry.title)}</h2>
          ${entry.subtitle ? `<p class="bg-modal-subtitle">${escapeHtml(entry.subtitle)}</p>` : ''}
          <div class="bg-modal-copy">${formatBody(entry.body)}</div>
          ${
            entry.specs && entry.specs.length
              ? `<div class="bg-modal-specs">${entry.specs
                  .map((s) => `<div class="bg-modal-spec"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.value)}</strong></div>`)
                  .join('')}</div>`
              : ''
          }
          ${
            entry.pros && entry.pros.length
              ? `<div class="bg-modal-prosCons"><div class="bg-modal-list pros"><h4>Pros</h4><ul>${entry.pros
                  .map((p) => `<li>${escapeHtml(p)}</li>`)
                  .join('')}</ul></div>${
                  entry.cons && entry.cons.length
                    ? `<div class="bg-modal-list cons"><h4>Trade-offs</h4><ul>${entry.cons
                        .map((c) => `<li>${escapeHtml(c)}</li>`)
                        .join('')}</ul></div>`
                    : ''
                }</div>`
              : ''
          }
          <div class="bg-modal-actions">
            <button type="button" class="bg-modal-btn primary" data-bg-pick="${escapeAttr(label)}">Choose ${escapeHtml(entry.title)}</button>
            <button type="button" class="bg-modal-btn" data-bg-dismiss>Keep browsing</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire close + select-from-modal
  modal.querySelector('.bg-modal-close')?.addEventListener('click', closeBuyerGuideModal);
  modal.querySelector('[data-bg-dismiss]')?.addEventListener('click', closeBuyerGuideModal);
  modal.querySelector('[data-bg-pick]')?.addEventListener('click', (ev) => {
    const pickLabel = (ev.currentTarget as HTMLElement).getAttribute('data-bg-pick') || '';
    closeBuyerGuideModal();
    const cur = getCurrentSlideId();
    if (!cur) return;
    const slide = document.getElementById(`slide-${cur}`);
    if (!slide) return;
    const matchCard = Array.from(slide.querySelectorAll<HTMLElement>('.browse-option')).find(
      (c) => (c.getAttribute('data-label') || '').toLowerCase() === pickLabel.toLowerCase(),
    );
    if (matchCard) {
      slide.querySelectorAll('.browse-option.selected').forEach((e) => e.classList.remove('selected'));
      matchCard.classList.add('selected');
    }
  });

  requestAnimationFrame(() => modal!.classList.add('visible'));
}

function closeBuyerGuideModal(): void {
  const modal = document.getElementById('bg-modal');
  if (modal) modal.classList.remove('visible');
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatBody(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

/* ------------------------------------------------------------------ */
/*  Quote slide — turn into a fillable form                            */
/* ------------------------------------------------------------------ */

function onEnterQuoteSlide(): void {
  // Install a "locked" overlay on the AI viz slot so the user understands
  // they need to submit their details before the visualization generates.
  const wrap = document.querySelector('.ss-quote-img-wrap') as HTMLElement | null;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (wrap && !wrap.querySelector('.ss-quote-lock')) {
    if (spinner) spinner.style.display = 'none';
    const lock = document.createElement('div');
    lock.className = 'ss-quote-lock';
    lock.innerHTML = `
      <div class="ss-quote-lock-sparkle">\u2728</div>
      <div class="ss-quote-lock-title">Your free AI rendering is ready</div>
      <div class="ss-quote-lock-desc">One last step \u2014 share your contact details and we\u2019ll unlock a photorealistic AI preview of <strong>your exact configuration</strong>. Yours to keep, no strings. A specialist will follow up within 24 hours.</div>
    `;
    wrap.appendChild(lock);
  }

  // Inject a contact form below the editorial card if not already present
  const slideEl = document.getElementById('slide-quote');
  if (!slideEl) return;
  if (slideEl.querySelector('.browse-quote-form')) return;

  const card = slideEl.querySelector('.ss-quote-card');
  if (!card) return;

  const form = document.createElement('div');
  form.className = 'browse-quote-form';
  form.innerHTML = `
    <h4 class="browse-form-title">Your contact info</h4>
    <p class="browse-form-hint">We'll use this to prepare and send your custom quote. Optional fields help us be more accurate.</p>
    <div class="browse-form-grid">
      <label><span>Name *</span><input type="text" id="bqf-name" placeholder="Your name" required></label>
      <label><span>Email *</span><input type="email" id="bqf-email" placeholder="you@example.com" required></label>
      <label><span>Phone</span><input type="tel" id="bqf-phone" placeholder="(555) 123-4567"></label>
      <label><span>City / Area</span><input type="text" id="bqf-location" placeholder="e.g. Fort Lauderdale"></label>
      <label><span>Timeline</span><select id="bqf-timeline">
        <option value="">Select timeline</option>
        <option>ASAP</option>
        <option>1-3 months</option>
        <option>3-6 months</option>
        <option>Just exploring</option>
      </select></label>
      <label><span>Budget</span><select id="bqf-budget">
        <option value="">Select budget</option>
        <option>Under $2k</option>
        <option>$2-5k</option>
        <option>$5-10k</option>
        <option>$10k+</option>
      </select></label>
    </div>
    <label class="browse-form-notes"><span>Anything else?</span><textarea id="bqf-notes" placeholder="Notes, measurements, questions\u2026" rows="3"></textarea></label>
  `;
  card.appendChild(form);
}

function populateManualQuote(): void {
  // Fill the selection summary rows using accumulated browseChoices
  const fields: Array<[string, string]> = [
    ['qs-enclosure', browseChoices['enclosure'] || browseChoices['rail-type'] || browseChoices['com-type'] || ''],
    ['qs-glass', browseChoices['glass'] || browseChoices['rail-glass'] || browseChoices['com-glass'] || ''],
    ['qs-hardware', browseChoices['hardware'] || browseChoices['rail-finish'] || browseChoices['com-framing'] || ''],
    ['qs-handle', browseChoices['handle'] || browseChoices['rail-mounting'] || browseChoices['com-scope'] || ''],
    ['qs-extras', browseChoices['extras'] || ''],
  ];
  fields.forEach(([id, val]) => {
    if (!val) return;
    const cell = document.getElementById(id);
    if (cell) {
      cell.textContent = val;
      cell.classList.add('filled');
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Submit                                                             */
/* ------------------------------------------------------------------ */

async function submitManualQuote(): Promise<void> {
  const form = document.querySelector('.browse-quote-form');
  if (!form) return;

  const nameEl = document.getElementById('bqf-name') as HTMLInputElement | null;
  const emailEl = document.getElementById('bqf-email') as HTMLInputElement | null;

  if (!nameEl?.value.trim() || !emailEl?.value.trim()) {
    // Light validation
    if (nameEl && !nameEl.value.trim()) nameEl.classList.add('invalid');
    if (emailEl && !emailEl.value.trim()) emailEl.classList.add('invalid');
    return;
  }

  const get = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value || '';
  const name = get('bqf-name');
  const email = get('bqf-email');
  const phone = get('bqf-phone');
  const location = get('bqf-location');
  const timeline = get('bqf-timeline');
  const budget = get('bqf-budget');

  // Persist
  saveUser({
    name,
    email,
    phone,
    location,
    timeline,
    budget,
    preferredMode: 'browse',
    lastQuote: {
      service: getState().currentService || undefined,
      enclosure: browseChoices['enclosure'],
      glass: browseChoices['glass'],
      hardware: browseChoices['hardware'],
      handle: browseChoices['handle'],
      accessories: browseChoices['accessories'],
      extras: browseChoices['extras'],
    },
  });

  console.log('[Browse] Quote submitted', { name, email, phone, location, timeline, budget, choices: browseChoices });

  // NOW unlock the AI visualization. Swap the lock for a loader, kick off gen.
  const lock = document.querySelector('.ss-quote-lock') as HTMLElement | null;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (lock) lock.remove();
  if (spinner) {
    spinner.style.display = 'flex';
    const label = spinner.querySelector('span');
    if (label) label.textContent = 'Rendering your custom shower\u2026';
  }

  if (currentService() === 'showers') {
    generateShowerImage(browseChoices).then((url) => {
      if (!url) return;
      const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
      if (img) {
        img.src = url;
        img.classList.add('loaded');
      }
      const sp = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
      if (sp) sp.style.display = 'none';
      // Persist to the customer-generations gallery (fire and forget)
      saveCustomerGeneration(url, {
        service: 'showers',
        enclosure: browseChoices['enclosure'],
        glass: browseChoices['glass'],
        hardware: browseChoices['hardware'],
        handle: browseChoices['handle'],
        accessories: browseChoices['accessories'],
        extras: browseChoices['extras'],
        customerName: name,
        customerEmail: email,
        mode: 'browse',
      });
    }).catch((err) => console.warn('[Browse] Image gen failed:', err));
  } else {
    // Non-shower services: just hide the spinner (no AI viz for railings/commercial)
    if (spinner) spinner.style.display = 'none';
  }

  // Show success card + remove nav bar
  showQuoteSent();
  document.getElementById('manual-nav-bar')?.remove();
}
