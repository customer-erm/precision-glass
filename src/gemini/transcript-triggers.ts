/**
 * Transcript-based highlight system.
 * Watches the agent's live transcript and fires highlights
 * when specific keywords are spoken — synced with speech.
 *
 * Triggers are scoped per slide — only the active slide's triggers fire.
 * Slide advancement is now handled by tool calls (interactive tour),
 * so this module only handles highlights.
 */
import { highlightElement, clearHighlight } from '../animations/tour';

interface Trigger {
  keywords: string[];
  action: () => void;
  fired: boolean;
}

type SlideId = 'enclosures' | 'glass' | 'hardware' | 'accessories';

let currentSlideId: SlideId | null = null;
let triggers: Trigger[] = [];
let accumulatedText = '';
let active = false;

/**
 * Per-slide trigger definitions.
 * Keywords match narration so highlights sync with speech.
 */
const SLIDE_TRIGGERS: Record<SlideId, Trigger[]> = {
  enclosures: [
    { keywords: ['single door', 'most popular'], action: () => highlightElement('enc-single'), fired: false },
    { keywords: ['door and panel', 'door-and-panel', 'wider opening'], action: () => highlightElement('enc-door-panel'), fired: false },
    { keywords: ['neo-angle', 'neo angle', 'corner space'], action: () => highlightElement('enc-neo'), fired: false },
    { keywords: ['slider', 'sliding', 'bypass', 'swing clearance'], action: () => highlightElement('enc-slider'), fired: false },
    { keywords: ['curved glass', 'curved,'], action: () => highlightElement('enc-curved'), fired: false },
    { keywords: ['arched'], action: () => highlightElement('enc-arched'), fired: false },
    { keywords: ['splash panel'], action: () => highlightElement('enc-splash'), fired: false },
    { keywords: ['steam shower', 'steam enclosure'], action: () => highlightElement('enc-steam'), fired: false },
    { keywords: ['fully custom', 'custom configuration'], action: () => highlightElement('enc-custom'), fired: false },
  ],
  glass: [
    { keywords: ['clear glass', 'crystal clear', 'bestseller', 'tilework'], action: () => highlightElement('glass-clear'), fired: false },
    { keywords: ['frosted glass', 'frosted', 'acid-etched', 'acid etched', 'privacy'], action: () => highlightElement('glass-frosted'), fired: false },
    { keywords: ['rain glass', 'rain', 'textured pattern', 'rain droplet'], action: () => highlightElement('glass-rain'), fired: false },
  ],
  hardware: [
    { keywords: ['matte black', 'hottest trend', 'bold modern', 'bold, modern'], action: () => highlightElement('hw-black'), fired: false },
    { keywords: ['chrome', 'timeless', 'polished chrome'], action: () => highlightElement('hw-chrome'), fired: false },
    { keywords: ['brushed nickel', 'nickel', 'warm subtle', 'water spots'], action: () => highlightElement('hw-nickel'), fired: false },
    { keywords: ['polished brass', 'classic luxury'], action: () => highlightElement('hw-brass'), fired: false },
    { keywords: ['satin brass', 'golden elegance', 'comeback'], action: () => highlightElement('hw-satin-brass'), fired: false },
  ],
  accessories: [
    { keywords: ['pull handle', 'pull handles', 'most requested'], action: () => highlightElement('acc-pull'), fired: false },
    { keywords: ['towel bar', 'towel', 'through the glass', 'no wall drilling'], action: () => highlightElement('acc-towel'), fired: false },
    { keywords: ['hinge', 'hinges'], action: () => highlightElement('acc-hinge'), fired: false },
    { keywords: ['u-handle', 'u handle', 'u-handles'], action: () => highlightElement('acc-uhandle'), fired: false },
    { keywords: ['knob', 'door knob'], action: () => highlightElement('acc-knob'), fired: false },
    { keywords: ['support bar'], action: () => highlightElement('acc-bar'), fired: false },
  ],
};

export function activateTourTriggers(): void {
  active = true;
  accumulatedText = '';
  currentSlideId = null;
  triggers = [];
}

/**
 * Switch to a new slide's triggers. Resets accumulated text.
 */
export function setTriggerSlide(slideId: string): void {
  clearHighlight();
  accumulatedText = '';

  if (slideId in SLIDE_TRIGGERS) {
    currentSlideId = slideId as SlideId;
    triggers = SLIDE_TRIGGERS[currentSlideId].map((t) => ({
      keywords: [...t.keywords],
      action: t.action,
      fired: false,
    }));
    console.log(`[Triggers] Loaded ${triggers.length} triggers for slide: ${slideId}`);
  } else {
    currentSlideId = null;
    triggers = [];
  }
}

export function feedTranscript(text: string): void {
  if (!active || triggers.length === 0) return;

  accumulatedText += ' ' + text.toLowerCase();

  for (const trigger of triggers) {
    if (trigger.fired) continue;

    for (const kw of trigger.keywords) {
      if (accumulatedText.includes(kw)) {
        console.log(`[Trigger] "${kw}" → highlight`);
        trigger.fired = true;
        trigger.action();
        break;
      }
    }
  }
}

export function deactivateTourTriggers(): void {
  active = false;
  triggers = [];
  accumulatedText = '';
  currentSlideId = null;
  clearHighlight();
}

export function resetTranscriptBuffer(): void {
  accumulatedText = '';
}
