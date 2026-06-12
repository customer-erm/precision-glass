/**
 * Mode picker — the three ways into the experience.
 *
 *        [Chat]       (( MIC ))        [Browse]
 *      with Alex      Talk to Alex     yourself
 *
 * The mic stays the visual hero (voice is the fastest, most magical path),
 * but all three options are now equal in structure: a control, an
 * always-visible label, and a one-line value prop — so a first-time
 * visitor instantly understands they're three routes to the same outcome.
 * A shared caption mentions the free AI rendering, without overselling it.
 */

import { el } from '../utils/dom';
import { loadUser } from '../utils/user-storage';

const MIC_SVG = `<svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

const CHAT_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const BROWSE_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;

export function buildModePicker(): HTMLElement {
  const user = loadUser();
  const returning = !!(user && user.visitCount > 0 && user.name);

  const wrap = el('div', { className: 'mode-picker-wrap', id: 'mode-picker-wrap' });

  // Welcome-back pill for returning users
  if (returning && user?.name) {
    const welcome = el('div', { className: 'mode-picker-welcome' });
    welcome.innerHTML = `<span class="mode-picker-wave">\u{1F44B}</span> Welcome back, <strong>${escapeHtml(user.name)}</strong>`;
    wrap.appendChild(welcome);
  }

  // One clear primary action — everything else is quiet
  const primary = el('button', {
    className: 'mode-option mode-cta-primary',
    type: 'button',
    ariaLabel: 'Talk to a specialist now — voice, hands-free',
    innerHTML: `${MIC_SVG}<span>Talk to a specialist now</span>`,
  });
  primary.setAttribute('data-mode', 'voice');
  wrap.appendChild(primary);

  const secondaryRow = el('div', { className: 'mode-cta-secondary-row' });
  const chatBtn = el('button', {
    className: 'mode-option mode-cta-secondary',
    type: 'button',
    innerHTML: `${CHAT_SVG}<span>Text chat</span>`,
  });
  chatBtn.setAttribute('data-mode', 'chat');
  const browseBtn = el('button', {
    className: 'mode-option mode-cta-secondary',
    type: 'button',
    innerHTML: `${BROWSE_SVG}<span>Browse on your own</span>`,
  });
  browseBtn.setAttribute('data-mode', 'browse');
  secondaryRow.append(chatBtn, browseBtn);
  wrap.appendChild(secondaryRow);

  // Soft incentive line
  const caption = el('div', { className: 'mode-caption' });
  caption.innerHTML = `
    <span class="mode-caption-incentive">
      <svg class="mode-caption-spark" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M12 2 L13.8 10.2 L22 12 L13.8 13.8 L12 22 L10.2 13.8 L2 12 L10.2 10.2 Z" fill="currentColor"/>
      </svg>
      Ask about a free AI rendering of your new shower
    </span>
  `;
  wrap.appendChild(caption);

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
