/**
 * Floating help launcher — a persistent support-agent orb in the bottom right
 * that lets the user tap into voice OR chat at any point in their session,
 * not just from the hero. Like Intercom, but with both channels.
 */

import { el } from '../utils/dom';

const MIC_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

const CHAT_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const SPARK_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>`;

const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export function buildHelpLauncher(): HTMLElement {
  const wrap = el('div', { className: 'help-launcher', id: 'help-launcher' });

  const menu = el('div', { className: 'help-menu', id: 'help-menu' });
  menu.innerHTML = `
    <div class="help-menu-eyebrow">Need a hand?</div>
    <button type="button" class="help-menu-btn" data-help-action="voice">
      <span class="help-menu-btn-icon">${MIC_ICON}</span>
      <span class="help-menu-btn-body">
        <span class="help-menu-btn-title">Talk to Alex</span>
        <span class="help-menu-btn-hint">Live voice specialist</span>
      </span>
    </button>
    <button type="button" class="help-menu-btn" data-help-action="chat">
      <span class="help-menu-btn-icon">${CHAT_ICON}</span>
      <span class="help-menu-btn-body">
        <span class="help-menu-btn-title">Chat with Alex</span>
        <span class="help-menu-btn-hint">Text-based, quick replies</span>
      </span>
    </button>
    <div class="help-menu-divider"></div>
    <button type="button" class="help-menu-btn" data-help-action="quote">
      <span class="help-menu-btn-icon">${SPARK_ICON}</span>
      <span class="help-menu-btn-body">
        <span class="help-menu-btn-title">Get a quote</span>
        <span class="help-menu-btn-hint">Send us your info</span>
      </span>
    </button>
  `;

  const orb = el('button', {
    className: 'help-orb',
    id: 'help-orb',
    type: 'button',
    ariaLabel: 'Open help menu',
    innerHTML: SPARK_ICON,
  });

  wrap.append(menu, orb);

  // Close-on-outside-click tracking
  orb.addEventListener('click', () => {
    const visible = menu.classList.toggle('visible');
    orb.innerHTML = visible ? CLOSE_ICON : SPARK_ICON;
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node) && menu.classList.contains('visible')) {
      menu.classList.remove('visible');
      orb.innerHTML = SPARK_ICON;
    }
  });

  return wrap;
}

export function showHelpOrb(): void {
  document.getElementById('help-orb')?.classList.remove('hide');
}
export function hideHelpOrb(): void {
  document.getElementById('help-orb')?.classList.add('hide');
}
