/**
 * Three-card mode picker: Voice / Chat / Browse.
 * Replaces the old single-mic-button area in the hero.
 * For returning users, shows a warm welcome line and pre-highlights
 * their previously preferred mode.
 */

import { el } from '../utils/dom';
import { loadUser } from '../utils/user-storage';

const MIC_SVG = `<svg viewBox="0 0 24 24" width="32" height="32"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

const CHAT_SVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const BROWSE_SVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;

export function buildModePicker(): HTMLElement {
  const user = loadUser();
  const returning = !!(user && user.visitCount > 0 && user.name);
  const preferredMode = user?.preferredMode || null;

  const wrap = el('div', { className: 'mode-picker-wrap', id: 'mode-picker-wrap' });

  // Welcome-back line for returning users
  if (returning && user?.name) {
    const welcome = el('div', { className: 'mode-picker-welcome' });
    welcome.innerHTML = `<span class="mode-picker-wave">\u{1F44B}</span> Welcome back, <strong>${escapeHtml(user.name)}</strong>`;
    wrap.appendChild(welcome);
  }

  const prompt = el('div', {
    className: 'mode-picker-prompt',
    textContent: returning ? 'How would you like to continue?' : 'How would you like to explore?',
  });
  wrap.appendChild(prompt);

  const grid = el('div', { className: 'mode-picker-grid', id: 'mode-picker-grid' });

  const modes = [
    {
      key: 'voice',
      icon: MIC_SVG,
      title: 'Voice',
      desc: 'Talk with our glass specialist Alex',
      badge: 'Most popular',
    },
    {
      key: 'chat',
      icon: CHAT_SVG,
      title: 'Chat',
      desc: 'Type with Alex and pick from options',
      badge: null,
    },
    {
      key: 'browse',
      icon: BROWSE_SVG,
      title: 'Browse',
      desc: 'Explore everything on your own',
      badge: null,
    },
  ];

  modes.forEach((m) => {
    const card = el('button', {
      className: 'mode-card',
      id: `mode-card-${m.key}`,
      type: 'button',
    });
    card.setAttribute('data-mode', m.key);
    if (preferredMode === m.key) card.classList.add('preferred');

    const iconWrap = el('div', { className: 'mode-card-icon', innerHTML: m.icon });
    const title = el('h4', { className: 'mode-card-title', textContent: m.title });
    const desc = el('p', { className: 'mode-card-desc', textContent: m.desc });

    card.append(iconWrap, title, desc);

    if (m.badge) {
      const badge = el('span', { className: 'mode-card-badge', textContent: m.badge });
      card.appendChild(badge);
    }
    if (preferredMode === m.key) {
      const last = el('span', { className: 'mode-card-last', textContent: 'Last used' });
      card.appendChild(last);
    }

    grid.appendChild(card);
  });

  wrap.appendChild(grid);

  return wrap;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
