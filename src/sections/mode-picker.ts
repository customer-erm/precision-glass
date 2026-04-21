/**
 * Voice-first mode picker.
 *
 * Layout:
 *             (Chat)     [ MIC ]     (Browse)
 *              pill       HERO         pill
 *
 * The mic is the primary action — large, glowing, with animated pulse
 * rings. Chat and Browse are secondary pill buttons flanking it.
 */

import { el } from '../utils/dom';
import { loadUser } from '../utils/user-storage';

const MIC_SVG = `<svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

const CHAT_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const BROWSE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;

export function buildModePicker(): HTMLElement {
  const user = loadUser();
  const returning = !!(user && user.visitCount > 0 && user.name);
  const preferredMode = user?.preferredMode || null;

  const wrap = el('div', { className: 'mode-picker-wrap', id: 'mode-picker-wrap' });

  // Welcome-back pill for returning users
  if (returning && user?.name) {
    const welcome = el('div', { className: 'mode-picker-welcome' });
    welcome.innerHTML = `<span class="mode-picker-wave">\u{1F44B}</span> Welcome back, <strong>${escapeHtml(user.name)}</strong>`;
    wrap.appendChild(welcome);
  }

  // Hero cluster: [chat-pill]  [ MIC ]  [browse-pill]
  const cluster = el('div', { className: 'mode-cluster', id: 'mode-cluster' });

  // Chat pill (left satellite)
  const chatPill = el('button', {
    className: 'mode-pill mode-pill-chat',
    type: 'button',
    id: 'mode-pill-chat',
    innerHTML: `<span class="mode-pill-icon">${CHAT_SVG}</span><span class="mode-pill-label">Chat</span>`,
  });
  chatPill.setAttribute('data-mode', 'chat');
  if (preferredMode === 'chat') chatPill.classList.add('preferred');

  // Voice hero (center, big mic with pulse rings)
  const voiceHero = el('button', {
    className: 'mode-voice-hero',
    type: 'button',
    id: 'mode-voice-hero',
    ariaLabel: 'Talk to Alex',
  });
  voiceHero.setAttribute('data-mode', 'voice');
  voiceHero.innerHTML = `
    <span class="mode-voice-ring ring1"></span>
    <span class="mode-voice-ring ring2"></span>
    <span class="mode-voice-ring ring3"></span>
    <span class="mode-voice-core">${MIC_SVG}</span>
    <span class="mode-voice-glow"></span>
  `;
  if (preferredMode === 'voice') voiceHero.classList.add('preferred');

  // Browse pill (right satellite)
  const browsePill = el('button', {
    className: 'mode-pill mode-pill-browse',
    type: 'button',
    id: 'mode-pill-browse',
    innerHTML: `<span class="mode-pill-label">Browse</span><span class="mode-pill-icon">${BROWSE_SVG}</span>`,
  });
  browsePill.setAttribute('data-mode', 'browse');
  if (preferredMode === 'browse') browsePill.classList.add('preferred');

  cluster.append(chatPill, voiceHero, browsePill);
  wrap.appendChild(cluster);

  // Caption under the cluster
  const caption = el('div', { className: 'mode-caption' });
  caption.innerHTML = `
    <span class="mode-caption-main" id="mode-caption-main">${returning && user?.name ? `Welcome back, ${escapeHtml(user.name.split(' ')[0])} \u2014 Speak with a Glass Specialist Now` : 'Speak with a Glass Specialist Now'}</span>
    <span class="mode-caption-sub">prefer <button type="button" class="mode-inline-link" data-mode="chat">chat</button> \u00B7 <button type="button" class="mode-inline-link" data-mode="browse">browse on your own</button></span>
    <span class="mode-caption-incentive"><span class="mode-caption-spark">\u2728</span> Free Custom Project Visualization</span>
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
