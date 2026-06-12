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
import { loadUser, clearUser } from '../utils/user-storage';

const MIC_SVG = `<svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

const CHAT_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const BROWSE_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;

export function buildModePicker(): HTMLElement {
  const user = loadUser();
  const returning = !!(user && user.visitCount > 0 && user.name);

  const wrap = el('div', { className: 'mode-picker-wrap mode-stack', id: 'mode-picker-wrap' });

  // Welcome-back pill + reset (clears the stored profile)
  if (returning && user?.name) {
    const welcomeRow = el('div', { className: 'mode-welcome-row' });
    const welcome = el('div', { className: 'mode-picker-welcome' });
    welcome.innerHTML = `<span class="mode-picker-wave">\u{1F44B}</span> Welcome back, <strong>${escapeHtml(user.name)}</strong>`;
    const reset = el('button', {
      className: 'mode-reset-btn',
      type: 'button',
      title: 'Not you? Clear the saved profile and start fresh',
      ariaLabel: 'Reset saved profile',
      innerHTML: '<span aria-hidden="true">✕</span> Reset',
    });
    reset.addEventListener('click', () => {
      clearUser();
      window.location.reload();
    });
    welcomeRow.append(welcome, reset);
    wrap.appendChild(welcomeRow);
  }

  const prompt = el('div', {
    className: 'mode-prompt',
    textContent: returning ? 'Pick up where you left off — how do you want to design?' : 'How would you like to design your shower?',
  });
  wrap.appendChild(prompt);

  // Three routes, stacked — voice leads
  const stack = el('div', { className: 'mode-stack-list' });
  stack.append(
    stackOption('voice', MIC_SVG, 'Talk to Alex', 'Voice · hands-free', true),
    stackOption('chat', CHAT_SVG, 'Chat with Alex', 'Tap-through, no talking', false),
    stackOption('browse', BROWSE_SVG, 'Browse yourself', 'Explore at your pace', false),
  );
  wrap.appendChild(stack);

  // Returning users see their last design at a glance
  if (returning && user?.lastQuote && (user.lastQuote.enclosure || user.lastQuote.service)) {
    const q = user.lastQuote;
    const summary = [q.enclosure, q.glass, q.hardware].filter(Boolean).join(' · ') || q.service || '';
    const hasRender = !!user.lastRenderUrl;
    const card = el(hasRender ? 'a' : 'div', { className: 'mode-last-design' });
    if (hasRender) {
      card.setAttribute('href', user.lastRenderUrl!);
      card.setAttribute('target', '_blank');
      card.setAttribute('rel', 'noopener');
    }
    card.innerHTML = `
      ${hasRender ? `<img src="${escapeHtml(user.lastRenderUrl!)}" alt="Your last AI rendering" loading="lazy">` : ''}
      <span class="mode-last-design-info">
        <span class="mode-last-design-label">Your last design</span>
        <span class="mode-last-design-summary">${escapeHtml(summary)}</span>
        <span class="mode-last-design-hint">${hasRender ? 'View your rendering ↗' : 'Ask Alex to pull it back up'}</span>
      </span>
    `;
    wrap.appendChild(card);
  }

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

function stackOption(mode: string, icon: string, label: string, sub: string, primary: boolean): HTMLElement {
  const btn = el('button', {
    className: `mode-option mode-stack-option${primary ? ' primary' : ''}`,
    type: 'button',
    ariaLabel: `${label} — ${sub}`,
    innerHTML: `
      <span class="mso-icon">${icon}</span>
      <span class="mso-text">
        <span class="mso-label">${label}</span>
        <span class="mso-sub">${sub}</span>
      </span>
      <span class="mso-arrow" aria-hidden="true">→</span>
    `,
  });
  btn.setAttribute('data-mode', mode);
  return btn;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
