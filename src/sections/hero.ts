import { el } from '../utils/dom';
import { buildModePicker } from './mode-picker';
import { images } from '../data/image-map';

export function buildHero(): HTMLElement {
  const section = el('section', { className: 'hero', id: 'hero' });

  // Hero background: Ken Burns slideshow cycling through all three services
  const heroBg = el('div', { className: 'hero-bg-image hero-bg-kb' });
  const kbImages = [
    images.showers.hero,
    images.railings.hero,
    images.commercial.hero,
    images.showers.gallery[0],
    images.railings.gallery[0],
    images.commercial.gallery[0],
    images.showers.gallery[2],
    images.railings.gallery[2],
  ];
  kbImages.forEach((src, i) => {
    const img = el('img', { src, alt: '', loading: i < 2 ? 'eager' : 'lazy' });
    if (i === 0) img.classList.add('kb-active');
    heroBg.appendChild(img);
  });

  /* Ken Burns crossfade:
     Each image runs a zoom+pan animation while active. When we advance,
     capture the CURRENT animated transform on the outgoing image as an
     inline style — that holds its position during the 2s opacity fade
     instead of snapping back to the base `transform: scale(...)` rule.
     The incoming image clears any stale inline transform and lets its
     CSS animation run from scratch. */
  let kbIdx = 0;
  setInterval(() => {
    const imgs = Array.from(heroBg.querySelectorAll('img')) as HTMLImageElement[];
    if (!imgs.length) return;
    const current = imgs[kbIdx];

    // Freeze the outgoing image at its current animated position
    const computed = getComputedStyle(current).transform;
    if (computed && computed !== 'none') {
      current.style.transform = computed;
    }
    current.classList.remove('kb-active');

    // Advance index, prepare incoming image
    kbIdx = (kbIdx + 1) % imgs.length;
    const next = imgs[kbIdx];
    // Clear any leftover inline transform so the CSS animation runs clean
    next.style.transform = '';
    // Force animation restart by toggling class off/on across a frame
    next.classList.remove('kb-active');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    next.offsetWidth; // reflow
    next.classList.add('kb-active');

    // After the crossfade completes, wipe the inline transform on the
    // old image so the next time it becomes active its animation runs fresh.
    setTimeout(() => {
      current.style.transform = '';
    }, 2400);
  }, 7000);
  section.appendChild(heroBg);

  // Title
  const title = el('h1', {
    className: 'hero-title',
    innerHTML: 'Craftsmanship in<br>Every <span class="accent">Detail</span>',
  });

  // Subtitle
  const subtitle = el('p', {
    className: 'hero-subtitle',
    textContent: 'From frameless shower enclosures to commercial storefronts, we bring precision and elegance to every glass installation.',
  });

  // Service cards
  const servicesGrid = el('div', { className: 'services-grid', id: 'services-grid' });
  const services = [
    { key: 'showers', title: 'Frameless Showers', desc: 'Elegant enclosures', img: '/images/showers/showers-1.webp' },
    { key: 'railings', title: 'Glass Railings', desc: 'Modern safety', img: '/images/railings/railings-1.webp' },
    { key: 'commercial', title: 'Commercial Glass', desc: 'Storefronts & more', img: '/images/commercial/commercial-1.webp' },
  ];

  services.forEach((s) => {
    const card = el('div', { className: 'service-card' });
    card.setAttribute('data-service', s.key);
    const img = el('img', { className: 'service-card-image', src: s.img, alt: s.title, loading: 'eager' });
    const overlay = el('div', { className: 'service-card-overlay' });
    const content = el('div', { className: 'service-card-content' });
    const cardTitle = el('h3', { className: 'service-card-title', textContent: s.title });
    const cardDesc = el('p', { className: 'service-card-desc', textContent: s.desc });
    content.append(cardTitle, cardDesc);
    card.append(img, overlay, content);
    servicesGrid.appendChild(card);
  });

  // Mode picker (replaces the old single mic button)
  const modePicker = buildModePicker();

  // Single centered block: title + subtitle + action icons grouped tightly
  const headline = el('div', { className: 'hero-headline' });
  headline.append(title, subtitle, modePicker);

  // Services grid is retained but hidden (kept in DOM for any deep-links
  // that still query .service-card — we rely on the mode picker now).
  servicesGrid.classList.add('hidden');

  section.append(headline, servicesGrid);
  return section;
}

export function buildNav(): HTMLElement {
  const PHONE_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

  const nav = el('nav', { className: 'nav', id: 'nav' });
  const inner = el('div', { className: 'nav-inner' });
  const logo = el('div', {
    className: 'nav-logo',
    innerHTML: 'Precision<span>Glass</span>',
  });
  const status = el('div', { className: 'nav-status', id: 'nav-status' });
  const dot = el('div', { className: 'nav-status-dot' });
  const statusText = el('span', { id: 'nav-status-text', textContent: 'AI Assistant Active' });
  status.append(dot, statusText);

  // Persistent top-right CTA: phone number + Get Quote button + menu toggle
  const ctaWrap = el('div', { className: 'nav-cta-wrap' });
  const phone = el('a', {
    className: 'nav-phone',
    href: 'tel:+18005551234',
    innerHTML: `${PHONE_SVG}<span>(800) 555-1234</span>`,
  });
  const ctaBtn = el('button', {
    className: 'nav-cta-btn',
    id: 'nav-cta-btn',
    type: 'button',
    textContent: 'Get a quote',
  });
  // Menu toggle lives here so it visually aligns with the other nav CTAs.
  // Hidden by default; shown when browse mode is active.
  const menuToggle = el('button', {
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
  ctaWrap.append(phone, ctaBtn, menuToggle);

  inner.append(logo, status, ctaWrap);
  nav.appendChild(inner);
  return nav;
}

export function buildBackground(): HTMLElement {
  return el('div', { className: 'bg-gradient' });
}

/**
 * Agent bar at the bottom — avatar + tip callouts instead of raw transcript.
 */
export function buildAgentBar(): HTMLElement {
  const MIC_SMALL = `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

  const bar = el('div', { className: 'agent-bar', id: 'agent-bar' });

  // Avatar
  const avatar = el('div', { className: 'agent-avatar', id: 'agent-avatar' });
  avatar.appendChild(el('img', { src: '/images/avatar.png', alt: 'Alex' }));
  bar.appendChild(avatar);

  // Agent info + tip
  const info = el('div', { className: 'agent-info' });
  const nameRow = el('div', { className: 'agent-name-row' });
  nameRow.appendChild(el('span', { className: 'agent-name', textContent: 'Alex' }));
  nameRow.appendChild(el('span', { className: 'agent-role', textContent: 'Glass Specialist' }));
  info.appendChild(nameRow);
  const tip = el('div', { className: 'agent-tip', id: 'agent-tip', textContent: 'Tap the mic to start a conversation' });
  info.appendChild(tip);
  bar.appendChild(info);

  // Mic indicator
  const mic = el('div', { className: 'agent-mic', id: 'agent-mic', innerHTML: MIC_SMALL });
  bar.appendChild(mic);

  // End button
  const endBtn = el('button', { className: 'agent-end-btn', id: 'end-session-btn', textContent: 'End' });
  bar.appendChild(endBtn);

  return bar;
}
