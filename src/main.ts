import './style.css';
import { buildHero, buildNav, buildBackground, buildAgentBar } from './sections/hero';
import { buildShowerContent } from './sections/showers';
import { playLandingAnimation } from './animations/landing';
import { GeminiLiveClient } from './gemini/client';
import { setState } from './utils/state';
import type { AgentState } from './utils/state';

// --- Build DOM ---
const app = document.getElementById('app')!;
const bgEl = buildBackground();
const nav = buildNav();
const hero = buildHero();
const showerContent = buildShowerContent();
const agentBar = buildAgentBar();

app.appendChild(bgEl);
app.appendChild(nav);
app.appendChild(hero);
app.appendChild(showerContent);
app.appendChild(agentBar);

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

// Tip rotation for the agent bar
const TIPS = [
  'Frameless showers can increase home value by 5-7%',
  '\u{1F4AC} Try saying: "I\u2019m interested in frameless showers"',
  'Tempered glass is 4x stronger than regular glass',
  '\u{1F4AC} Try saying: "Yes, show me the options"',
  'Most installations are completed in just one day',
  '\u{1F4AC} Try saying: "I like the clear glass"',
  'Our glass comes with a lifetime warranty',
  '\u{1F4AC} Try saying: "Matte black would look great"',
  'Frameless designs make any bathroom feel larger',
  '\u{1F4AC} Try saying: "Tell me more about that"',
  'We use 3/8\u2033 or 1/2\u2033 tempered safety glass',
  '\u{1F4AC} Try saying: "What do you recommend?"',
  'Custom-cut to fit your exact space',
  '\u{1F4AC} Try saying: "Sure, let\u2019s keep going"',
  'Low-maintenance glass coatings available',
  '\u{1F4AC} Try saying: "That sounds perfect"',
];
let tipIndex = 0;
let tipInterval: ReturnType<typeof setInterval> | null = null;

function startTipRotation(): void {
  const tipEl = document.getElementById('agent-tip');
  if (!tipEl) return;
  tipEl.textContent = TIPS[0];
  tipInterval = setInterval(() => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    tipEl.style.opacity = '0';
    setTimeout(() => {
      tipEl.textContent = TIPS[tipIndex];
      tipEl.style.opacity = '1';
    }, 300);
  }, 6000);
}

function stopTipRotation(): void {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}

gemini.setCallbacks({
  onTranscript: (_type, _text) => {
    // No longer showing raw transcript — tips are shown instead
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
    hideAgentBar();
    stopTipRotation();
  } else {
    showAgentBar();
    startTipRotation();
    try {
      await gemini.connect();
    } catch (err) {
      console.error('Failed to connect:', err);
      hideAgentBar();
      stopTipRotation();
      showError('Could not connect. Please check your microphone permissions and try again.');
    }
  }
});

// Agent bar mic also toggles
const agentMic = document.getElementById('agent-mic');
agentMic?.addEventListener('click', () => {
  if (gemini.isConnected) {
    gemini.disconnect();
    hideAgentBar();
    stopTipRotation();
  }
});

// End session button
const endBtn = document.getElementById('end-session-btn');
endBtn?.addEventListener('click', () => {
  gemini.disconnect();
  hideAgentBar();
  stopTipRotation();
});

// Listen for session kill from tools (e.g. after quote is presented)
window.addEventListener('precision:end-session', () => {
  console.log('[Main] Ending session via custom event');
  gemini.disconnect();
  hideAgentBar();
  stopTipRotation();
});

// --- UI State updates ---
function updateMicState(state: AgentState | 'connecting'): void {
  const micContainer = document.getElementById('mic-container');
  const agentMicEl = document.getElementById('agent-mic');
  const agentAvatarEl = document.getElementById('agent-avatar');
  const navStatus = document.getElementById('nav-status');

  if (micContainer) {
    micContainer.className = `mic-container ${state}`;
    const micLabel = document.getElementById('mic-label');
    if (micLabel) {
      const micLabels: Record<string, string> = {
        connecting: 'Connecting to Alex...',
        listening: 'Listening...',
        speaking: 'Alex is speaking...',
        error: 'Connection error — tap to retry',
        idle: 'Tap to speak with our glass specialist',
      };
      micLabel.textContent = micLabels[state] || '';
    }
  }

  if (agentMicEl) {
    agentMicEl.className = `agent-mic ${state}`;
  }
  if (agentAvatarEl) {
    agentAvatarEl.className = `agent-avatar ${state}`;
  }

  if (navStatus) {
    const statusText = document.getElementById('nav-status-text');
    navStatus.classList.toggle('connecting-pill', state === 'connecting');

    if (state === 'idle') {
      navStatus.classList.remove('visible');
    } else {
      navStatus.classList.add('visible');
      if (statusText) {
        const labels: Record<string, string> = {
          connecting: 'Connecting to Alex...',
          listening: 'Listening...',
          speaking: 'Alex is speaking...',
          error: 'Connection error',
        };
        statusText.textContent = labels[state] || 'AI Assistant Active';
      }
    }
  }
}

function showAgentBar(): void {
  const bar = document.getElementById('agent-bar');
  if (bar) bar.classList.add('visible');
}

function hideAgentBar(): void {
  const bar = document.getElementById('agent-bar');
  if (bar) bar.classList.remove('visible');
}

function showError(msg: string): void {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(220, 50, 50, 0.9); color: white; padding: 14px 28px;
    border-radius: 12px; font-size: 0.95rem; z-index: 9999;
    backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.15);
    font-family: var(--font-body);
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
