/**
 * Chat panel — bottom-right corner widget that drives the guided tour via
 * the ChatDriver state machine. Shows agent messages, rich option chips,
 * inline forms, typing indicators, and a progress pip bar.
 *
 * Users can tap a chip OR type free text — the driver handles both.
 */

import { el } from '../utils/dom';
import { ChatDriver, type Chip } from '../gemini/chat-client';

const SEND_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

let driver: ChatDriver | null = null;
let currentChips: Chip[] = [];
let inputRequired = false;
let typewriterToken = 0;

/* ------------------------------------------------------------------ */
/*  DOM                                                                */
/* ------------------------------------------------------------------ */

export function buildChatPanel(): HTMLElement {
  const panel = el('div', { className: 'chat-panel', id: 'chat-panel' });

  // Header
  const header = el('div', { className: 'chat-panel-header' });
  const avatar = el('div', { className: 'chat-panel-avatar' });
  avatar.appendChild(el('img', { src: '/images/avatar.jpg', alt: 'Alex' }));
  const meta = el('div', { className: 'chat-panel-meta' });
  meta.appendChild(el('div', { className: 'chat-panel-name', textContent: 'Alex' }));
  meta.appendChild(el('div', { className: 'chat-panel-role', textContent: 'Glass Specialist' }));

  // Action buttons: Start Over + Close
  const actions = el('div', { className: 'chat-panel-actions' });
  const restartBtn = el('button', {
    className: 'chat-panel-restart',
    id: 'chat-panel-restart',
    type: 'button',
    ariaLabel: 'Start over',
    title: 'Start over',
    innerHTML: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span>Start over</span>`,
  });
  const closeBtn = el('button', {
    className: 'chat-panel-close',
    id: 'chat-panel-close',
    type: 'button',
    ariaLabel: 'Close',
    innerHTML: '\u2715',
  });
  actions.append(restartBtn, closeBtn);

  header.append(avatar, meta, actions);
  panel.appendChild(header);

  // Progress pips
  const progress = el('div', { className: 'chat-progress', id: 'chat-progress' });
  panel.appendChild(progress);

  // Messages
  const messages = el('div', { className: 'chat-messages', id: 'chat-messages' });
  panel.appendChild(messages);

  // Extras (inline form / custom content)
  const extras = el('div', { className: 'chat-extras', id: 'chat-extras' });
  panel.appendChild(extras);

  // Chips
  const chips = el('div', { className: 'chat-chips', id: 'chat-chips' });
  panel.appendChild(chips);

  const questionBtn = el('button', {
    className: 'chat-question-btn',
    id: 'chat-question-btn',
    type: 'button',
    textContent: '?',
    ariaLabel: 'Ask Alex a question',
    title: 'Ask Alex a question',
  });
  panel.appendChild(questionBtn);

  // Input
  const inputRow = el('form', { className: 'chat-input-row', id: 'chat-input-form' });
  const input = el('input', {
    className: 'chat-input',
    id: 'chat-input',
    type: 'text',
    placeholder: 'Tap an option or type\u2026',
    autocomplete: 'off',
  });
  const sendBtn = el('button', {
    className: 'chat-send-btn',
    id: 'chat-send-btn',
    type: 'submit',
    innerHTML: SEND_SVG,
    ariaLabel: 'Send',
  });
  inputRow.append(input, sendBtn);
  panel.appendChild(inputRow);

  return panel;
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function appendMessage(kind: 'user' | 'agent' | 'typing', text: string): HTMLElement {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return document.createElement('div');

  if (kind === 'user') return document.createElement('div');

  if (kind !== 'typing') {
    msgs.querySelectorAll('.chat-msg.typing').forEach((n) => n.remove());
  }
  if (kind === 'agent' || kind === 'typing') msgs.innerHTML = '';

  const row = el('div', { className: `chat-msg chat-msg-${kind}` });
  if (kind === 'agent' || kind === 'typing') {
    const av = el('div', { className: 'chat-msg-avatar' });
    av.appendChild(el('img', { src: '/images/avatar.jpg', alt: '' }));
    row.appendChild(av);
  }
  const bubble = el('div', { className: 'chat-msg-bubble' });
  if (kind === 'typing') {
    bubble.innerHTML = '<span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>';
    row.classList.add('typing');
  } else if (kind === 'agent') {
    typeAgentMessage(bubble, text, msgs);
  } else {
    bubble.textContent = text;
  }
  row.appendChild(bubble);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  return row;
}

function typeAgentMessage(bubble: HTMLElement, text: string, msgs: HTMLElement): void {
  const token = ++typewriterToken;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || text.length < 24) {
    bubble.innerHTML = formatChatText(text);
    return;
  }
  bubble.classList.add('typewriting');
  const step = Math.max(2, Math.ceil(text.length / 52));
  let i = 0;
  const tick = (): void => {
    if (token !== typewriterToken) return;
    i = Math.min(text.length, i + step);
    bubble.innerHTML = formatChatText(text.slice(0, i));
    msgs.scrollTop = msgs.scrollHeight;
    if (i < text.length) {
      window.setTimeout(tick, 8);
    } else {
      bubble.classList.remove('typewriting');
      bubble.innerHTML = formatChatText(text);
      msgs.scrollTop = msgs.scrollHeight;
    }
  };
  tick();
}

function formatChatText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function renderChips(chips: Chip[]): void {
  currentChips = chips;
  wireTourCardsToChips();
  const wrap = document.getElementById('chat-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!chips.length || shouldUseTourCards(chips)) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';

  chips.forEach((chip) => {
    const btn = el('button', {
      className: 'chat-chip' + (chip.primary ? ' primary' : '') + (chip.hint ? ' has-hint' : ''),
      type: 'button',
    });
    const main = el('span', { className: 'chat-chip-label', textContent: chip.label });
    btn.appendChild(main);
    if (chip.hint) btn.appendChild(el('span', { className: 'chat-chip-hint', textContent: chip.hint }));
    btn.addEventListener('click', () => {
      if (driver) driver.onChipTapped(chip);
    });
    wrap.appendChild(btn);
  });
}

function setInputMode(enabled: boolean, stepId: string): void {
  inputRequired = enabled;
  const panel = document.getElementById('chat-panel');
  const input = document.getElementById('chat-input') as HTMLInputElement | null;
  panel?.classList.toggle('needs-input', enabled);
  panel?.classList.remove('question-open');
  if (!input) return;
  if (stepId.includes('gallery') || stepId.includes('email')) {
    input.type = 'email';
    input.placeholder = 'Enter email...';
  } else {
    input.type = 'text';
    input.placeholder = stepId === 'greet' ? 'Enter your name...' : 'Type your answer...';
  }
}

function labelForCard(card: HTMLElement): string {
  return (
    card.getAttribute('data-label')
    || card.querySelector('h4')?.textContent
    || card.querySelector('img')?.getAttribute('alt')
    || card.textContent
    || ''
  ).trim();
}

function activeTourCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '.tour-slide.active.cine-side .ss-enc-card, ' +
    '.tour-slide.active.cine-side .ss-glass-card, ' +
    '.tour-slide.active.cine-side .ss-hw-card, ' +
    '.tour-slide.active.cine-side .ss-acc-card, ' +
    '.tour-slide.active.cine-side .ss-extra-card, ' +
    '.tour-slide.active.cine-side .ss-info-bullet',
  ));
}

function roughMatch(label: string, chip: Chip): boolean {
  const a = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = chip.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  if (a.includes('grid') && b.includes('grid')) return true;
  if (a.includes('steam') && b.includes('steam')) return true;
  if (a.includes('towel') && b.includes('towel')) return true;
  if (a.includes('pull') && b.includes('pull')) return true;
  if (a.includes('ladder') && b.includes('ladder')) return true;
  if (a.includes('knob') && b.includes('knob')) return true;
  if (a.includes('chrome') && b.includes('chrome')) return true;
  if (a.includes('nickel') && b.includes('nickel')) return true;
  if (a.includes('black') && b.includes('black')) return true;
  if (a.includes('brass') && b.includes('brass')) return true;
  return false;
}

function shouldUseTourCards(chips: Chip[]): boolean {
  const cards = activeTourCards();
  return cards.length > 0 && cards.some((card) => chips.some((chip) => roughMatch(labelForCard(card), chip)));
}

function wireTourCardsToChips(): void {
  window.setTimeout(() => {
    const cards = activeTourCards();
    cards.forEach((card) => {
      if (card.classList.contains('chat-card-wired')) return;
      card.classList.add('chat-card-wired', 'browse-option');
      const label = labelForCard(card);
      if (label) card.setAttribute('data-label', label);
      card.addEventListener('click', async (ev) => {
        if ((ev.target as HTMLElement).closest('.card-info-btn')) return;
        const clicked = labelForCard(card);
        if (!clicked || !driver) return;
        if (roughMatch(clicked, { label: 'Grid Patterns', action: { kind: 'close' } } as Chip)
          || roughMatch(clicked, { label: 'Steam Upgrade', action: { kind: 'close' } } as Chip)) {
          card.classList.toggle('selected');
        } else {
          card.parentElement?.querySelectorAll('.selected').forEach((el) => {
            if (el !== card) el.classList.remove('selected');
          });
          card.classList.add('selected');
        }
        const handled = await driver.chooseOptionByLabel(clicked);
        if (!handled) card.classList.remove('selected');
      });
    });
  }, 80);
}

function renderProgress(step: number | null, total: number | null): void {
  const wrap = document.getElementById('chat-progress');
  if (!wrap) return;
  if (step == null || total == null) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';
  wrap.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const pip = el('span', { className: 'chat-pip' + (i < step ? ' done' : i === step ? ' active' : '') });
    wrap.appendChild(pip);
  }
}

function clearExtras(): void {
  const extras = document.getElementById('chat-extras');
  if (extras) extras.innerHTML = '';
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function showChatPanel(): void {
  document.getElementById('chat-panel')?.classList.add('visible');
  document.body.classList.add('chat-active');
}

export function hideChatPanel(): void {
  document.getElementById('chat-panel')?.classList.remove('visible');
  document.body.classList.remove('chat-active');
}

export async function startChat(): Promise<void> {
  if (!driver) driver = new ChatDriver();

  // Clear any previous UI
  const msgs = document.getElementById('chat-messages');
  if (msgs) msgs.innerHTML = '';
  const chips = document.getElementById('chat-chips');
  if (chips) chips.innerHTML = '';
  currentChips = [];
  clearExtras();

  driver.setCallbacks({
    onAgentMessage: (text) => {
      appendMessage('agent', text);
    },
    onUserMessage: (text) => {
      appendMessage('user', text);
      clearExtras();
    },
    onChips: (chipsArr) => {
      renderChips(chipsArr);
    },
    onInputMode: (enabled, stepId) => {
      setInputMode(enabled, stepId);
    },
    onProgress: (step, total) => {
      renderProgress(step, total);
    },
    onTypingStart: () => appendMessage('typing', ''),
    onTypingEnd: () => document.querySelectorAll('.chat-msg.typing').forEach((n) => n.remove()),
    onClose: () => hideChatPanel(),
  });

  showChatPanel();
  await driver.start();
}

export function stopChat(): void {
  driver?.stop();
  hideChatPanel();
}

/* ------------------------------------------------------------------ */
/*  Wiring (called once at app init)                                   */
/* ------------------------------------------------------------------ */

export function wireChatPanelEvents(): void {
  const form = document.getElementById('chat-input-form') as HTMLFormElement | null;
  const input = document.getElementById('chat-input') as HTMLInputElement | null;
  const closeBtn = document.getElementById('chat-panel-close');
  const questionBtn = document.getElementById('chat-question-btn');

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !driver) return;
      input.value = '';
      driver.onUserText(text);
      if (!inputRequired) {
        document.getElementById('chat-panel')?.classList.remove('question-open');
      }
    });
  }
  questionBtn?.addEventListener('click', () => {
    const panel = document.getElementById('chat-panel');
    const input = document.getElementById('chat-input') as HTMLInputElement | null;
    panel?.classList.toggle('question-open');
    if (panel?.classList.contains('question-open') && input) {
      input.type = 'text';
      input.placeholder = 'Ask Alex a question...';
      input.focus();
    }
  });
  if (closeBtn) {
    closeBtn.addEventListener('click', () => stopChat());
  }
  const restartBtn = document.getElementById('chat-panel-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (confirm('Start over? Your current conversation will be cleared.')) {
        window.location.reload();
      }
    });
  }
}
