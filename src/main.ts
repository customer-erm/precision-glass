import './style.css';
import { buildHero, buildNav, buildBackground, buildAgentBar } from './sections/hero';
import { buildShowerContent } from './sections/showers';
import { buildRailingsContent, buildCommercialContent } from './sections/browse-extra';
import { buildChatPanel, startChat, stopChat, wireChatPanelEvents } from './sections/chat-panel';
import { buildBrowseDrawer, openBrowseDrawer, wireBrowseDrawer, closeBrowseDrawer } from './sections/browse-drawer';
import { buildHelpLauncher } from './sections/help-launcher';
import { buildContactModal, openContactModal, wireContactModal } from './sections/contact-modal';
import { buildPhotoPrompt, wirePhotoPrompt } from './sections/photo-prompt';
import { buildContentModal, closeContentModal } from './sections/content-modal';
import { buildFooter } from './sections/footer';
import { buildAboutSection } from './sections/about';
import { playLandingAnimation } from './animations/landing';
import type { GeminiLiveClient } from './gemini/client';
import { setState } from './utils/state';
import type { AgentState, InteractionMode } from './utils/state';
import { loadUser, registerVisit, saveUser } from './utils/user-storage';
import { startBrowseTour } from './animations/manual-nav';

// --- Register visit count on page load ---
registerVisit();

// --- Build DOM ---
const app = document.getElementById('app')!;
const bgEl = buildBackground();
const nav = buildNav();
const hero = buildHero();
const showerContent = buildShowerContent();
const railingsContent = buildRailingsContent();
const commercialContent = buildCommercialContent();
const agentBar = buildAgentBar();
const chatPanel = buildChatPanel();
const browseDrawer = buildBrowseDrawer();
const helpLauncher = buildHelpLauncher();
const contactModal = buildContactModal();
const photoPrompt = buildPhotoPrompt();
const contentModal = buildContentModal();
const footer = buildFooter();
const aboutSection = buildAboutSection();

app.appendChild(bgEl);
app.appendChild(nav);
app.appendChild(hero);
app.appendChild(aboutSection);
app.appendChild(showerContent);
app.appendChild(railingsContent);
app.appendChild(commercialContent);
app.appendChild(footer);
app.appendChild(agentBar);
app.appendChild(chatPanel);
app.appendChild(browseDrawer);
app.appendChild(helpLauncher);
app.appendChild(contactModal);
app.appendChild(photoPrompt);
app.appendChild(contentModal);

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

// --- Gemini Voice Client (lazy) ---
// The @google/genai SDK is only needed for the live voice session, so we
// dynamic-import it on first use. Chat and browse visitors never pay for it.
let gemini: GeminiLiveClient | null = null;
async function getGemini(): Promise<GeminiLiveClient> {
  if (!gemini) {
    const { GeminiLiveClient } = await import('./gemini/client');
    gemini = new GeminiLiveClient();
    gemini.setCallbacks({
      onTranscript: () => {
        // Tips are shown instead of raw transcript
      },
      onStateChange: (state) => updateMicState(state),
    });
  }
  return gemini;
}

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

/* ------------------------------------------------------------------ */
/*  Mode picker: route clicks to voice / chat / browse                 */
/* ------------------------------------------------------------------ */

async function enterVoiceMode(): Promise<void> {
  setState({ currentMode: 'voice' });
  saveUser({ preferredMode: 'voice' });
  showAgentBar();
  startTipRotation();
  try {
    const g = await getGemini();
    await g.connect();
  } catch (err) {
    console.error('Failed to connect:', err);
    hideAgentBar();
    stopTipRotation();
    showError('Could not connect. Please check your microphone permissions and try again.');
  }
}

async function enterChatMode(): Promise<void> {
  setState({ currentMode: 'chat' });
  saveUser({ preferredMode: 'chat' });
  await startChat();
}

function enterBrowseMode(): void {
  setState({ currentMode: 'browse' });
  saveUser({ preferredMode: 'browse' });
  openBrowseDrawer('showers');
}

