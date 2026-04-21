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

  if (kind !== 'typing') {
    msgs.querySelectorAll('.chat-msg.typing').forEach((n) => n.remove());
  }

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
  } else {
    bubble.textContent = text;
  }
  row.appendChild(bubble);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
  return row;
}

function renderChips(chips: Chip[]): void {
  const wrap = document.getElementById('chat-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!chips.length) {
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
}

export function hideChatPanel(): void {
  document.getElementById('chat-panel')?.classList.remove('visible');
}

export async function startChat(): Promise<void> {
  if (!driver) driver = new ChatDriver();

  // Clear any previous UI
  const msgs = document.getElementById('chat-messages');
  if (msgs) msgs.innerHTML = '';
  const chips = document.getElementById('chat-chips');
  if (chips) chips.innerHTML = '';
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

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !driver) return;
      input.value = '';
      driver.onUserText(text);
    });
  }
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
