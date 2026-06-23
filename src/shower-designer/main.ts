import '../style.css';
import './shower-designer.css';
import { buildAgentBar, buildBackground, buildHero } from '../sections/hero';
import { buildChatPanel, startChat, stopChat, wireChatPanelEvents } from '../sections/chat-panel';
import { buildPhotoPrompt, wirePhotoPrompt } from '../sections/photo-prompt';
import { buildContentModal } from '../sections/content-modal';
import { startBrowseTour } from '../animations/manual-nav';
import { GeminiLiveClient } from '../gemini/client';
import { loadUser, registerVisit, saveUser } from '../utils/user-storage';
import { setState, getState, type AgentState, type InteractionMode } from '../utils/state';
import { images } from '../data/image-map';

registerVisit();
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
document.body.classList.add('shower-designer-page');

const app = document.getElementById('app')!;
const bg = buildBackground();
const hero = buildDesignerHero();
const agentBar = buildAgentBar();
const chatPanel = buildChatPanel();
const photoPrompt = buildPhotoPrompt();
const contentModal = buildContentModal();
let gemini: GeminiLiveClient | null = null;

app.append(bg, hero, agentBar, chatPanel, photoPrompt, contentModal);
wireChatPanelEvents();
wirePhotoPrompt();

function buildDesignerHero(): HTMLElement {
  // The embed always starts fresh — no welcome-back / last-design UI.
  const section = buildHero({ forgetReturning: true });
  useShowerOnlyHeroImages(section);
  const title = section.querySelector('.hero-title');
  if (title) title.innerHTML = 'Design <span class="accent">Your Shower</span>';

  const prompt = section.querySelector('.mode-prompt');
  if (prompt) prompt.textContent = 'Choose your design path';

  const caption = section.querySelector('.mode-caption-incentive');
  if (caption) caption.innerHTML = 'Talk, chat, or browse through the same shower designer';

  return section;
}

function useShowerOnlyHeroImages(section: HTMLElement): void {
  const bg = section.querySelector('.hero-bg-image');
  if (!bg) return;
  bg.innerHTML = '';
  const showerImages = [images.showers.hero, ...images.showers.gallery];
  showerImages.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = i < 2 ? 'eager' : 'lazy';
    if (i === 0) img.classList.add('kb-active');
    bg.appendChild(img);
  });
}

async function enterVoiceDesigner(): Promise<void> {
  setState({ currentMode: 'voice', currentService: 'showers' });
  saveUser({ preferredMode: 'voice', lastQuote: { service: 'showers' } });
  // On the home screen, Alex's avatar takes the place of the big mic icon
  // while she talks. The bottom agent bar only slides in once the page
  // transforms into the tour (see the precision:transform listener below).
  showHomeAvatar();
  try {
    gemini = new GeminiLiveClient({ showerDesigner: true });
    gemini.setCallbacks({
      onStateChange: (state) => updateMicState(state),
    });
    await gemini.connect();
  } catch (err) {
    console.error('[ShowerDesigner] Voice connect failed:', err);
    hideAgentBar();
    showDesignerToast('Voice could not connect. You can choose chat or browse instead.');
  }
}

async function enterChatDesigner(): Promise<void> {
  setState({ currentMode: 'chat', currentService: 'showers' });
  saveUser({ preferredMode: 'chat', lastQuote: { service: 'showers' } });
  await startChat({ showerDesigner: true });
}

async function enterBrowseDesigner(): Promise<void> {
  setState({ currentMode: 'browse', currentService: 'showers' });
  saveUser({ preferredMode: 'browse', lastQuote: { service: 'showers' } });
  await startBrowseTour('showers');
}

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const card = target.closest('[data-mode]') as HTMLElement | null;
  if (!card) return;

  const mode = card.getAttribute('data-mode') as InteractionMode;
  if (mode === 'voice') await enterVoiceDesigner();
  else if (mode === 'chat') await enterChatDesigner();
  else if (mode === 'browse') await enterBrowseDesigner();
});

/** Swap the big home-screen mic icon for Alex's avatar once voice starts. */
function getVoiceCore(): HTMLElement | null {
  return document.querySelector('.mode-option-voice .mode-voice-core');
}

function showHomeAvatar(): void {
  const core = getVoiceCore();
  if (!core) return;
  core.classList.add('mode-voice-core-avatar');
  core.innerHTML = '<img src="/images/avatar.jpg" alt="Alex">';
}

function showAgentBar(): void {
  const bar = document.getElementById('agent-bar');
  if (bar) bar.classList.add('visible');
}

// Once the page transforms into the tour, move Alex to the bottom-left
// agent bar. (The home hero — with the avatar-in-mic — is hidden by the
// transform animation itself.)
window.addEventListener('precision:transform', () => {
  if (getState().currentMode === 'voice') showAgentBar();
});

function hideAgentBar(): void {
  const bar = document.getElementById('agent-bar');
  if (bar) bar.classList.remove('visible');
}

function updateMicState(state: AgentState | 'connecting'): void {
  const agentMicEl = document.getElementById('agent-mic');
  const agentAvatarEl = document.getElementById('agent-avatar');
  if (agentMicEl) agentMicEl.className = `agent-mic ${state}`;
  if (agentAvatarEl) agentAvatarEl.className = `agent-avatar ${state}`;
  // Mirror the speaking/listening state onto the home-screen avatar-in-mic.
  const core = getVoiceCore();
  if (core) {
    core.classList.remove('connecting', 'listening', 'speaking', 'idle');
    if (state) core.classList.add(state);
  }
}

function showDesignerToast(text: string): void {
  const toast = document.createElement('div');
  toast.className = 'designer-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 7000);
}

window.addEventListener('precision:end-session-soft', () => {
  gemini?.muteMic();
  hideAgentBar();
});

window.addEventListener('precision:mic-pause', () => {
  gemini?.muteMic();
});

window.addEventListener('precision:mic-resume', () => {
  gemini?.resumeMic();
});

window.addEventListener('precision:end-session', () => {
  gemini?.disconnect({ keepAudioQueue: true });
  hideAgentBar();
  stopChat();
});

function resetDesignerHome(): void {
  gemini?.disconnect();
  hideAgentBar();
  stopChat();
  window.location.assign('/shower-designer/');
}

document.getElementById('agent-mic')?.addEventListener('click', () => {
  if (gemini?.isConnected) {
    gemini.disconnect();
    hideAgentBar();
  }
});

document.getElementById('end-session-btn')?.addEventListener('click', resetDesignerHome);

const user = loadUser();
if (user?.lastQuote?.service !== 'showers') {
  saveUser({ lastQuote: { service: 'showers' } });
}