// Click handler on mode-picker-grid (event delegation)
document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;

  // Mode picker cards / inline mode links
  const card = target.closest('[data-mode]') as HTMLElement | null;
  if (card) {
    const mode = card.getAttribute('data-mode') as InteractionMode;
    if (mode === 'voice') await enterVoiceMode();
    else if (mode === 'chat') await enterChatMode();
    else if (mode === 'browse') enterBrowseMode();
    return;
  }

  // Top-right nav CTA
  if (target.closest('#nav-cta-btn')) {
    openContactModal();
    return;
  }

  // Nav/Footer service link → open browse drawer for that service
  const navSvc = target.closest('[data-nav-service]') as HTMLElement | null;
  if (navSvc) {
    const service = navSvc.getAttribute('data-nav-service') as 'showers' | 'railings' | 'commercial' | null;
    if (service) {
      setState({ currentMode: 'browse' });
      saveUser({ preferredMode: 'browse' });
      const { openBrowseDrawer } = await import('./sections/browse-drawer');
      openBrowseDrawer(service);
    }
    return;
  }

  // Footer "Request a Quote" link → open contact modal
  if (target.closest('#footer-quote-link')) {
    openContactModal();
    return;
  }

  // Nav "About Us" link → smooth scroll to about section
  if (target.closest('[data-scroll-about]')) {
    document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // About section CTAs → open contact modal
  if (target.closest('[data-about-cta="contact"]')) {
    openContactModal();
    return;
  }

  // Floating help menu actions (voice / chat / quote)
  const helpAction = target.closest('[data-help-action]') as HTMLElement | null;
  if (helpAction) {
    const action = helpAction.getAttribute('data-help-action');
    document.getElementById('help-menu')?.classList.remove('visible');
    if (action === 'voice') await enterVoiceMode();
    else if (action === 'chat') await enterChatMode();
    else if (action === 'quote') openContactModal();
    return;
  }

  // Content modal CTA actions (agent's show_topic modal)
  const contentAction = target.closest('[data-content-action]') as HTMLElement | null;
  if (contentAction) {
    const action = contentAction.getAttribute('data-content-action');
    closeContentModal();
    if (action === 'open_contact') openContactModal();
    else if (action === 'launch_voice') await enterVoiceMode();
    else if (action === 'launch_chat') await enterChatMode();
    return;
  }

  // "Configure Yours" CTAs inside browse content
  const cta = target.closest('.configure-cta') as HTMLElement | null;
  if (cta) {
    const service = cta.getAttribute('data-service') as 'showers' | 'railings' | 'commercial' | null;
    if (service) {
      setState({ currentMode: 'browse' });
      saveUser({ preferredMode: 'browse' });
      await startBrowseTour(service);
    }
    return;
  }

  // Service cards in hero (also launch browse mode for that service)
  const svcCard = target.closest('.service-card') as HTMLElement | null;
  if (svcCard) {
    const service = svcCard.getAttribute('data-service') as 'showers' | 'railings' | 'commercial' | null;
    const sectionId = service ? `service-${service}` : null;
    if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
});

// Wire browse drawer + contact modal event handlers
wireBrowseDrawer();
wireContactModal();
wirePhotoPrompt();

// Agent bar mic toggles voice session
const agentMic = document.getElementById('agent-mic');
agentMic?.addEventListener('click', () => {
  if (gemini && gemini.isConnected) {
    gemini.disconnect();
    hideAgentBar();
    stopTipRotation();
  }
});

// End session button
const endBtn = document.getElementById('end-session-btn');
endBtn?.addEventListener('click', () => {
  gemini?.disconnect();
  hideAgentBar();
  stopTipRotation();
});

// Wire chat panel inputs (form submit, close button)
wireChatPanelEvents();

// Listen for voice-session custom events (fired by tools.ts)
window.addEventListener('precision:end-session-soft', () => {
  console.log('[Main] Soft-ending: muting mic, hiding agent bar, audio keeps playing');
  gemini?.muteMic();
  hideAgentBar();
  stopTipRotation();
});

// While the photo-upload card is open we stop streaming mic audio (the
// customer may step away to take a photo — no point burning API tokens).
window.addEventListener('precision:mic-pause', () => {
  gemini?.muteMic();
});
window.addEventListener('precision:mic-resume', () => {
  gemini?.resumeMic();
});

window.addEventListener('precision:end-session', () => {
  console.log('[Main] Ending session via custom event');
  gemini?.disconnect({ keepAudioQueue: true });
  hideAgentBar();
  stopTipRotation();
  // Also close chat panel if it's open (tools.ts dispatches this for chat sessions too)
  stopChat();
});

/* ------------------------------------------------------------------ */
/*  UI State updates                                                   */
/* ------------------------------------------------------------------ */

function updateMicState(state: AgentState | 'connecting'): void {
  const agentMicEl = document.getElementById('agent-mic');
  const agentAvatarEl = document.getElementById('agent-avatar');
  const navStatus = document.getElementById('nav-status');

  if (agentMicEl) agentMicEl.className = `agent-mic ${state}`;
  if (agentAvatarEl) agentAvatarEl.className = `agent-avatar ${state}`;

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

// Log what we know about the user (helpful for dev)
const existingUser = loadUser();
if (existingUser) {
  console.log('[Main] Returning user:', existingUser);
}
