/**
 * Deterministic chat driver.
 *
 * Instead of relying on the text LLM to correctly drive function calls across
 * every turn (which was flaky with long system prompts), the chat client owns
 * the conversation state machine. Each "chat step" maps to a slideshow slide
 * and has:
 *   - the agent line shown in the chat
 *   - labeled option chips the user can tap
 *   - an advance handler that calls the right tool and moves to the next step
 *
 * Free-text input is still supported: if the user types something that doesn't
 * match a chip label, we ask a small LLM for a brief helpful reply (no tool
 * calls) while keeping the flow anchored on the current step.
 */

import { handleToolCall } from './tools';
import { loadUser, saveUser } from '../utils/user-storage';
import { generateShowerImage } from './image-gen';
import { saveCustomerGeneration } from '../utils/save-generation';
import { setBathroomPhoto, readFileAsDataUrl, getBathroomPhoto } from '../utils/bathroom-photo';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const OFFFLOW_MODEL = 'gemini-2.5-flash';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChipAction =
  | { kind: 'set-name' }
  | { kind: 'select-service'; service: 'showers' | 'railings' | 'commercial' }
  | { kind: 'advance'; next: string; choiceCategory?: string; choice?: string }
  | { kind: 'save-email-and-advance'; next: string }
  | { kind: 'submit-quote' }
  | { kind: 'close' };

export interface Chip {
  label: string;
  /** Optional hint text rendered below the label on bigger chips */
  hint?: string;
  /** If set, chip acts as a primary CTA */
  primary?: boolean;
  /** What happens when tapped */
  action: ChipAction;
}

export interface ChatStep {
  id: string;
  agent: string | ((ctx: ChatContext) => string);
  chips?: Chip[] | ((ctx: ChatContext) => Chip[]);
  /** If true, the user must type a free-text answer (no chips) */
  requiresTextInput?: boolean;
  /** On text input of this step, what to do with the text */
  onText?: (text: string, ctx: ChatContext) => Promise<void> | void;
  /** Called when the step is entered (e.g. to inject a form) */
  onEnter?: (ctx: ChatContext) => void;
  /** Progress step number (1-indexed) — shown in the pip bar */
  progressStep?: number;
  /** Total progress length for the pip bar. */
  progressTotal?: number;
}

