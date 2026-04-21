/**
 * Browse mode drawer — a right-side overlay that appears when Browse mode is
 * activated. Gives the user an interactive menu of services and sections they
 * can jump to, plus CTAs to launch the guided configurator for each service.
 *
 * It stays open while the user scrolls so they can navigate freely, and can be
 * collapsed to a small tab if they want more viewport.
 */

import { el } from '../utils/dom';
import { startBrowseTour } from '../animations/manual-nav';
import { setState } from '../utils/state';
import { saveUser } from '../utils/user-storage';

type ServiceKey = 'showers' | 'railings' | 'commercial';

interface SectionDef {
  id: string;          // DOM id to scroll to (either existing on the service section page, or a section within it)
  label: string;
  hint?: string;
}

interface ServiceDef {
  key: ServiceKey;
  label: string;
  anchorId: string;    // top-level section id
  sections: SectionDef[];
}

const SERVICES: ServiceDef[] = [
  {
    key: 'showers',
    label: 'Frameless Showers',
    anchorId: 'service-showers',
    sections: [
      { id: 'shower-hero', label: 'Overview' },
      { id: 'shower-gallery', label: 'Portfolio', hint: 'Recent installations' },
      { id: 'enclosure-types', label: 'Enclosure types', hint: 'Single door, slider, neo-angle\u2026' },
      { id: 'glass-options', label: 'Glass options' },
      { id: 'hardware-finishes', label: 'Hardware finishes' },
      { id: 'accessories', label: 'Handles & accessories' },
      { id: 'our-process', label: 'Our process' },
      { id: 'showers-bottom-cta', label: 'Get your quote' },
    ],
  },
  {
    key: 'railings',
    label: 'Glass Railings',
    anchorId: 'service-railings',
    sections: [
      { id: 'service-railings', label: 'Overview' },
    ],
  },
  {
    key: 'commercial',
    label: 'Commercial Glass',
    anchorId: 'service-commercial',
    sections: [
      { id: 'service-commercial', label: 'Overview' },
    ],
  },
];

const ARROW_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

const CLOSE_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const CHEVRON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

let currentService: ServiceKey = 'showers';

/* ------------------------------------------------------------------ */
/*  DOM builder                                                        */
/* ------------------------------------------------------------------ */

export function buildBrowseDrawer(): HTMLElement {
  const drawer = el('div', { className: 'browse-drawer', id: 'browse-drawer' });

  // Header
  const header = el('div', { className: 'browse-drawer-header' });
  const titleWrap = el('div', { className: 'browse-drawer-title-wrap' });
  titleWrap.appendChild(el('div', { className: 'browse-drawer-eyebrow', textContent: 'Explore on your own' }));
  titleWrap.appendChild(el('h3', { className: 'browse-drawer-title', textContent: 'Service menu' }));
  header.appendChild(titleWrap);

  const closeBtn = el('button', {
    className: 'browse-drawer-close',
    id: 'browse-drawer-close',
    type: 'button',
    innerHTML: CLOSE_SVG,
    ariaLabel: 'Close menu',
  });
  header.appendChild(closeBtn);
  drawer.appendChild(header);

  // Service tabs
  const tabs = el('div', { className: 'browse-drawer-tabs', id: 'browse-drawer-tabs' });
  SERVICES.forEach((s) => {
    const tab = el('button', {
      className: 'browse-drawer-tab' + (s.key === currentService ? ' active' : ''),
      type: 'button',
    });
    tab.setAttribute('data-service-tab', s.key);
    tab.textContent = s.label;
    tabs.appendChild(tab);
  });
  drawer.appendChild(tabs);

  // Sections list (rebuilt on tab switch)
  const list = el('nav', { className: 'browse-drawer-list', id: 'browse-drawer-list' });
  drawer.appendChild(list);

  // CTA footer
  const footer = el('div', { className: 'browse-drawer-footer' });
  const cta = el('button', {
    className: 'browse-drawer-cta',
    id: 'browse-drawer-cta',
    type: 'button',
  });
  cta.innerHTML = `<span>Configure a quote</span>${ARROW_SVG}`;
  cta.setAttribute('data-service', currentService);
  footer.appendChild(cta);

  const hint = el('p', { className: 'browse-drawer-hint', textContent: 'Answer a few quick questions and get your custom quote in 24h.' });
  footer.appendChild(hint);

  drawer.appendChild(footer);

  // Re-open tab (when drawer is collapsed)
  const handle = el('button', {
    className: 'browse-drawer-handle',
    id: 'browse-drawer-handle',
    type: 'button',
    innerHTML: `<span>Menu</span>${CHEVRON_SVG}`,
  });
  drawer.appendChild(handle);

  // Initialize section list for default service
  renderSectionsList(currentService);

  return drawer;
}

