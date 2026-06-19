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
  markQuoteRenderReady,
} from '../experience/facade';
import { emitChoice, emitPreview } from '../experience/events';
import { playTransformAnimation } from './transform';
import { generateShowerImage } from '../gemini/image-gen';
import { saveUser } from '../utils/user-storage';
import { setState, getState } from '../utils/state';
import { addInfoButton } from '../sections/buyer-guide-modal';
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

function optionLabel(card: HTMLElement | null): string {
  return card?.getAttribute('data-label') || card?.textContent?.trim() || '';
}

function isAccessoryAddon(card: HTMLElement, label = optionLabel(card)): boolean {
  const kind = card.getAttribute('data-accessory-kind');
  if (kind) return kind === 'addon';
  return /robe|hook/i.test(label);
}

function selectedAccessoryAddons(slideEl: HTMLElement): string {
  return Array.from(slideEl.querySelectorAll<HTMLElement>('.browse-option.selected'))
    .filter((card) => isAccessoryAddon(card))
    .map((card) => optionLabel(card))
    .filter(Boolean)
    .join(', ');
}

function selectedExtrasValue(slideEl: HTMLElement): string {
  const labels = Array.from(slideEl.querySelectorAll<HTMLElement>('.browse-option.selected'))
    .map((card) => optionLabel(card).toLowerCase());
  const grid = labels.some((label) => label.includes('grid'));
  const steam = labels.some((label) => label.includes('steam'));
  if (grid && steam) return 'Grid Patterns + Steam Upgrade';
  if (grid) return 'Grid Patterns';
  if (steam) return 'Steam Upgrade';
  return 'none';
}

