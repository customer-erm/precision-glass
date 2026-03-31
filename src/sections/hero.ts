import { el } from '../utils/dom';

const MIC_SVG = `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

export function buildHero(): HTMLElement {
  const section = el('section', { className: 'hero', id: 'hero' });

  // Hero background image
  const heroBg = el('div', { className: 'hero-bg-image' });
  heroBg.appendChild(el('img', { src: '/images/showers/showers-3.webp', alt: '', loading: 'eager' }));
  section.appendChild(heroBg);

  // Badge
  const badge = el('div', { className: 'hero-badge' }, ['Premium Glass Solutions']);

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

  // Mic button
  const micContainer = el('div', { className: 'mic-container idle', id: 'mic-container' });
  const micBtn = el('button', { className: 'mic-btn', id: 'mic-btn', innerHTML: MIC_SVG });
  const ring1 = el('div', { className: 'mic-ring' });
  const ring2 = el('div', { className: 'mic-ring' });
  const ring3 = el('div', { className: 'mic-ring' });
  const micLabel = el('span', { className: 'mic-label', id: 'mic-label', textContent: 'Tap to speak with our glass specialist' });
  micContainer.append(ring1, ring2, ring3, micBtn, micLabel);

  section.append(badge, title, subtitle, servicesGrid, micContainer);
  return section;
}

export function buildNav(): HTMLElement {
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
  inner.append(logo, status);
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
