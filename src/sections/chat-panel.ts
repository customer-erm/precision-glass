/**
 * Chat panel — bottom-docked overlay that lets users run the same guided
 * tour via text instead of voice. Uses the same tools + slideshow as voice
 * mode. Quick-reply buttons appear under Alex's messages, derived from
 * the current slide id.
 */

import { el } from '../utils/dom';
import { GeminiChatClient } from '../gemini/chat-client';
import { getCurrentSlideId } from '../animations/slideshow';
import { getQuickReplies } from '../gemini/tools';

const SEND_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

let client: GeminiChatClient | null = null;

/* ------------------------------------------------------------------ */
/*  DOM builder                                                        */
/* ------------------------------------------------------------------ */

export function buildChatPanel(): HTMLElement {
  const panel = el('div', { className: 'chat-panel', id: 'chat-panel' });

  // Header
  const header = el('div', { className: 'chat-panel-header' });
  const avatar = el('div', { className: 'chat-panel-avatar' });
  avatar.appendChild(el('img', { src: '/images/avatar.png', alt: 'Alex' }));
  const meta = el('div', { className: 'chat-panel-meta' });
  meta.appendChild(el('div', { className: 'chat-panel-name', textContent: 'Alex' }));
  meta.appendChild(el('div', { className: 'chat-panel-role', textContent: 'Glass Specialist \u2014 Text Chat' }));
  const closeBtn = el('button', {
    className: 'chat-panel-close',
    id: 'chat-panel-close',
    type: 'button',
    innerHTML: '\u2715',
  });
  header.append(avatar, meta, closeBtn);
  panel.appendChild(header);

  // Messages
  const messages = el('div', { className: 'chat-messages', id: 'chat-messages' });
  panel.appendChild(messages);

  // Quick replies
  const quick = el('div', { className: 'chat-quick-replies', id: 'chat-quick-replies' });
  panel.appendChild(quick);

  // Input
  const inputRow = el('form', { className: 'chat-input-row', id: 'chat-input-form' });
  const input = el('input', {
    className: 'chat-input',
    id: 'chat-input',
    type: 'text',
    placeholder: 'Type your message\u2026',
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
/*  Message rendering                                                  */
/* ------------------------------------------------------------------ */

function appendMessage(kind: 'user' | 'agent' | 'typing', text: string): HTMLElement {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return document.createElement('div');

  // Remove any existing typing indicator
  if (kind !== 'typing') {
    msgs.querySelectorAll('.chat-msg.typing').forEach((n) => n.remove());
  }

  const row = el('div', { className: `chat-msg chat-msg-${kind}` });
  if (kind === 'agent' || kind === 'typing') {
    const av = el('div', { className: 'chat-msg-avatar' });
    av.appendChild(el('img', { src: '/images/avatar.png', alt: '' }));
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

function renderQuickReplies(): void {
  const wrap = document.getElementById('chat-quick-replies');
  if (!wrap) return;
  wrap.innerHTML = '';

  const slideId = getCurrentSlideId();
  const options = slideId ? getQuickReplies(slideId) : [];
  if (!options.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';

  options.forEach((label) => {
    const btn = el('button', {
      className: 'chat-quick-btn',
      type: 'button',
      textContent: label,
    });
    btn.addEventListener('click', () => {
      if (!client) return;
      appendMessage('user', label);
      wrap.innerHTML = '';
      client.sendUserMessage(label);
    });
    wrap.appendChild(btn);
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function showChatPanel(): void {
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.add('visible');
}

export function hideChatPanel(): void {
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.remove('visible');
}

export async function startChat(): Promise<void> {
  if (!client) client = new GeminiChatClient();

  // Clear old messages
  const msgs = document.getElementById('chat-messages');
  if (msgs) msgs.innerHTML = '';
  const quick = document.getElementById('chat-quick-replies');
  if (quick) quick.innerHTML = '';

  client.setCallbacks({
    onAgentMessage: (text) => {
      appendMessage('agent', text);
      // Refresh quick replies after each agent message (slide may have changed)
      setTimeout(renderQuickReplies, 200);
    },
    onTypingStart: () => {
      appendMessage('typing', '');
    },
    onTypingEnd: () => {
      document.querySelectorAll('.chat-msg.typing').forEach((n) => n.remove());
    },
    onError: (err) => {
      console.warn('[Chat] error:', err);
      appendMessage('agent', 'Sorry, I hit a snag. Could you try again?');
    },
  });

  showChatPanel();
  await client.start();
}

export function stopChat(): void {
  client?.stop();
  hideChatPanel();
}

/* ------------------------------------------------------------------ */
/*  Event wiring (called once at app init)                             */
/* ------------------------------------------------------------------ */

export function wireChatPanelEvents(): void {
  const form = document.getElementById('chat-input-form') as HTMLFormElement | null;
  const input = document.getElementById('chat-input') as HTMLInputElement | null;
  const closeBtn = document.getElementById('chat-panel-close');

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !client) return;
      appendMessage('user', text);
      input.value = '';
      const quick = document.getElementById('chat-quick-replies');
      if (quick) quick.innerHTML = '';
      client.sendUserMessage(text);
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      stopChat();
    });
  }
}
