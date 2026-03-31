/**
 * Transcript-based trigger system — CLIENT-DRIVEN TOUR.
 *
 * Two layers of triggers fire from the agent's live transcript:
 *
 * 1. SLIDE CUE PHRASES — advance the slideshow when the agent says specific phrases.
 *    The client detects the phrase and calls showSlide() directly — no tool calls needed.
 *
 * 2. HIGHLIGHT KEYWORDS — within a slide, highlight individual products as the agent
 *    names them (same as before, scoped per slide).
 */
import { highlightElement, clearHighlight } from '../animations/tour';
import { showSlide, endSlideshow } from '../animations/slideshow';
import { showBuyersGuide } from '../sections/buyers-guide';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HighlightTrigger {
  keywords: string[];
  action: () => void;
  fired: boolean;
}

type SlideId = 'intro' | 'gallery' | 'enclosures' | 'glass' | 'hardware' | 'accessories' | 'process';

interface SlideCue {
  phrase: string;       // text to detect in transcript
  slideId: SlideId | 'END_TOUR';
  fired: boolean;
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let active = false;
let accumulatedText = '';
let currentSlideId: SlideId | null = null;
let highlightTriggers: HighlightTrigger[] = [];

// Callback to notify client.ts when tour ends
let onTourEnd: (() => void) | null = null;

/* ------------------------------------------------------------------ */
/*  Slide cue phrases — ordered!                                       */
/*  The agent's continuous narration contains these phrases.           */
/*  When detected, we advance to the corresponding slide.             */
/* ------------------------------------------------------------------ */

const SLIDE_CUES: SlideCue[] = [
  { phrase: 'recent installations',   slideId: 'gallery',     fired: false },
  { phrase: 'enclosure styles',       slideId: 'enclosures',  fired: false },
  { phrase: 'nine enclosure',         slideId: 'enclosures',  fired: false },
  { phrase: 'now for glass',          slideId: 'glass',       fired: false },
  { phrase: 'now let\'s talk glass',  slideId: 'glass',       fired: false },
  { phrase: 'hardware personalizes',  slideId: 'hardware',    fired: false },
  { phrase: 'hardware finish',        slideId: 'hardware',    fired: false },
  { phrase: 'finishing touches',      slideId: 'accessories',  fired: false },
  { phrase: 'how it all comes',       slideId: 'process',     fired: false },
  { phrase: 'here\'s how it all',     slideId: 'process',     fired: false },
  { phrase: 'buyer\'s guide',         slideId: 'END_TOUR',    fired: false },
  { phrase: 'buyers guide',           slideId: 'END_TOUR',    fired: false },
];

/* ------------------------------------------------------------------ */
/*  Per-slide highlight triggers                                       */
/* ------------------------------------------------------------------ */

const HIGHLIGHT_TRIGGERS: Record<string, HighlightTrigger[]> = {
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

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function activateTourTriggers(endCallback?: () => void): void {
  active = true;
  accumulatedText = '';
  currentSlideId = null;
  highlightTriggers = [];
  onTourEnd = endCallback || null;
  // Reset all slide cues
  for (const cue of SLIDE_CUES) cue.fired = false;
}

/**
 * Feed transcript text from the agent's speech.
 * Checks for slide cue phrases first, then highlight keywords.
 */
export function feedTranscript(text: string): void {
  if (!active) return;

  accumulatedText += ' ' + text.toLowerCase();

  // --- Layer 1: Slide advancement cues ---
  for (const cue of SLIDE_CUES) {
    if (cue.fired) continue;

    if (accumulatedText.includes(cue.phrase)) {
      cue.fired = true;
      console.log(`[Tour Cue] "${cue.phrase}" → ${cue.slideId}`);

      if (cue.slideId === 'END_TOUR') {
        handleTourEnd();
        return;
      }

      // Advance slide
      advanceToSlide(cue.slideId);
    }
  }

  // --- Layer 2: Per-slide highlight keywords ---
  for (const trigger of highlightTriggers) {
    if (trigger.fired) continue;

    for (const kw of trigger.keywords) {
      if (accumulatedText.includes(kw)) {
        console.log(`[Highlight] "${kw}" → fire`);
        trigger.fired = true;
        trigger.action();
        break;
      }
    }
  }
}

export function deactivateTourTriggers(): void {
  active = false;
  highlightTriggers = [];
  accumulatedText = '';
  currentSlideId = null;
  onTourEnd = null;
  clearHighlight();
}

export function resetTranscriptBuffer(): void {
  accumulatedText = '';
}

/**
 * Manually set trigger slide (called by client.ts after select_service shows intro).
 */
export function setTriggerSlide(slideId: string): void {
  loadHighlightsForSlide(slideId);
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function advanceToSlide(slideId: SlideId): void {
  clearHighlight();
  currentSlideId = slideId;

  // Show the slide visually
  showSlide(slideId);

  // Load that slide's highlight triggers
  loadHighlightsForSlide(slideId);

  // Reset accumulated text for highlight matching (keep full text for cue detection)
  // We don't reset accumulatedText because cues need the full history
}

function loadHighlightsForSlide(slideId: string): void {
  clearHighlight();
  if (slideId in HIGHLIGHT_TRIGGERS) {
    highlightTriggers = HIGHLIGHT_TRIGGERS[slideId].map((t) => ({
      keywords: [...t.keywords],
      action: t.action,
      fired: false,
    }));
    console.log(`[Triggers] Loaded ${highlightTriggers.length} highlight triggers for: ${slideId}`);
  } else {
    highlightTriggers = [];
  }
}

async function handleTourEnd(): Promise<void> {
  console.log('[Tour] Ending tour — buyer\'s guide cue detected');
  active = false;
  highlightTriggers = [];
  clearHighlight();
  await endSlideshow();
  showBuyersGuide('Frameless Shower');
  onTourEnd?.();
}
