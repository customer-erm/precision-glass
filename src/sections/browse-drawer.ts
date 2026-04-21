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
  /** Slide id to launch the configurator at */
  slide: string;
  label: string;
  hint?: string;
}

interface ServiceDef {
  key: ServiceKey;
  label: string;
  anchorId: string;    // top-level section id (for preview hero)
  sections: SectionDef[];
}

const SERVICES: ServiceDef[] = [
  {
    key: 'showers',
    label: 'Frameless Showers',
    anchorId: 'service-showers',
    sections: [
      { slide: 'intro', label: 'Overview', hint: 'What is a frameless shower' },
      { slide: 'gallery', label: 'Portfolio', hint: 'Recent installations' },
      { slide: 'enclosures', label: 'Enclosure types', hint: 'Single door, slider, neo-angle\u2026' },
      { slide: 'glass', label: 'Glass options', hint: 'Clear, frosted, rain' },
      { slide: 'hardware', label: 'Hardware finishes', hint: 'Chrome, nickel, matte black\u2026' },
      { slide: 'accessories', label: 'Handles & accessories' },
      { slide: 'extras', label: 'Premium upgrades', hint: 'Grid, steam' },
      { slide: 'process', label: 'Our process' },
      { slide: 'quote', label: 'Build your quote', hint: 'Configure + submit' },
    ],
  },
  {
    key: 'railings',
    label: 'Glass Railings',
    anchorId: 'service-railings',
    sections: [
      { slide: 'intro', label: 'Overview' },
      { slide: 'gallery', label: 'Portfolio' },
      { slide: 'rail-types', label: 'Mounting types', hint: 'Standoff, base shoe\u2026' },
      { slide: 'rail-glass', label: 'Glass spec' },
      { slide: 'rail-finish', label: 'Finish' },
      { slide: 'rail-mounting', label: 'Install method' },
      { slide: 'process', label: 'Our process' },
      { slide: 'quote', label: 'Build your quote' },
    ],
  },
  {
    key: 'commercial',
    label: 'Commercial Glass',
    anchorId: 'service-commercial',
    sections: [
      { slide: 'intro', label: 'Overview' },
      { slide: 'gallery', label: 'Project portfolio' },
      { slide: 'com-types', label: 'Project types', hint: 'Storefront, curtain wall\u2026' },
      { slide: 'com-glass', label: 'Glass spec', hint: 'Insulated, impact, tint\u2026' },
      { slide: 'com-framing', label: 'Framing system' },
      { slide: 'com-scope', label: 'Project scope' },
      { slide: 'process', label: 'Our process' },
      { slide: 'quote', label: 'Request a quote' },
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
  // Outer wrapper has no transform so the toggle can be a sibling of the
  // drawer and remain fixed to the viewport when the drawer slides away.
  const wrap = el('div', { className: 'browse-drawer-wrap', id: 'browse-drawer-wrap' });
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

  // Hamburger toggle — fixed at top-right, appears once browse mode is
  // activated. Click toggles drawer open/closed.
  const handle = el('button', {
    className: 'browse-menu-toggle',
    id: 'browse-menu-toggle',
    type: 'button',
    ariaLabel: 'Toggle menu',
    innerHTML: `
      <span class="browse-menu-toggle-bars" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
      <span class="browse-menu-toggle-label">Menu</span>
    `,
  });
  // Append to OUTER wrap (sibling of drawer) so the toggle is unaffected
  // by the drawer's transform when it slides off screen.
  wrap.appendChild(drawer);
  wrap.appendChild(handle);

  // Initialize section list for default service
  renderSectionsList(currentService);

  return wrap;
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
    item.setAttribute('data-launch-slide', sec.slide);
    item.setAttribute('data-launch-service', serviceKey);
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
  const wrap = document.getElementById('browse-drawer-wrap');
  if (!drawer) return;
  drawer.classList.remove('collapsed');
  drawer.classList.add('visible');
  // Once browse mode is active, the hamburger toggle persists even when
  // the drawer is collapsed
  wrap?.classList.add('active');
  // Sync hamburger: it's showing the "X" shape when drawer is open
  document.getElementById('browse-menu-toggle')?.classList.add('open');

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
  const wrap = document.getElementById('browse-drawer-wrap');
  if (drawer) drawer.classList.remove('visible');
  wrap?.classList.remove('active');
}

export function collapseBrowseDrawer(): void {
  const drawer = document.getElementById('browse-drawer');
  if (drawer) drawer.classList.add('collapsed');
  // Sync toggle button open state
  document.getElementById('browse-menu-toggle')?.classList.remove('open');
}

export function expandBrowseDrawer(): void {
  const drawer = document.getElementById('browse-drawer');
  if (drawer) drawer.classList.remove('collapsed');
  document.getElementById('browse-menu-toggle')?.classList.add('open');
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
    // Hamburger toggle — opens or closes the drawer panel
    if (target.closest('#browse-menu-toggle')) {
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

    // Drawer item click → launch the manual configurator for that service
    // at the clicked slide. If already in that tour, just jump.
    const launchItem = target.closest('[data-launch-slide]') as HTMLElement | null;
    if (launchItem) {
      const slide = launchItem.getAttribute('data-launch-slide');
      const service = launchItem.getAttribute('data-launch-service') as ServiceKey | null;
      if (slide && service) {
        // Highlight active item
        document.querySelectorAll('.browse-drawer-item.active').forEach((n) => n.classList.remove('active'));
        launchItem.classList.add('active');
        collapseBrowseDrawer();
        // Kick off (or hop within) the manual tour
        setState({ currentMode: 'browse' });
        saveUser({ preferredMode: 'browse' });
        await startBrowseTour(service, slide);
      }
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
