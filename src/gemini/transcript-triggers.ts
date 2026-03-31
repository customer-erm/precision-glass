/**
 * Transcript-based trigger system.
 * Watches the agent's live transcript and fires highlights/scrolls
 * when specific keywords are spoken — perfectly synced with speech.
 */
import { scrollToSection, highlightElement } from '../animations/tour';

interface Trigger {
  /** Keywords to match (lowercase). ANY match fires the trigger. */
  keywords: string[];
  /** Action to perform */
  action: () => void;
  /** Has this trigger already fired? */
  fired: boolean;
}

let triggers: Trigger[] = [];
let accumulatedText = '';
let active = false;

/**
 * Load the full set of tour triggers.
 * Call this when the tour starts (after select_service).
 */
export function activateTourTriggers(): void {
  accumulatedText = '';
  active = true;

  triggers = [
    // --- Section scrolls are handled by tool calls ---
    // --- Highlights are triggered by transcript keywords ---

    // Enclosure highlights
    {
      keywords: ['single door', 'most popular style', 'minimal hardware'],
      action: () => highlightElement('enc-single'),
      fired: false,
    },
    {
      keywords: ['door-and-panel', 'door and panel', 'classic configuration', 'wider openings'],
      action: () => highlightElement('enc-door-panel'),
      fired: false,
    },
    {
      keywords: ['neo-angle', 'neo angle', 'corner spaces', 'compact bathrooms'],
      action: () => highlightElement('enc-neo'),
      fired: false,
    },
    {
      keywords: ['sliding door', 'slider', 'swing clearance', 'bypass operation'],
      action: () => highlightElement('enc-slider'),
      fired: false,
    },

    // Glass highlights
    {
      keywords: ['clear glass', 'bestseller', 'tilework', 'shows off'],
      action: () => highlightElement('glass-clear'),
      fired: false,
    },
    {
      keywords: ['frosted glass', 'frosted', 'spa-like privacy', 'spa like'],
      action: () => highlightElement('glass-frosted'),
      fired: false,
    },
    {
      keywords: ['rain glass', 'rain', 'textured pattern', 'diffuses light'],
      action: () => highlightElement('glass-rain'),
      fired: false,
    },

    // Hardware highlights
    {
      keywords: ['matte black', 'hottest trend', 'bold, modern'],
      action: () => highlightElement('hw-black'),
      fired: false,
    },
    {
      keywords: ['chrome', 'timeless choice', 'always looks polished'],
      action: () => highlightElement('hw-chrome'),
      fired: false,
    },
    {
      keywords: ['brushed nickel', 'nickel', 'warm neutral'],
      action: () => highlightElement('hw-nickel'),
      fired: false,
    },

    // Accessory highlights
    {
      keywords: ['pull handle', 'most requested accessory'],
      action: () => highlightElement('acc-pull'),
      fired: false,
    },
    {
      keywords: ['towel bar', 'towel', 'mounts directly to the glass'],
      action: () => highlightElement('acc-towel'),
      fired: false,
    },
  ];
}

/**
 * Feed transcript text into the trigger system.
 * Call this every time outputTranscription arrives.
 */
export function feedTranscript(text: string): void {
  if (!active) return;

  accumulatedText += ' ' + text.toLowerCase();

  // Check each unfired trigger
  for (const trigger of triggers) {
    if (trigger.fired) continue;

    for (const kw of trigger.keywords) {
      if (accumulatedText.includes(kw)) {
        console.log(`[Trigger] Matched "${kw}" → firing highlight`);
        trigger.fired = true;
        trigger.action();
        break;
      }
    }
  }
}

/**
 * Deactivate triggers (after tour ends).
 */
export function deactivateTourTriggers(): void {
  active = false;
  triggers = [];
  accumulatedText = '';
}

/**
 * Reset accumulated text (call between sections to prevent false matches).
 */
export function resetTranscriptBuffer(): void {
  accumulatedText = '';
}