/* ------------------------------------------------------------------ */
/*  Render sections list for the active service tab                    */
/* ------------------------------------------------------------------ */

function renderSectionsList(serviceKey: ServiceKey): void {
  const list = document.getElementById('browse-drawer-list');
  if (!list) return;
  const svc = SERVICES.find((s) => s.key === serviceKey);
  if (!svc) return;
  list.innerHTML = '';

  svc.sections.forEach((sec, i) => {
    const item = el('button', {
      className: 'browse-drawer-item',
      type: 'button',
    });
    item.setAttribute('data-scroll-to', sec.id);
    item.innerHTML = `
      <span class="browse-drawer-item-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="browse-drawer-item-body">
        <span class="browse-drawer-item-label">${escapeHtml(sec.label)}</span>
        ${sec.hint ? `<span class="browse-drawer-item-hint">${escapeHtml(sec.hint)}</span>` : ''}
      </span>
      <span class="browse-drawer-item-arrow">${ARROW_SVG}</span>
    `;
    list.appendChild(item);
  });

  // Update CTA service target
  const cta = document.getElementById('browse-drawer-cta');
  if (cta) cta.setAttribute('data-service', serviceKey);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function openBrowseDrawer(service: ServiceKey = 'showers'): void {
  currentService = service;
  const drawer = document.getElementById('browse-drawer');
  if (!drawer) return;
  drawer.classList.remove('collapsed');
  drawer.classList.add('visible');

  // Activate correct tab and render sections
  drawer.querySelectorAll('[data-service-tab]').forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-service-tab') === service);
  });
  renderSectionsList(service);

  // Scroll to the service content
  const target = document.getElementById(`service-${service}`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function closeBrowseDrawer(): void {
  const drawer = document.getElementById('browse-drawer');
  if (drawer) drawer.classList.remove('visible');
}

export function collapseBrowseDrawer(): void {
  const drawer = document.getElementById('browse-drawer');
  if (drawer) drawer.classList.add('collapsed');
}

export function expandBrowseDrawer(): void {
  const drawer = document.getElementById('browse-drawer');
  if (drawer) drawer.classList.remove('collapsed');
}

/* ------------------------------------------------------------------ */
/*  Wiring (called once at app init)                                   */
/* ------------------------------------------------------------------ */

export function wireBrowseDrawer(): void {
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Close button
    if (target.closest('#browse-drawer-close')) {
      closeBrowseDrawer();
      return;
    }

    // Collapse/expand handle
    if (target.closest('#browse-drawer-handle')) {
      const drawer = document.getElementById('browse-drawer');
      if (drawer?.classList.contains('collapsed')) expandBrowseDrawer();
      else collapseBrowseDrawer();
      return;
    }

    // Service tab
    const tab = target.closest('[data-service-tab]') as HTMLElement | null;
    if (tab) {
      const svc = tab.getAttribute('data-service-tab') as ServiceKey;
      currentService = svc;
      document.querySelectorAll('[data-service-tab]').forEach((t) => t.classList.toggle('active', t === tab));
      renderSectionsList(svc);
      const section = document.getElementById(`service-${svc}`);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Section jump
    const scroll = target.closest('[data-scroll-to]') as HTMLElement | null;
    if (scroll) {
      const id = scroll.getAttribute('data-scroll-to');
      if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Configure-a-quote CTA
    if (target.closest('#browse-drawer-cta')) {
      const cta = target.closest('#browse-drawer-cta') as HTMLElement;
      const svc = (cta.getAttribute('data-service') as ServiceKey) || 'showers';
      setState({ currentMode: 'browse' });
      saveUser({ preferredMode: 'browse' });
      closeBrowseDrawer();
      await startBrowseTour(svc);
      return;
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
