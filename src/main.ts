import './style.css';
import { buildHero, buildNav, buildBackground, buildTranscriptBar } from './sections/hero';
import { buildShowerContent } from './sections/showers';
import { buildBuyersGuide } from './sections/buyers-guide';
import { buildQuoteOverlay } from './sections/quote';
import { playLandingAnimation } from './animations/landing';
import { GeminiLiveClient } from './gemini/client';
import { setState, subscribe } from './utils/state';
import type { AgentState } from './utils/state';

// --- Build DOM ---
const app = document.getElementById('app')!;
const bgEl = buildBackground();
const nav = buildNav();
const hero = buildHero();
const showerContent = buildShowerContent();
const buyersGuide = buildBuyersGuide();
const quoteOverlay = buildQuoteOverlay();
const transcriptBar = buildTranscriptBar();

app.appendChild(bgEl);
app.appendChild(nav);
app.appendChild(hero);
app.appendChild(showerContent);
app.appendChild(buyersGuide);
app.appendChild(quoteOverlay);
app.appendChild(transcriptBar);

// --- Landing animation ---
requestAnimationFrame(() => {
  playLandingAnimation();
});

// --- Nav scroll behavior ---
window.addEventListener('scroll', () => {
  const navEl = document.getElementById('nav');
  if (navEl) {
    navEl.classList.toggle('scrolled', window.scrollY > 50);
  }
});

// --- Gemini Client ---
const gemini = new GeminiLiveClient();

// Track transcript text
let lastUserText = '';
let lastAgentText = '';

gemini.setCallbacks({
  onTranscript: (type, text) => {
    const transcriptEl = document.getElementById('transcript-text');
    if (!transcriptEl) return;

    if (type === 'user') {
      lastUserText = text;
      transcriptEl.innerHTML = `<span class="user-text">${escapeHtml(text)}</span>`;
    } else {
      lastAgentText = text;
      transcriptEl.innerHTML = `<span class="agent-text">${escapeHtml(text)}</span>`;
    }
  },
  onStateChange: (state) => {
    updateMicState(state);
  },
});

// --- Mic button click ---
const micBtn = document.getElementById('mic-btn');
micBtn?.addEventListener('click', async () => {
  if (gemini.isConnected) {
    gemini.disconnect();
    hideTranscriptBar();
  } else {
    showTranscriptBar();
    try {
      await gemini.connect();
    } catch (err) {
      console.error('Failed to connect:', err);
      hideTranscriptBar();
      showError('Could not connect. Please check your microphone permissions and try again.');
    }
  }
});

// Transcript bar mic indicator also toggles
const transcriptMic = document.getElementById('transcript-mic');
transcriptMic?.addEventListener('click', () => {
  if (gemini.isConnected) {
    gemini.disconnect();
    hideTranscriptBar();
  }
});

// End session button
const endBtn = document.getElementById('end-session-btn');
endBtn?.addEventListener('click', () => {
  gemini.disconnect();
  hideTranscriptBar();
});

// --- UI State updates ---
function updateMicState(state: AgentState | 'connecting'): void {
  const micContainer = document.getElementById('mic-container');
  const transcriptMicEl = document.getElementById('transcript-mic');
  const navStatus = document.getElementById('nav-status');

  if (micContainer) {
    micContainer.className = `mic-container ${state}`;
    const micLabel = document.getElementById('mic-label');
    if (micLabel) {
      const micLabels: Record<string, string> = {
        connecting: 'Connecting to Agent...',
        listening: 'Listening...',
        speaking: 'Alex is speaking...',
        error: 'Connection error — tap to retry',
        idle: 'Tap to speak with our glass specialist',
      };
      micLabel.textContent = micLabels[state] || '';
    }
  }

  if (transcriptMicEl) {
    transcriptMicEl.className = `transcript-mic-indicator ${state}`;
  }

  if (navStatus) {
    const statusText = document.getElementById('nav-status-text');
    // Green neon pill for connecting state
    navStatus.classList.toggle('connecting-pill', state === 'connecting');

    if (state === 'idle') {
      navStatus.classList.remove('visible');
    } else {
      navStatus.classList.add('visible');
      if (statusText) {
        const labels: Record<string, string> = {
          connecting: 'Connecting to Agent...',
          listening: 'Listening...',
          speaking: 'Alex is speaking...',
          error: 'Connection error',
        };
        statusText.textContent = labels[state] || 'AI Assistant Active';
      }
    }
  }
}

function showTranscriptBar(): void {
  const bar = document.getElementById('transcript-bar');
  if (bar) bar.classList.add('visible');
}

function hideTranscriptBar(): void {
  const bar = document.getElementById('transcript-bar');
  if (bar) bar.classList.remove('visible');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(msg: string): void {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(220, 50, 50, 0.9); color: white; padding: 14px 28px;
    border-radius: 12px; font-size: 0.95rem; z-index: 9999;
    backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.15);
    animation: fadeInDown 0.3s ease-out;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