interface ChatContext {
  choices: Record<string, string>;
  goToStep: (id: string) => Promise<void>;
  addAgent: (text: string) => void;
  addUser: (text: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Script                                                             */
/* ------------------------------------------------------------------ */

const GREETING = (name?: string): string =>
  name
    ? `Welcome back, ${name}! \u{1F44B} I\u2019m Alex — great to see you again. What would you like to explore today?`
    : `Hey there! \u{1F44B} I\u2019m Alex, your glass specialist at Precision Glass. I\u2019m here to walk you through anything you\u2019re curious about. Before we dive in — what should I call you?`;

function buildSteps(): Record<string, ChatStep> {
  return {
    /* ---------------- Intro ---------------- */
    greet: {
      id: 'greet',
      agent: (ctx) => GREETING(ctx.choices.name),
      requiresTextInput: true,
      onText: async (text, ctx) => {
        // If returning user already has a name, skip straight to service
        if (ctx.choices.name) {
          await ctx.goToStep('service');
          return;
        }
        const cleaned = text.trim().split(/\s+/).slice(0, 3).join(' ');
        ctx.choices.name = cleaned;
        saveUser({ name: cleaned });
        ctx.addAgent(`Nice to meet you, ${cleaned.split(' ')[0]}! How can I help today?`);
        setTimeout(() => ctx.goToStep('service'), 300);
      },
    },

    service: {
      id: 'service',
      agent: (ctx) =>
        ctx.choices.name
          ? `${ctx.choices.name.split(' ')[0]}, which area are you thinking about?`
          : `Which area are you thinking about?`,
      chips: [
        { label: 'Frameless Showers', hint: 'Custom enclosures', primary: true, action: { kind: 'select-service', service: 'showers' } },
        { label: 'Glass Railings', hint: 'Balconies, stairs, pool decks', action: { kind: 'select-service', service: 'railings' } },
        { label: 'Commercial Glass', hint: 'Storefronts & more', action: { kind: 'select-service', service: 'commercial' } },
      ],
    },

    /* ---------------- Shower flow ---------------- */
    'showers-intro': {
      id: 'showers-intro',
      progressStep: 1,
      progressTotal: 9,
      agent: 'Frameless showers transform a bathroom — no bulky frames, no collecting grime, just clean precision glass that makes the space feel bigger and adds real home value. Want me to walk you through the options?',
      chips: [
        { label: 'Yes, let\u2019s go', primary: true, action: { kind: 'advance', next: 'showers-upload' } },
        { label: 'Tell me more first', action: { kind: 'advance', next: 'showers-intro-more' } },
      ],
    },
    'showers-upload': {
      id: 'showers-upload',
      progressStep: 2,
      progressTotal: 9,
      agent: 'Quick bonus: if you upload a photo of your current bathroom, I can tailor my suggestions to your actual layout \u2014 and at the end your free AI rendering will show the new shower *installed in your real space*. Totally optional, your call.',
      onEnter: () => injectPhotoUploadUI(),
      chips: () =>
        getBathroomPhoto()
          ? [
              { label: 'Continue with this photo', primary: true, action: { kind: 'advance', next: 'showers-gallery' } },
              { label: 'Skip and use a stock bathroom', action: { kind: 'advance', next: 'showers-gallery' } },
            ]
          : [
              { label: 'Skip \u2014 use a stock bathroom', action: { kind: 'advance', next: 'showers-gallery' } },
            ],
    },
    'showers-intro-more': {
      id: 'showers-intro-more',
      progressStep: 1,
      progressTotal: 9,
      agent: 'Sure — frameless means the glass panels stand on their own with only small discrete hardware. It\u2019s custom-cut to your exact space, uses 3/8" or 1/2" tempered safety glass, and comes with a lifetime workmanship warranty. Most installs are done in a single day. Ready?',
      chips: [
        { label: 'Ready, walk me through', primary: true, action: { kind: 'advance', next: 'showers-upload' } },
      ],
    },
    'showers-gallery': {
      id: 'showers-gallery',
      progressStep: 3,
      progressTotal: 9,
      agent:
        'Here are some of our recent installs on the main screen — modern, spa-like, every one custom. Heads up: at the end of this walkthrough I\u2019ll generate a **free AI photorealistic rendering** of your custom shower — a unique preview you get to keep. \u2728\n\nBefore we continue, I\u2019d love to send you our Frameless Shower Buyer\u2019s Guide — what\u2019s your email?',
      requiresTextInput: true,
      chips: (ctx) =>
        ctx.choices.email
          ? [{ label: 'Use ' + ctx.choices.email, primary: true, action: { kind: 'save-email-and-advance', next: 'showers-enclosure' } }, { label: 'Skip for now', action: { kind: 'advance', next: 'showers-enclosure' } }]
          : [{ label: 'Skip for now', action: { kind: 'advance', next: 'showers-enclosure' } }],
      onText: async (text, ctx) => {
        const email = text.trim();
        if (/\S+@\S+\.\S+/.test(email)) {
          ctx.choices.email = email;
          saveUser({ email });
          ctx.addAgent('Got it — I\u2019ll send that over! Now let\u2019s pick an enclosure type.');
          setTimeout(() => ctx.goToStep('showers-enclosure'), 400);
        } else {
          ctx.addAgent('That didn\u2019t look like an email — want to skip for now?');
        }
      },
    },
    'showers-enclosure': {
      id: 'showers-enclosure',
      progressStep: 4,
      progressTotal: 9,
      agent: 'Great. There are 9 enclosure types on screen. Which style fits your space best?',
      chips: [
        { label: 'Single Door', hint: 'Clean, minimal', primary: true, action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Single Door' } },
        { label: 'Door + Panel', hint: 'Wider openings', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Door + Panel' } },
        { label: 'Neo-Angle', hint: 'Corner', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Neo-Angle' } },
        { label: '90° Corner', hint: 'Two panels', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: '90° Corner' } },
        { label: 'Frameless Slider', hint: 'No swing', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Frameless Slider' } },
        { label: 'Curved', hint: 'Spa feel', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Curved' } },
        { label: 'Arched', hint: 'Statement', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Arched' } },
        { label: 'Splash Panel', hint: 'Walk-in', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Splash Panel' } },
        { label: 'Steam Shower', hint: 'Spa upgrade', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Steam Shower' } },
        { label: 'Custom', hint: 'Bespoke', action: { kind: 'advance', next: 'showers-glass', choiceCategory: 'enclosure', choice: 'Custom' } },
      ],
    },
    'showers-glass': {
      id: 'showers-glass',
      progressStep: 5,
      progressTotal: 9,
      agent: (ctx) => `Perfect — ${ctx.choices.enclosure}. Now the glass: clear shows off your tile, frosted is acid-etched for privacy, rain has a water-droplet texture. Which draws you in?`,
      chips: [
        { label: 'Clear', hint: 'Bestseller', primary: true, action: { kind: 'advance', next: 'showers-hardware', choiceCategory: 'glass', choice: 'Clear Glass' } },
        { label: 'Frosted', hint: 'Privacy', action: { kind: 'advance', next: 'showers-hardware', choiceCategory: 'glass', choice: 'Frosted Glass' } },
        { label: 'Rain', hint: 'Artistic', action: { kind: 'advance', next: 'showers-hardware', choiceCategory: 'glass', choice: 'Rain Glass' } },
      ],
    },
    'showers-hardware': {
      id: 'showers-hardware',
      progressStep: 6,
      progressTotal: 9,
      agent: 'Five hardware finishes to pick from. What would complement your bathroom?',
      chips: [
        { label: 'Polished Chrome', hint: 'Most popular', primary: true, action: { kind: 'advance', next: 'showers-handle', choiceCategory: 'hardware', choice: 'Polished Chrome' } },
        { label: 'Brushed Nickel', hint: 'Hides spots', action: { kind: 'advance', next: 'showers-handle', choiceCategory: 'hardware', choice: 'Brushed Nickel' } },
        { label: 'Matte Black', hint: 'Modern', action: { kind: 'advance', next: 'showers-handle', choiceCategory: 'hardware', choice: 'Matte Black' } },
        { label: 'Polished Brass', hint: 'Luxury', action: { kind: 'advance', next: 'showers-handle', choiceCategory: 'hardware', choice: 'Polished Brass' } },
        { label: 'Satin Brass', hint: 'On-trend', action: { kind: 'advance', next: 'showers-handle', choiceCategory: 'hardware', choice: 'Satin Brass' } },
      ],
    },
    'showers-handle': {
      id: 'showers-handle',
      progressStep: 7,
      progressTotal: 9,
      agent: (ctx) =>
        ctx.choices.enclosure?.toLowerCase().includes('splash')
          ? 'Your splash panel is a walk-in, so no handle needed! Any extras?'
          : 'Nice. Hinges come standard — which handle style do you like?',
      chips: (ctx) =>
        ctx.choices.enclosure?.toLowerCase().includes('splash')
          ? [{ label: 'Continue', primary: true, action: { kind: 'advance', next: 'showers-extras' } }]
          : [
              { label: 'Pull Handle', hint: 'Most popular', primary: true, action: { kind: 'advance', next: 'showers-extras', choiceCategory: 'handle', choice: 'Pull Handle' } },
              { label: 'U-Handle', action: { kind: 'advance', next: 'showers-extras', choiceCategory: 'handle', choice: 'U-Handle' } },
              { label: 'Ladder Pull', hint: 'Statement', action: { kind: 'advance', next: 'showers-extras', choiceCategory: 'handle', choice: 'Ladder Pull' } },
              { label: 'Knob', hint: 'Minimal', action: { kind: 'advance', next: 'showers-extras', choiceCategory: 'handle', choice: 'Knob' } },
            ],
    },
    'showers-extras': {
      id: 'showers-extras',
      progressStep: 8,
      progressTotal: 9,
      agent: 'Last visual pick — any upgrades? Grid patterns add architectural character, steam upgrade seals the whole thing for a spa experience.',
      chips: [
        { label: 'Skip upgrades', primary: true, action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'none' } },
        { label: 'Add Grid Patterns', action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'Grid Patterns' } },
        { label: 'Add Steam', action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'Steam Upgrade' } },
        { label: 'Both', action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'Grid Patterns + Steam Upgrade' } },
      ],
    },
    'showers-quote': {
      id: 'showers-quote',
      progressStep: 9,
      progressTotal: 9,
      agent: 'Here\u2019s your configuration on the main screen. Our AI is rendering a preview of your shower. Want to wrap up with a few quick contact details so we can send you a precise quote?',
      chips: [
        { label: 'Yes, collect my info', primary: true, action: { kind: 'advance', next: 'showers-contact' } },
      ],
    },
    'showers-contact': {
      id: 'showers-contact',
      progressStep: 9,
      progressTotal: 9,
      agent: 'Just fill in what you\u2019re comfortable sharing — anything blank is fine.',
      onEnter: (ctx) => {
        injectContactForm({
          name: ctx.choices.name || '',
          email: ctx.choices.email || '',
          phone: ctx.choices.phone || '',
        });
      },
      chips: [
        { label: 'Submit my info', primary: true, action: { kind: 'submit-quote' } },
      ],
    },

    /* ---------------- Railings / Commercial (simplified) ---------------- */
    'railings-intro': {
      id: 'railings-intro',
      agent: 'Glass railings are our specialty too — engineered, permitted, and installed by our crew. Want to walk through the options?',
      chips: [
        { label: 'Yes, let\u2019s go', primary: true, action: { kind: 'advance', next: 'railings-type' } },
      ],
    },
    'railings-type': {
      id: 'railings-type',
      agent: 'Which mounting type fits your project?',
      chips: [
        { label: 'Standoff Mount', primary: true, action: { kind: 'advance', next: 'railings-glass', choiceCategory: 'rail-type', choice: 'Standoff Mount' } },
        { label: 'Base Shoe', action: { kind: 'advance', next: 'railings-glass', choiceCategory: 'rail-type', choice: 'Base Shoe' } },
        { label: 'Posts & Clips', action: { kind: 'advance', next: 'railings-glass', choiceCategory: 'rail-type', choice: 'Posts & Clips' } },
        { label: 'Pool Fence', action: { kind: 'advance', next: 'railings-glass', choiceCategory: 'rail-type', choice: 'Pool Fence' } },
      ],
    },
    'railings-glass': {
      id: 'railings-glass',
      agent: 'Glass spec?',
      chips: [
        { label: 'Clear Tempered', primary: true, action: { kind: 'advance', next: 'railings-finish', choiceCategory: 'rail-glass', choice: 'Clear Tempered' } },
        { label: 'Laminated Safety', action: { kind: 'advance', next: 'railings-finish', choiceCategory: 'rail-glass', choice: 'Laminated Safety' } },
        { label: 'Tinted / Privacy', action: { kind: 'advance', next: 'railings-finish', choiceCategory: 'rail-glass', choice: 'Tinted / Privacy' } },
      ],
    },
    'railings-finish': {
      id: 'railings-finish',
      agent: 'Hardware finish?',
      chips: [
        { label: 'Stainless', primary: true, action: { kind: 'advance', next: 'railings-contact', choiceCategory: 'rail-finish', choice: 'Stainless' } },
        { label: 'Matte Black', action: { kind: 'advance', next: 'railings-contact', choiceCategory: 'rail-finish', choice: 'Matte Black' } },
        { label: 'Bronze', action: { kind: 'advance', next: 'railings-contact', choiceCategory: 'rail-finish', choice: 'Bronze' } },
        { label: 'Brushed Nickel', action: { kind: 'advance', next: 'railings-contact', choiceCategory: 'rail-finish', choice: 'Brushed Nickel' } },
      ],
    },
    'railings-contact': {
      id: 'railings-contact',
      agent: 'Perfect. A few quick details so we can put an accurate quote together?',
      onEnter: (ctx) => injectContactForm({ name: ctx.choices.name || '', email: ctx.choices.email || '', phone: ctx.choices.phone || '' }),
      chips: [{ label: 'Submit my info', primary: true, action: { kind: 'submit-quote' } }],
    },

    'commercial-intro': {
      id: 'commercial-intro',
      agent: 'We do commercial end-to-end — engineering, permits, fabrication, installation. Let\u2019s get a sense of your project.',
      chips: [{ label: 'Walk me through', primary: true, action: { kind: 'advance', next: 'commercial-type' } }],
    },
    'commercial-type': {
      id: 'commercial-type',
      agent: 'Which project type?',
      chips: [
        { label: 'Storefront System', primary: true, action: { kind: 'advance', next: 'commercial-glass', choiceCategory: 'com-type', choice: 'Storefront System' } },
        { label: 'Curtain Wall', action: { kind: 'advance', next: 'commercial-glass', choiceCategory: 'com-type', choice: 'Curtain Wall' } },
        { label: 'Interior Partitions', action: { kind: 'advance', next: 'commercial-glass', choiceCategory: 'com-type', choice: 'Interior Partitions' } },
        { label: 'Doors & Hardware', action: { kind: 'advance', next: 'commercial-glass', choiceCategory: 'com-type', choice: 'Doors & Hardware' } },
      ],
    },
    'commercial-glass': {
      id: 'commercial-glass',
      agent: 'Glass spec? South Florida HVHZ needs impact-rated.',
      chips: [
        { label: 'Clear Insulated', primary: true, action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-glass', choice: 'Clear Insulated (IGU)' } },
        { label: 'Low-E Coated', action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-glass', choice: 'Low-E Coated' } },
        { label: 'Hurricane Rated', action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-glass', choice: 'Hurricane / Impact Rated' } },
        { label: 'Tinted / Spandrel', action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-glass', choice: 'Tinted / Spandrel' } },
      ],
    },
    'commercial-scope': {
      id: 'commercial-scope',
      agent: 'Project scope?',
      chips: [
        { label: 'Small / Repair', primary: true, action: { kind: 'advance', next: 'commercial-contact', choiceCategory: 'com-scope', choice: 'Small / Repair' } },
        { label: 'Medium Build-Out', action: { kind: 'advance', next: 'commercial-contact', choiceCategory: 'com-scope', choice: 'Medium Build-Out' } },
        { label: 'Full Storefront', action: { kind: 'advance', next: 'commercial-contact', choiceCategory: 'com-scope', choice: 'Full Storefront' } },
        { label: 'Curtain Wall', action: { kind: 'advance', next: 'commercial-contact', choiceCategory: 'com-scope', choice: 'Curtain Wall / Multi-Story' } },
      ],
    },
    'commercial-contact': {
      id: 'commercial-contact',
      agent: 'Last step — drop your contact so we can send a detailed quote.',
      onEnter: (ctx) => injectContactForm({ name: ctx.choices.name || '', email: ctx.choices.email || '', phone: ctx.choices.phone || '' }),
      chips: [{ label: 'Submit my info', primary: true, action: { kind: 'submit-quote' } }],
    },

    /* ---------------- Done ---------------- */
    done: {
      id: 'done',
      agent: (ctx) =>
        `All set${ctx.choices.name ? ', ' + ctx.choices.name.split(' ')[0] : ''}! I\u2019ve sent your details over. A specialist will be in touch within 24 hours. Thanks for chatting!`,
      onEnter: (ctx) => injectSubmittedCard(ctx.choices),
      chips: [{ label: 'Close', action: { kind: 'close' } }],
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Submitted confirmation card                                        */
/* ------------------------------------------------------------------ */

function injectSubmittedCard(choices: Record<string, string>): void {
  const container = document.getElementById('chat-extras');
  if (!container) return;
  container.innerHTML = '';

  const rows: Array<[string, string]> = [];
  const push = (label: string, key: string) => {
    if (choices[key]) rows.push([label, choices[key]]);
  };
  push('Name', 'name');
  push('Email', 'email');
  push('Phone', 'phone');
  push('City', 'location');
  push('Timeline', 'timeline');
  push('Budget', 'budget');

  const selectionRows: Array<[string, string]> = [];
  const pushSel = (label: string, key: string) => {
    if (choices[key] && choices[key] !== 'none') selectionRows.push([label, choices[key]]);
  };
  pushSel('Enclosure', 'enclosure');
  pushSel('Glass', 'glass');
  pushSel('Hardware', 'hardware');
  pushSel('Handle', 'handle');
  pushSel('Upgrades', 'extras');
  pushSel('Rail type', 'rail-type');
  pushSel('Rail glass', 'rail-glass');
  pushSel('Rail finish', 'rail-finish');
  pushSel('Project type', 'com-type');
  pushSel('Glass spec', 'com-glass');
  pushSel('Framing', 'com-framing');
  pushSel('Scope', 'com-scope');

  const card = document.createElement('div');
  card.className = 'chat-submitted-card';
  card.innerHTML = `
    <div class="chat-submitted-check">\u2713</div>
    <div class="chat-submitted-title">Quote request sent!</div>
    ${
      selectionRows.length
        ? `<div class="chat-submitted-section-title">Your configuration</div>
           <div class="chat-submitted-rows">${selectionRows
             .map(([k, v]) => `<div class="chat-submitted-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
             .join('')}</div>`
        : ''
    }
    ${
      rows.length
        ? `<div class="chat-submitted-section-title">Your details</div>
           <div class="chat-submitted-rows">${rows
             .map(([k, v]) => `<div class="chat-submitted-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
             .join('')}</div>`
        : ''
    }
  `;
  container.appendChild(card);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/*  Inline contact form injection                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Bathroom photo upload UI                                           */
/* ------------------------------------------------------------------ */

let photoUploadHandlerAttached = false;

function injectPhotoUploadUI(): void {
  const container = document.getElementById('chat-extras');
  if (!container) return;
  container.innerHTML = '';

  const existing = getBathroomPhoto();

  const wrap = document.createElement('div');
  wrap.className = 'chat-photo-upload';
  wrap.innerHTML = existing
    ? `
        <div class="chat-photo-preview">
          <img src="${existing.dataUrl}" alt="Your bathroom">
          <button type="button" class="chat-photo-clear" aria-label="Remove photo">\u2715</button>
        </div>
        <p class="chat-photo-note">Got it \u2014 I\u2019ll use this bathroom as the canvas for your final AI rendering.</p>
      `
    : `
        <label class="chat-photo-dropzone" for="chat-photo-input">
          <span class="chat-photo-icon">\u{1F4F7}</span>
          <span class="chat-photo-label-main">Upload a photo of your bathroom</span>
          <span class="chat-photo-label-sub">JPG, PNG, or HEIC \u00B7 max 10MB</span>
        </label>
        <input type="file" id="chat-photo-input" accept="image/*" capture="environment" hidden>
      `;
  container.appendChild(wrap);

  // Wire handlers (delegated to avoid duplicate listeners on re-enter)
  if (photoUploadHandlerAttached) return;
  photoUploadHandlerAttached = true;

  document.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (target?.id !== 'chat-photo-input') return;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBathroomPhoto(dataUrl);
      // Refresh the UI to show the preview
      injectPhotoUploadUI();
    } catch (err) {
      console.warn('[Chat] Photo upload failed:', err);
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target?.closest('.chat-photo-clear')) {
      const mod = target.closest('.chat-photo-upload');
      mod?.remove();
      // @ts-expect-error — dynamic import side-effect-free clear
      import('../utils/bathroom-photo').then((m) => m.clearBathroomPhoto());
      injectPhotoUploadUI();
    }
  });
}

function injectContactForm(prefill: { name: string; email: string; phone: string }): void {
  const container = document.getElementById('chat-extras');
  if (!container) return;
  container.innerHTML = '';

  const form = document.createElement('form');
  form.className = 'chat-inline-form';
  form.id = 'chat-inline-form';
  form.innerHTML = `
    <div class="chat-form-row">
      <label>Name<input type="text" name="name" value="${escape(prefill.name)}" placeholder="Your name"></label>
    </div>
    <div class="chat-form-row">
      <label>Email<input type="email" name="email" value="${escape(prefill.email)}" placeholder="you@example.com"></label>
    </div>
    <div class="chat-form-row two-col">
      <label>Phone<input type="tel" name="phone" value="${escape(prefill.phone)}" placeholder="(555) 123-4567"></label>
      <label>City<input type="text" name="location" placeholder="e.g. Fort Lauderdale"></label>
    </div>
    <div class="chat-form-row two-col">
      <label>Timeline<select name="timeline">
        <option value="">Select</option>
        <option>ASAP</option>
        <option>1-3 months</option>
        <option>3-6 months</option>
        <option>Just exploring</option>
      </select></label>
      <label>Budget<select name="budget">
        <option value="">Select</option>
        <option>Under $2k</option>
        <option>$2-5k</option>
        <option>$5-10k</option>
        <option>$10k+</option>
      </select></label>
    </div>
  `;
  container.appendChild(form);
}

function readContactForm(): Record<string, string> {
  const form = document.getElementById('chat-inline-form') as HTMLFormElement | null;
  if (!form) return {};
  const data = new FormData(form);
  const out: Record<string, string> = {};
  data.forEach((v, k) => {
    const val = String(v || '').trim();
    if (val) out[k] = val;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Engine                                                             */
/* ------------------------------------------------------------------ */

export type ChatCallbacks = {
  onAgentMessage?: (text: string) => void;
  onUserMessage?: (text: string) => void;
  onChips?: (chips: Chip[]) => void;
  onProgress?: (step: number | null, total: number | null) => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
  onClose?: () => void;
};

export class ChatDriver {
  private steps = buildSteps();
  private currentStep: ChatStep | null = null;
  private ctx: ChatContext;
  private cbs: ChatCallbacks = {};
  private active = false;

  constructor() {
    this.ctx = {
      choices: {},
      goToStep: (id) => this.goToStep(id),
      addAgent: (text) => this.cbs.onAgentMessage?.(text),
      addUser: (text) => this.cbs.onUserMessage?.(text),
    };
    // Preload known info from user storage
    const user = loadUser();
    if (user?.name) this.ctx.choices.name = user.name;
    if (user?.email) this.ctx.choices.email = user.email;
    if (user?.phone) this.ctx.choices.phone = user.phone;
  }

  setCallbacks(cbs: ChatCallbacks): void {
    this.cbs = cbs;
  }

  get isActive(): boolean { return this.active; }

  async start(): Promise<void> {
    this.active = true;
    await this.goToStep('greet');
  }

  stop(): void {
    this.active = false;
    this.currentStep = null;
    this.cbs.onClose?.();
  }

  async goToStep(id: string): Promise<void> {
    const step = this.steps[id];
    if (!step) {
      console.warn('[Chat] Unknown step:', id);
      return;
    }
    this.currentStep = step;

    // Typing indicator
    this.cbs.onTypingStart?.();
    await sleep(320);
    this.cbs.onTypingEnd?.();

    const agentText = typeof step.agent === 'function' ? step.agent(this.ctx) : step.agent;
    this.cbs.onAgentMessage?.(agentText);

    this.cbs.onProgress?.(step.progressStep ?? null, step.progressTotal ?? null);

    // Render chips
    const chips = step.chips ? (typeof step.chips === 'function' ? step.chips(this.ctx) : step.chips) : [];
    this.cbs.onChips?.(chips);

    // Onenter hook (inject form etc.)
    step.onEnter?.(this.ctx);
  }

  async onChipTapped(chip: Chip): Promise<void> {
    this.cbs.onUserMessage?.(chip.label);
    this.cbs.onChips?.([]);

    await this.executeAction(chip.action);
  }

  async onUserText(text: string): Promise<void> {
    if (!this.currentStep) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    this.cbs.onUserMessage?.(trimmed);
    this.cbs.onChips?.([]);

    // If this step has a text handler, use it.
    if (this.currentStep.onText) {
      await this.currentStep.onText(trimmed, this.ctx);
      return;
    }

    // Try fuzzy-match against chips
    const chips = this.currentStep.chips ? (typeof this.currentStep.chips === 'function' ? this.currentStep.chips(this.ctx) : this.currentStep.chips) : [];
    const match = chips.find((c) => fuzzyMatch(trimmed, c.label));
    if (match) {
      await this.executeAction(match.action);
      return;
    }

    // Off-script question → ask the LLM for a brief, on-topic reply
    await this.handleOffScript(trimmed);
  }

  private async executeAction(action: ChipAction): Promise<void> {
    switch (action.kind) {
      case 'set-name': {
        // name is collected via free-text in the greet step
        break;
      }
      case 'select-service': {
        await handleToolCall('select_service', { service: action.service });
        const nextId = action.service === 'showers' ? 'showers-intro' : action.service === 'railings' ? 'railings-intro' : 'commercial-intro';
        setTimeout(() => this.goToStep(nextId), 400);
        break;
      }
      case 'advance': {
        if (action.choiceCategory && action.choice) {
          this.ctx.choices[action.choiceCategory] = action.choice;
        }
        // If this is a tour step (e.g. showers-enclosure → showers-glass), also advance the slideshow
        const slideId = stepIdToSlideId(action.next);
        if (slideId) {
          const args: Record<string, string> = { slide_id: slideId };
          if (action.choice) args.choice = action.choice;
          if (this.ctx.choices.email && slideId === 'enclosures') args.email = this.ctx.choices.email;
          await handleToolCall('show_slide', args);
        }
        // When reaching the contact step, populate the editorial card
        // and inject the AI-viz lock overlay. The real image generation
        // is deferred until the user submits the form (lead-gate).
        if (action.next === 'showers-contact' || action.next === 'railings-contact' || action.next === 'commercial-contact') {
          setTimeout(() => {
            populateEditorialFromChoices(this.ctx.choices);
            injectLockOverlay();
          }, 100);
        }
        setTimeout(() => this.goToStep(action.next), 300);
        break;
      }
      case 'save-email-and-advance': {
        // Email was already saved via text input
        const slideId = stepIdToSlideId(action.next);
        if (slideId) {
          await handleToolCall('show_slide', { slide_id: slideId, email: this.ctx.choices.email });
        }
        setTimeout(() => this.goToStep(action.next), 300);
        break;
      }
      case 'submit-quote': {
        // Read the form BEFORE any async work — fields could be cleared later
        const form = readContactForm();
        console.log('[Chat] Form read on submit:', form);

        // Validate required fields
        if (!form.name || !form.email) {
          const nameInput = document.querySelector('#chat-inline-form [name="name"]') as HTMLInputElement | null;
          const emailInput = document.querySelector('#chat-inline-form [name="email"]') as HTMLInputElement | null;
          if (nameInput && !form.name) nameInput.classList.add('invalid');
          if (emailInput && !form.email) emailInput.classList.add('invalid');
          this.cbs.onAgentMessage?.('I need at least your name and email to send the quote. Can you fill those in?');
          return;
        }

        // Merge form values into choices
        Object.assign(this.ctx.choices, form);

        // Persist for next visit
        saveUser({
          name: this.ctx.choices.name,
          email: this.ctx.choices.email,
          phone: this.ctx.choices.phone,
          location: this.ctx.choices.location,
          timeline: this.ctx.choices.timeline,
          budget: this.ctx.choices.budget,
          preferredMode: 'chat',
          lastQuote: {
            service: (document.querySelector('.tour-slideshow')?.getAttribute('data-service') as any) || undefined,
            enclosure: this.ctx.choices.enclosure,
            glass: this.ctx.choices.glass,
            hardware: this.ctx.choices.hardware,
            handle: this.ctx.choices.handle,
            accessories: this.ctx.choices.accessories,
            extras: this.ctx.choices.extras,
          },
        });

        console.log('[Chat] Quote submitted with choices:', this.ctx.choices);

        // Re-populate the editorial card with the final choices (including
        // newly-submitted contact fields like name/email/phone shown there)
        populateEditorialFromChoices(this.ctx.choices);

        // Unlock the AI visualization and trigger image generation.
        // Single path — no duplicate present_quote call to race with.
        unlockAndGenerateViz(this.ctx.choices);

        setTimeout(() => this.goToStep('done'), 600);
        break;
      }
      case 'close': {
        this.stop();
        break;
      }
    }
  }

  private async handleOffScript(text: string): Promise<void> {
    this.cbs.onTypingStart?.();
    try {
      const currentStepId = this.currentStep?.id || '';
      const contextNote = `You are Alex, a glass specialist at Precision Glass. The customer is on step "${currentStepId}" of a guided tour. They just asked: "${text}". Give a brief 1-2 sentence helpful reply. Then gently redirect them back to the step's options (tap a choice or say something like "clear glass" to continue). Do NOT claim to have performed an action. Do NOT call any tools.`;

      const body = {
        contents: [{ role: 'user', parts: [{ text: contextNote }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${OFFFLOW_MODEL}:generateContent?key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Off-flow API failed');
      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Sorry, could you try one of the options?';
      this.cbs.onTypingEnd?.();
      this.cbs.onAgentMessage?.(reply);

      // Re-render the chips so user can continue
      const chips = this.currentStep?.chips ? (typeof this.currentStep.chips === 'function' ? this.currentStep.chips(this.ctx) : this.currentStep.chips) : [];
      this.cbs.onChips?.(chips);
    } catch (err) {
      console.warn('[Chat] off-script fallback failed:', err);
      this.cbs.onTypingEnd?.();
      this.cbs.onAgentMessage?.('Hmm, let me try that again — could you tap one of the options below?');
      const chips = this.currentStep?.chips ? (typeof this.currentStep.chips === 'function' ? this.currentStep.chips(this.ctx) : this.currentStep.chips) : [];
      this.cbs.onChips?.(chips);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map a chat step id to the slideshow slide id it corresponds to. */
function stepIdToSlideId(stepId: string): string | null {
  const map: Record<string, string> = {
    'showers-intro': 'intro',
    'showers-gallery': 'gallery',
    'showers-enclosure': 'enclosures',
    'showers-glass': 'glass',
    'showers-hardware': 'hardware',
    'showers-handle': 'accessories',
    'showers-extras': 'extras',
    'showers-quote': 'process',
    'showers-contact': 'quote',
    'railings-intro': 'intro',
    'railings-type': 'rail-types',
    'railings-glass': 'rail-glass',
    'railings-finish': 'rail-finish',
    'railings-contact': 'quote',
    'commercial-intro': 'intro',
    'commercial-type': 'com-types',
    'commercial-glass': 'com-glass',
    'commercial-scope': 'com-scope',
    'commercial-contact': 'quote',
  };
  return map[stepId] || null;
}

function fuzzyMatch(input: string, target: string): boolean {
  const a = input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = target.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  // Require all words of the shorter to appear in the longer
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  return short.split(' ').every((w) => w.length < 2 || long.includes(w));
}

function escape(s: string): string {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/*  Quote slide DOM helpers (editorial card + lock overlay)            */
/* ------------------------------------------------------------------ */

function populateEditorialFromChoices(choices: Record<string, string>): void {
  const fields: Array<[string, string]> = [
    ['qs-enclosure', choices.enclosure || choices['rail-type'] || choices['com-type'] || ''],
    ['qs-glass', choices.glass || choices['rail-glass'] || choices['com-glass'] || ''],
    ['qs-hardware', choices.hardware || choices['rail-finish'] || choices['com-framing'] || ''],
    ['qs-handle', choices.handle || choices['rail-mounting'] || choices['com-scope'] || ''],
    ['qs-extras', choices.extras || ''],
    ['qs-name', choices.name || ''],
    ['qs-email', choices.email || ''],
    ['qs-phone', choices.phone || ''],
  ];
  fields.forEach(([id, val]) => {
    if (!val) return;
    const el = document.getElementById(id);
    if (el) {
      el.textContent = val;
      el.classList.add('filled');
    }
  });
}

function injectLockOverlay(): void {
  const wrap = document.querySelector('.ss-quote-img-wrap') as HTMLElement | null;
  if (!wrap) return;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (spinner) spinner.style.display = 'none';
  if (wrap.querySelector('.ss-quote-lock')) return;
  const lock = document.createElement('div');
  lock.className = 'ss-quote-lock';
  lock.innerHTML = `
    <div class="ss-quote-lock-sparkle">\u2728</div>
    <div class="ss-quote-lock-title">Your free AI rendering is ready</div>
    <div class="ss-quote-lock-desc">One last step \u2014 share your contact details and we\u2019ll unlock a photorealistic AI preview of <strong>your exact configuration</strong>. Yours to keep, no strings.</div>
  `;
  wrap.appendChild(lock);
}

function unlockAndGenerateViz(choices: Record<string, string>): void {
  const lock = document.querySelector('.ss-quote-lock') as HTMLElement | null;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (lock) lock.remove();
  if (spinner) {
    spinner.style.display = 'flex';
    const label = spinner.querySelector('span');
    if (label) label.textContent = 'Rendering your custom shower\u2026';
  }

  // Only generate for shower flows
  const service = document.querySelector('.tour-slideshow')?.getAttribute('data-service');
  if (service && service !== 'showers') {
    if (spinner) spinner.style.display = 'none';
    return;
  }
  generateShowerImage(choices).then((url) => {
    if (!url) return;
    const img = document.getElementById('qs-generated-img') as HTMLImageElement | null;
    if (img) {
      img.src = url;
      img.classList.add('loaded');
    }
    const sp = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
    if (sp) sp.style.display = 'none';
    // Persist to the customer-generations gallery (fire and forget)
    saveCustomerGeneration(url, {
      service: (document.querySelector('.tour-slideshow')?.getAttribute('data-service') as any) || 'showers',
      enclosure: choices.enclosure,
      glass: choices.glass,
      hardware: choices.hardware,
      handle: choices.handle,
      accessories: choices.accessories,
      extras: choices.extras,
      customerName: choices.name,
      customerEmail: choices.email,
      mode: 'chat',
    });
  }).catch((err) => console.warn('[Chat] viz gen failed:', err));
}