function choiceCategoryForSlide(slideId: string): string | null {
  // When ADVANCING to this slide, the user's choice on the PREVIOUS slide
  // should be saved under which category?
  const byService: Record<string, Record<string, string>> = {
    showers: {
      glass: 'enclosure',
      hardware: 'glass',
      accessories: 'hardware',
      extras: 'handle',
      process: 'extras',
      quote: 'extras',
    },
    railings: {
      'rail-glass': 'rail-type',
      'rail-finish': 'rail-glass',
      'rail-mounting': 'rail-finish',
      process: 'rail-mounting',
    },
    commercial: {
      'com-glass': 'com-type',
      'com-framing': 'com-glass',
      'com-scope': 'com-framing',
      process: 'com-scope',
    },
  };
  return byService[currentService()]?.[slideId] || null;
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
    injectManualNavBar();
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

  // Showers: offer the bathroom-photo upload as an inline invitation on the
  // intro slide (opt-in — no forced popup before the experience lands).
  if (service === 'showers' && startSlide === 'intro') {
    injectIntroPhotoButton();
  }

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
/*  Intro photo invitation (browse mode, showers)                      */
/* ------------------------------------------------------------------ */

function injectIntroPhotoButton(): void {
  const content = document.querySelector('#slide-intro .slide-content');
  if (!content || content.querySelector('.intro-photo-btn')) return;
  const btn = el('button', {
    className: 'intro-photo-btn slide-el',
    type: 'button',
    innerHTML: '<span aria-hidden="true">\u{1F4F7}</span><span>Add a photo of your bathroom — see your new shower in <em>your</em> space</span>',
  });
  btn.addEventListener('click', async () => {
    const { openPhotoPrompt } = await import('../sections/photo-prompt');
    const uploaded = await openPhotoPrompt({ timeoutMs: 150_000 });
    if (uploaded) {
      btn.classList.add('has-photo');
      btn.innerHTML = '<span aria-hidden="true">✓</span><span>Photo added — your render will use your real bathroom</span>';
    }
  });
  content.appendChild(btn);
  requestAnimationFrame(() => btn.classList.add('revealed'));
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
  if (next) next.textContent = idx >= order.length - 1 ? 'Prepare proposal' : 'Next \u2192';
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
  const slideEl = document.getElementById(`slide-${cur}`);
  if (currentService() === 'showers' && cur === 'accessories' && slideEl) {
    const handleCard = slideEl.querySelector<HTMLElement>('.browse-option.selected[data-accessory-kind="handle"]')
      || Array.from(slideEl.querySelectorAll<HTMLElement>('.browse-option.selected')).find((card) => !isAccessoryAddon(card))
      || null;
    const handle = optionLabel(handleCard) || browseChoices['handle'];
    const accessories = selectedAccessoryAddons(slideEl);
    if (handle) {
      browseChoices['handle'] = handle;
      emitChoice('handle', handle);
    }
    browseChoices['accessories'] = accessories;
    emitChoice('accessories', accessories || 'none');
  } else if (currentService() === 'showers' && cur === 'extras' && slideEl) {
    const extras = selectedExtrasValue(slideEl);
    browseChoices['extras'] = extras;
    emitChoice('extras', extras);
  } else {
    const category = choiceCategoryForSlide(nextId);
    if (category) {
      const selected = document.querySelector(`#slide-${cur} .browse-option.selected`) as HTMLElement | null;
      if (selected) {
        const choice = optionLabel(selected);
        if (choice) {
          browseChoices[category] = choice;
          emitChoice(category, choice);
        }
      }
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
    hero.style.visibility = '';
    hero.style.pointerEvents = '';
    hero.style.opacity = '1';
    hero.querySelectorAll<HTMLElement>('.hero-title, .hero-subtitle, .hero-trust, .mode-picker-wrap, .mode-picker-welcome, .mode-prompt, .mode-option, .mode-caption').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
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
    '.ss-info-bullet',
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
    if (label) addInfoButton(card, label);

    card.addEventListener('click', () => {
      const clickedLabel = card.getAttribute('data-label') || '';

      if (cur === 'accessories') {
        if (isAccessoryAddon(card, clickedLabel)) {
          card.classList.toggle('selected');
          const accessories = selectedAccessoryAddons(slideEl);
          browseChoices['accessories'] = accessories;
          emitChoice('accessories', accessories || 'none');
          emitPreview('accessories', accessories || 'none');
        } else {
          slideEl.querySelectorAll<HTMLElement>('.browse-option.selected').forEach((e) => {
            if (!isAccessoryAddon(e)) e.classList.remove('selected');
          });
          card.classList.add('selected');
          browseChoices['handle'] = clickedLabel;
          emitChoice('handle', clickedLabel);
          emitPreview('handle', clickedLabel);
        }
        const next = document.getElementById('manual-nav-next');
        if (next) next.classList.add('pulse-ready');
        return;
      }

      if (cur === 'extras') {
        card.classList.toggle('selected');
        const extras = selectedExtrasValue(slideEl);
        browseChoices['extras'] = extras;
        emitChoice('extras', extras);
        emitPreview('extras', extras);
        const next = document.getElementById('manual-nav-next');
        if (next) next.classList.add('pulse-ready');
        return;
      }

      slideEl.querySelectorAll('.browse-option.selected').forEach((e) => e.classList.remove('selected'));
      card.classList.add('selected');
      console.log('[Manual] Selected on', cur, '→', card.getAttribute('data-label'));
      // Browse drives the 3D model live: morph the moment a card is picked
      const previewLabel = card.getAttribute('data-label') || '';
      const previewCategory: Record<string, string> = {
        enclosures: 'enclosure', glass: 'glass', hardware: 'hardware', accessories: 'handle',
        extras: 'extras',
        'rail-types': 'rail-type', 'rail-glass': 'rail-glass', 'rail-finish': 'rail-finish', 'rail-mounting': 'rail-mounting',
        'com-types': 'com-type', 'com-glass': 'com-glass', 'com-framing': 'com-framing', 'com-scope': 'com-scope',
      };
      const cat = previewCategory[cur || ''];
      const isHandle = /pull|handle|ladder|knob/i.test(previewLabel);
      if (cat && previewLabel && (cat !== 'handle' || isHandle)) {
        emitPreview(cat, previewLabel);
      }
      const next = document.getElementById('manual-nav-next');
      if (next) next.classList.add('pulse-ready');
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Quote slide — turn into a fillable form                            */
/* ------------------------------------------------------------------ */

function onEnterQuoteSlide(): void {
  const isShower = currentService() === 'showers';
  // Install a locked overlay on the visual slot so the user understands
  // they need to submit their details before the final brief is prepared.
  const wrap = document.querySelector('.ss-quote-img-wrap') as HTMLElement | null;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (wrap && !wrap.querySelector('.ss-quote-lock')) {
    if (spinner) spinner.style.display = 'none';
    const lock = document.createElement('div');
    lock.className = 'ss-quote-lock';
    lock.innerHTML = `
      <div class="ss-quote-lock-sparkle">\u2728</div>
      <div class="ss-quote-lock-title">${isShower ? 'Your AI rendering is ready' : 'Your project brief is ready'}</div>
      <div class="ss-quote-lock-desc">${isShower
        ? 'One last step - share your contact details and we will unlock a photorealistic preview plus a proposal brief for staff review. Pricing and scheduling stay with the human team.'
        : 'One last step - share your contact details and we will package these selections into a project brief for staff review. Pricing and scheduling stay with the human team.'}</div>
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
    <p class="browse-form-hint">We'll use this to prepare your proposal brief. Optional context helps staff review the design.</p>
    <div class="browse-form-grid">
      <label><span>Name *</span><input type="text" id="bqf-name" placeholder="Your name" required></label>
      <label><span>Email *</span><input type="email" id="bqf-email" placeholder="you@example.com" required></label>
      <label><span>Phone</span><input type="tel" id="bqf-phone" placeholder="(555) 123-4567"></label>
      <label><span>City / Area</span><input type="text" id="bqf-location" placeholder="e.g. Fort Lauderdale"></label>
      <label><span>Project stage</span><select id="bqf-timeline">
        <option value="">Select stage</option>
        <option>Ready for field measure</option>
        <option>Remodel in progress</option>
        <option>Planning layout</option>
        <option>Just exploring</option>
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

function updateQuoteCell(id: string, value: string): void {
  if (!value) return;
  const cell = document.getElementById(id);
  if (cell) {
    cell.textContent = value;
    cell.classList.add('filled');
  }
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
  const notes = get('bqf-notes');

  // Persist
  saveUser({
    name,
    email,
    phone,
    location,
    timeline,
    notes,
    preferredMode: 'browse',
    lastQuote: {
      service: getState().currentService || undefined,
      enclosure: browseChoices['enclosure'] || browseChoices['rail-type'] || browseChoices['com-type'],
      glass: browseChoices['glass'] || browseChoices['rail-glass'] || browseChoices['com-glass'],
      hardware: browseChoices['hardware'] || browseChoices['rail-finish'] || browseChoices['com-framing'],
      handle: browseChoices['handle'] || browseChoices['rail-mounting'] || browseChoices['com-scope'],
      accessories: browseChoices['accessories'],
      extras: browseChoices['extras'],
    },
  });

  updateQuoteCell('qs-name', name);
  updateQuoteCell('qs-email', email);
  updateQuoteCell('qs-phone', phone);
  updateQuoteCell('qs-location', location);
  updateQuoteCell('qs-timeline', timeline);
  updateQuoteCell('qs-notes', notes);

  console.log('[Browse] Proposal submitted', { name, email, phone, location, timeline, notes, choices: browseChoices });

  // NOW unlock the AI visualization. Swap the lock for a loader, kick off gen.
  const lock = document.querySelector('.ss-quote-lock') as HTMLElement | null;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (lock) lock.remove();
  if (spinner) {
    spinner.style.display = 'flex';
    const label = spinner.querySelector('span');
    if (label) label.textContent = currentService() === 'showers' ? 'Rendering your custom shower\u2026' : 'Preparing your project brief\u2026';
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
    // Non-shower services: reveal the static project reference (no AI viz).
    markQuoteRenderReady(currentService() === 'railings' ? '/images/railings/railings-1.webp' : '/images/commercial/commercial-1.webp');
  }

  // Show success card + remove nav bar
  showQuoteSent();
  document.getElementById('manual-nav-bar')?.remove();
}
