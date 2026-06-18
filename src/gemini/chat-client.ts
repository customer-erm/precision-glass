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
import { setBathroomPhoto, readFileAsDataUrl, getBathroomPhoto, clearBathroomPhoto } from '../utils/bathroom-photo';
import { renderQuoteVisuals, markQuoteRenderReady, getActiveService } from '../experience/facade';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const OFFFLOW_MODEL = 'gemini-2.5-flash';
type ServiceChoice = 'showers' | 'railings' | 'commercial';

function normalizeService(value?: string | null): ServiceChoice | null {
  return value === 'showers' || value === 'railings' || value === 'commercial' ? value : null;
}

function activeChatService(choices?: Record<string, string>): ServiceChoice {
  const domService = typeof document !== 'undefined'
    ? (document.querySelector('.tour-slideshow') as HTMLElement | null)?.dataset.service
    : null;
  return normalizeService(choices?.service)
    || normalizeService(getActiveService())
    || normalizeService(domService)
    || 'showers';
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChipAction =
  | { kind: 'set-name' }
  | { kind: 'select-service'; service: 'showers' | 'railings' | 'commercial' }
  | { kind: 'advance'; next: string; choiceCategory?: string; choice?: string }
  | { kind: 'save-email-and-advance'; next: string }
  | { kind: 'open-photo' }
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
    ? `Welcome back, ${name}! I'm Alex - ready to keep working on your glass project?`
    : `Hey there, I'm Alex, your glass specialist at Precision Glass. I can help you shape the right glass project and prepare a proposal brief for our team to review. What should I call you?`;

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
          ? `${ctx.choices.name.split(' ')[0]}, let's start with the right guided experience. What are you working on?`
          : `Let's start with the right guided experience. What are you working on?`,
      chips: [
        { label: 'Design my shower', hint: 'AI preview + proposal', primary: true, action: { kind: 'select-service', service: 'showers' } },
        { label: 'Glass railings', hint: '3D quote guide', action: { kind: 'select-service', service: 'railings' } },
        { label: 'Commercial glass', hint: '3D quote guide', action: { kind: 'select-service', service: 'commercial' } },
      ],
    },

    /* ---------------- Shower flow ---------------- */
    'showers-intro': {
      id: 'showers-intro',
      progressStep: 1,
      progressTotal: 10,
      agent: 'Great — I’ll walk you through it like a glass pro would: layout first, then glass, hardware, the handle, and a visual proposal at the end. Ready?',
      chips: [
        { label: 'Let’s go', primary: true, action: { kind: 'advance', next: 'showers-photo-ask' } },
        { label: 'Tell me more first', action: { kind: 'advance', next: 'showers-intro-more' } },
      ],
    },
    'showers-photo-ask': {
      id: 'showers-photo-ask',
      progressStep: 2,
      progressTotal: 10,
      agent: 'One quick thing — want to add a photo of your bathroom? I can tailor my advice to your space and render your new shower right into it at the end. Totally optional.',
      chips: [
        { label: 'Add a photo', hint: 'Personalized render', primary: true, action: { kind: 'open-photo' } },
        { label: 'Skip for now', action: { kind: 'advance', next: 'showers-gallery' } },
      ],
    },
    'showers-upload': {
      id: 'showers-upload',
      progressStep: 2,
      progressTotal: 10,
      agent: 'Upload a photo if you have one handy. If you use a real photo, add your email here too so we can attach the personalized rendering and proposal preview to your project record. You can skip the photo and keep browsing.',
      onEnter: (ctx) => injectPhotoUploadUI(ctx),
      chips: [],
    },
    'showers-intro-more': {
      id: 'showers-intro-more',
      progressStep: 1,
      progressTotal: 10,
      agent: 'Sure — frameless means the glass panels stand on their own with only small discrete hardware. It\u2019s custom-cut to your exact space, uses 3/8" or 1/2" tempered safety glass, and comes with a lifetime workmanship warranty. Most installs are done in a single day. Ready?',
      chips: [
        { label: 'Ready, walk me through', primary: true, action: { kind: 'advance', next: 'showers-photo-ask' } },
      ],
    },
    'showers-photo-guidance': {
      id: 'showers-photo-guidance',
      progressStep: 3,
      progressTotal: 10,
      agent: 'Perfect. For the rendering to pass a real installer review, I need one placement cue: where should the active door land, or is this a no-swing layout?',
      chips: [
        { label: 'Hinge on left', hint: 'Door handle right', action: { kind: 'advance', next: 'showers-gallery', choiceCategory: 'doorPlacement', choice: 'Hinge on left' } },
        { label: 'Hinge on right', hint: 'Door handle left', action: { kind: 'advance', next: 'showers-gallery', choiceCategory: 'doorPlacement', choice: 'Hinge on right' } },
        { label: 'No swing / slider', hint: 'Tight clearance', primary: true, action: { kind: 'advance', next: 'showers-gallery', choiceCategory: 'doorPlacement', choice: 'No swing / slider preferred' } },
        { label: 'Not sure', hint: 'Keep it conservative', action: { kind: 'advance', next: 'showers-gallery', choiceCategory: 'doorPlacement', choice: 'Not sure - recommend safest placement' } },
      ],
    },
    'showers-gallery': {
      id: 'showers-gallery',
      progressStep: 4,
      progressTotal: 10,
      agent: (ctx) =>
        ctx.choices.email
          ? 'Good - I have your email. Here are recent installs for reference. Next we will choose the enclosure style, and I will keep your photo and door-placement cue in mind for the final rendering.'
          : 'Here are recent installs for reference. Before we choose the layout, where should I send the buyer guide and proposal preview? You can also skip and keep browsing.',
      requiresTextInput: true,
      chips: (ctx) =>
        ctx.choices.email
          ? [{ label: 'Continue to layout options', primary: true, action: { kind: 'advance', next: 'showers-enclosure' } }]
          : [{ label: 'Skip for now', action: { kind: 'advance', next: 'showers-enclosure' } }],
      onText: async (text, ctx) => {
        const email = text.trim();
        if (/\S+@\S+\.\S+/.test(email)) {
          ctx.choices.email = email;
          saveUser({ email });
          ctx.addAgent('Got it - I will keep that with your project preview. Now let us pick an enclosure type.');
          setTimeout(() => ctx.goToStep('showers-enclosure'), 400);
        } else {
          ctx.addAgent('That did not look like an email. You can type it again or skip for now.');
        }
      },
    },
    'showers-enclosure': {
      id: 'showers-enclosure',
      progressStep: 5,
      progressTotal: 10,
      agent: (ctx) => {
        if (ctx.choices.doorPlacement?.toLowerCase().includes('slider')) {
          return 'For a tight or no-swing space, a frameless slider or splash panel is usually the cleanest direction. If the photo gives us enough opening width, the final render will keep the track and rollers accurate. Which style should we explore?';
        }
        if (ctx.choices.doorPlacement?.toLowerCase().includes('hinge')) {
          return `Great. I will keep "${ctx.choices.doorPlacement}" in mind so the hinge side and handle side do not get flipped in the rendering. Which enclosure style fits the opening best?`;
        }
        return 'Great. There are 10 enclosure styles on screen. If you are not sure, Single Door and Door + Panel are the safest starting points for most remodels. Which style fits your space best?';
      },
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
      progressStep: 6,
      progressTotal: 10,
      agent: (ctx) => `Perfect - ${ctx.choices.enclosure}. Now the glass: clear shows off tile and stone, frosted adds privacy, and rain glass softens the view with texture. Which draws you in?`,
      chips: [
        { label: 'Clear', hint: 'Bestseller', primary: true, action: { kind: 'advance', next: 'showers-hardware', choiceCategory: 'glass', choice: 'Clear Glass' } },
        { label: 'Frosted', hint: 'Privacy', action: { kind: 'advance', next: 'showers-hardware', choiceCategory: 'glass', choice: 'Frosted Glass' } },
        { label: 'Rain', hint: 'Artistic', action: { kind: 'advance', next: 'showers-hardware', choiceCategory: 'glass', choice: 'Rain Glass' } },
      ],
    },
    'showers-hardware': {
      id: 'showers-hardware',
      progressStep: 7,
      progressTotal: 10,
      agent: 'Five hardware finishes to pick from. Think of this as hinges, clips, brackets, and handle finish all matching the rest of the bathroom. What would complement your space?',
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
      progressStep: 8,
      progressTotal: 10,
      agent: (ctx) =>
        ctx.choices.enclosure?.toLowerCase().includes('splash')
          ? 'Your splash panel is a walk-in, so no handle is needed. I will keep the render clean and avoid adding door hardware.'
          : 'Nice. Hinges come standard. Which handle style do you like? The rendering will place it opposite the hinge side.',
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
      progressStep: 9,
      progressTotal: 10,
      agent: 'Last visual pick - any upgrades? Grid patterns add architectural character. Steam upgrade means a more sealed design, so the proposal will flag that for staff review.',
      chips: [
        { label: 'Skip upgrades', primary: true, action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'none' } },
        { label: 'Add Grid Patterns', action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'Grid Patterns' } },
        { label: 'Add Steam', action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'Steam Upgrade' } },
        { label: 'Both', action: { kind: 'advance', next: 'showers-quote', choiceCategory: 'extras', choice: 'Grid Patterns + Steam Upgrade' } },
      ],
    },
    'showers-quote': {
      id: 'showers-quote',
      progressStep: 10,
      progressTotal: 10,
      agent: 'Here is your configuration on the main screen. One last detail pass lets staff review the project properly - no automated pricing, just the design, photo context, and notes.',
      chips: [
        { label: 'Prepare my proposal', primary: true, action: { kind: 'advance', next: 'showers-contact' } },
      ],
    },
    'showers-contact': {
      id: 'showers-contact',
      progressStep: 10,
      progressTotal: 10,
      agent: 'Add anything that helps the team understand the project. Name and email are enough to prepare the prototype proposal; phone, city, project stage, and notes are optional.',
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

    /* ---------------- Railings / Commercial ---------------- */
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
        { label: 'Stainless', primary: true, action: { kind: 'advance', next: 'railings-mounting', choiceCategory: 'rail-finish', choice: 'Stainless' } },
        { label: 'Matte Black', action: { kind: 'advance', next: 'railings-mounting', choiceCategory: 'rail-finish', choice: 'Matte Black' } },
        { label: 'Bronze', action: { kind: 'advance', next: 'railings-mounting', choiceCategory: 'rail-finish', choice: 'Bronze' } },
        { label: 'Brushed Nickel', action: { kind: 'advance', next: 'railings-mounting', choiceCategory: 'rail-finish', choice: 'Brushed Nickel' } },
      ],
    },
    'railings-mounting': {
      id: 'railings-mounting',
      agent: 'Last design choice: how it attaches. Staff will verify substrate, waterproofing, and edge distance before anything is finalized.',
      chips: [
        { label: 'Top Mount', primary: true, action: { kind: 'advance', next: 'railings-process', choiceCategory: 'rail-mounting', choice: 'Top Mount' } },
        { label: 'Side / Fascia Mount', action: { kind: 'advance', next: 'railings-process', choiceCategory: 'rail-mounting', choice: 'Side / Fascia Mount' } },
        { label: 'Core-Drilled', action: { kind: 'advance', next: 'railings-process', choiceCategory: 'rail-mounting', choice: 'Core-Drilled' } },
        { label: 'Embedded Shoe', action: { kind: 'advance', next: 'railings-process', choiceCategory: 'rail-mounting', choice: 'Embedded Shoe' } },
      ],
    },
    'railings-process': {
      id: 'railings-process',
      agent: 'Here is the process: intake, site measure, code and anchoring review, fabrication plan, then install coordination. Ready to send this to the team?',
      chips: [{ label: 'Prepare railing quote', primary: true, action: { kind: 'advance', next: 'railings-contact' } }],
    },
    'railings-contact': {
      id: 'railings-contact',
      agent: 'Perfect. A few quick details so we can put an accurate quote together?',
      onEnter: (ctx) => injectContactForm({ name: ctx.choices.name || '', email: ctx.choices.email || '', phone: ctx.choices.phone || '' }),
      chips: [{ label: 'Submit my info', primary: true, action: { kind: 'submit-quote' } }],
    },

    'commercial-intro': {
      id: 'commercial-intro',
      agent: 'We do commercial glass end-to-end: storefronts, curtain walls, partitions, doors, code review, and install coordination. I will ask for one project category, then glass, framing, and scale.',
      chips: [{ label: 'Walk me through', primary: true, action: { kind: 'advance', next: 'commercial-type' } }],
    },
    'commercial-type': {
      id: 'commercial-type',
      agent: 'First, which category best matches the job?',
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
        { label: 'Clear Insulated', primary: true, action: { kind: 'advance', next: 'commercial-framing', choiceCategory: 'com-glass', choice: 'Clear Insulated (IGU)' } },
        { label: 'Low-E Coated', action: { kind: 'advance', next: 'commercial-framing', choiceCategory: 'com-glass', choice: 'Low-E Coated' } },
        { label: 'Hurricane Rated', action: { kind: 'advance', next: 'commercial-framing', choiceCategory: 'com-glass', choice: 'Hurricane / Impact Rated' } },
        { label: 'Tinted / Spandrel', action: { kind: 'advance', next: 'commercial-framing', choiceCategory: 'com-glass', choice: 'Tinted / Spandrel' } },
      ],
    },
    'commercial-framing': {
      id: 'commercial-framing',
      agent: 'Next is the framing direction. Staff will confirm frame depth, finish, thermal performance, hardware, and submittal requirements.',
      chips: [
        { label: 'Standard Aluminum', primary: true, action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-framing', choice: 'Standard Aluminum' } },
        { label: 'Thermally Broken', action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-framing', choice: 'Thermally Broken' } },
        { label: 'Frameless / Minimal', action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-framing', choice: 'Frameless / Minimal' } },
        { label: 'Stainless / Architectural', action: { kind: 'advance', next: 'commercial-scope', choiceCategory: 'com-framing', choice: 'Stainless / Architectural' } },
      ],
    },
    'commercial-scope': {
      id: 'commercial-scope',
      agent: 'Last design-intake item: what is the approximate scale or stage? This routes review, submittals, and site coordination without asking project type again.',
      chips: [
        { label: 'Small / Repair', primary: true, action: { kind: 'advance', next: 'commercial-process', choiceCategory: 'com-scope', choice: 'Small / Repair' } },
        { label: 'Medium Build-Out', action: { kind: 'advance', next: 'commercial-process', choiceCategory: 'com-scope', choice: 'Medium Build-Out' } },
        { label: 'Full Storefront', action: { kind: 'advance', next: 'commercial-process', choiceCategory: 'com-scope', choice: 'Full Storefront' } },
        { label: 'Curtain Wall', action: { kind: 'advance', next: 'commercial-process', choiceCategory: 'com-scope', choice: 'Curtain Wall / Multi-Story' } },
      ],
    },
    'commercial-process': {
      id: 'commercial-process',
      agent: 'Here is the project path: scope review, code and submittals, system specification, fabrication planning, then install and punchlist. Ready to send this to the team?',
      chips: [{ label: 'Prepare commercial quote', primary: true, action: { kind: 'advance', next: 'commercial-contact' } }],
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
      agent: (ctx) => {
        const service = activeChatService(ctx.choices);
        const brief = service === 'showers'
          ? 'shower concept, rendering brief, and project notes'
          : service === 'railings'
            ? 'railing project brief and notes'
            : 'commercial glass project brief and notes';
        return `All set${ctx.choices.name ? ', ' + ctx.choices.name.split(' ')[0] : ''}. Your ${brief} are ready for staff review. You can save the proposal from the main screen.`;
      },
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
  push('Project stage', 'timeline');
  push('Notes', 'notes');

  const selectionRows: Array<[string, string]> = [];
  const pushSel = (label: string, key: string) => {
    if (choices[key] && choices[key] !== 'none') selectionRows.push([label, choices[key]]);
  };
  pushSel('Enclosure', 'enclosure');
  pushSel('Glass', 'glass');
  pushSel('Hardware', 'hardware');
  pushSel('Handle', 'handle');
  pushSel('Door guidance', 'doorPlacement');
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

function injectPhotoUploadUI(ctx: ChatContext): void {
  const container = document.getElementById('chat-extras');
  if (!container) return;
  container.innerHTML = '';

  const existing = getBathroomPhoto();
  const email = ctx.choices.email || loadUser()?.email || '';

  const wrap = document.createElement('div');
  wrap.className = 'chat-photo-upload';
  wrap.innerHTML = `
    ${
      existing
        ? `
        <div class="chat-photo-preview">
          <img src="${existing.dataUrl}" alt="Your bathroom">
          <button type="button" class="chat-photo-clear" aria-label="Remove photo">\u2715</button>
        </div>
        <p class="chat-photo-note">Got it - this bathroom photo will become the base image for your rendering.</p>
      `
        : `
        <label class="chat-photo-dropzone" for="chat-photo-input">
          <span class="chat-photo-icon" aria-hidden="true">\u{1F4F7}</span>
          <span class="chat-photo-label-main">Upload a photo of your bathroom</span>
          <span class="chat-photo-label-sub">JPG, PNG, or HEIC - max 10MB</span>
        </label>
        <input type="file" id="chat-photo-input" accept="image/*" capture="environment" hidden>
      `
    }
    <div class="chat-photo-email-row">
      <label>Email for the rendering/proposal
        <input type="email" id="chat-photo-email" value="${escape(email)}" placeholder="you@example.com">
      </label>
      <p class="chat-photo-email-note">Required if you use your photo. Optional if you are just browsing.</p>
    </div>
    <div class="chat-photo-actions">
      <button type="button" class="chat-photo-action primary" id="chat-photo-continue">${existing ? 'Use photo + continue' : 'Continue without photo'}</button>
      <button type="button" class="chat-photo-action" id="chat-photo-skip">Skip photo for now</button>
    </div>
  `;
  container.appendChild(wrap);

  const emailInput = document.getElementById('chat-photo-email') as HTMLInputElement | null;
  const saveEmail = (required: boolean): boolean => {
    const value = emailInput?.value.trim() || '';
    if (!value) {
      if (required && emailInput) emailInput.classList.add('invalid');
      return !required;
    }
    if (!/\S+@\S+\.\S+/.test(value)) {
      emailInput?.classList.add('invalid');
      ctx.addAgent('That email looks off. Add a valid email, or skip the photo and keep browsing.');
      return false;
    }
    ctx.choices.email = value;
    saveUser({ email: value });
    emailInput?.classList.remove('invalid');
    return true;
  };

  document.getElementById('chat-photo-input')?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBathroomPhoto(dataUrl);
      ctx.choices.photoSource = 'customer_upload';
      injectPhotoUploadUI(ctx);
    } catch (err) {
      console.warn('[Chat] Photo upload failed:', err);
    }
  });

  wrap.querySelector('.chat-photo-clear')?.addEventListener('click', () => {
    clearBathroomPhoto();
    delete ctx.choices.photoSource;
    injectPhotoUploadUI(ctx);
  });

  document.getElementById('chat-photo-continue')?.addEventListener('click', () => {
    const hasPhoto = !!getBathroomPhoto();
    if (!saveEmail(hasPhoto)) return;
    ctx.addUser(hasPhoto ? 'Use my bathroom photo' : 'Continue without photo');
    if (hasPhoto) {
      ctx.addAgent('Great - I will use your bathroom photo as the base image. One quick placement cue will help keep the hinges, door, and handle realistic.');
      setTimeout(() => ctx.goToStep('showers-photo-guidance'), 350);
    } else {
      setTimeout(() => ctx.goToStep('showers-gallery'), 250);
    }
  });

  document.getElementById('chat-photo-skip')?.addEventListener('click', () => {
    clearBathroomPhoto();
    delete ctx.choices.photoSource;
    saveEmail(false);
    ctx.addUser('Skip photo for now');
    setTimeout(() => ctx.goToStep('showers-gallery'), 250);
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
    <div class="chat-form-row">
      <label>Project stage<select name="timeline">
        <option value="">Select</option>
        <option>Ready for field measure</option>
        <option>Remodel in progress</option>
        <option>Planning layout</option>
        <option>Just exploring</option>
      </select></label>
    </div>
    <div class="chat-form-row">
      <label>Notes<textarea name="notes" rows="3" placeholder="Measurements, swing concerns, tile plans, or anything staff should know"></textarea></label>
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
        this.ctx.choices.service = action.service;
        await handleToolCall('select_service', { service: action.service });
        // Let the morph land first; Alex asks about the photo as a step,
        // so the upload card only appears if the customer opts in.
        const nextId = action.service === 'showers' ? 'showers-intro'
          : action.service === 'railings' ? 'railings-intro' : 'commercial-intro';
        setTimeout(() => this.goToStep(nextId), 400);
        break;
      }
      case 'open-photo': {
        const { openPhotoPrompt } = await import('../sections/photo-prompt');
        const hasPhoto = await openPhotoPrompt({ timeoutMs: 150_000 });
        if (hasPhoto) this.ctx.choices.photoSource = 'customer_upload';
        const next = hasPhoto ? 'showers-photo-guidance' : 'showers-gallery';
        setTimeout(() => this.goToStep(next), 250);
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
            injectLockOverlay(activeChatService(this.ctx.choices));
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
          notes: this.ctx.choices.notes,
          preferredMode: 'chat',
          lastQuote: {
            service: activeChatService(this.ctx.choices),
            enclosure: this.ctx.choices.enclosure || this.ctx.choices['rail-type'] || this.ctx.choices['com-type'],
            glass: this.ctx.choices.glass || this.ctx.choices['rail-glass'] || this.ctx.choices['com-glass'],
            hardware: this.ctx.choices.hardware || this.ctx.choices['rail-finish'] || this.ctx.choices['com-framing'],
            handle: this.ctx.choices.handle || this.ctx.choices['rail-mounting'] || this.ctx.choices['com-scope'],
            accessories: this.ctx.choices.accessories,
            extras: this.ctx.choices.extras,
            doorPlacement: this.ctx.choices.doorPlacement,
            photoSource: this.ctx.choices.photoSource,
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
      const userBathroom = getBathroomPhoto();
      const contextNote = `You are Alex, a glass specialist at Precision Glass. The customer is on step "${currentStepId}" of a guided shower tour. They just asked: "${text}".

Known selections so far: ${JSON.stringify(this.ctx.choices)}.
${userBathroom ? 'A customer bathroom photo is attached. You may use visible clues from the photo to give practical guidance, but be honest when something requires a field measure.' : 'No customer bathroom photo is attached yet.'}

Give a brief 1-2 sentence helpful reply. If giving layout advice, think like a seasoned shower installer: door swing clearance, hinge side, fixed panel support, curb/threshold, plumbing wall, and avoiding conflicts with vanities/toilets/towel bars. Do not give pricing or a firm timeline. Redirect them back to the current options so the flow can continue. Do NOT claim to have submitted anything. Do NOT call any tools.`;

      const parts: any[] = [{ text: contextNote }];
      if (userBathroom) {
        const [mime, b64] = userBathroom.dataUrl.replace(/^data:/, '').split(';base64,');
        parts.push({ inlineData: { mimeType: mime, data: b64 } });
      }

      const body = {
        contents: [{ role: 'user', parts }],
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
    'railings-mounting': 'rail-mounting',
    'railings-process': 'process',
    'railings-contact': 'quote',
    'commercial-intro': 'intro',
    'commercial-type': 'com-types',
    'commercial-glass': 'com-glass',
    'commercial-framing': 'com-framing',
    'commercial-scope': 'com-scope',
    'commercial-process': 'process',
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
  renderQuoteVisuals(choices);
}

function injectLockOverlay(service: ServiceChoice = activeChatService()): void {
  const wrap = document.querySelector('.ss-quote-img-wrap') as HTMLElement | null;
  if (!wrap) return;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (spinner) spinner.style.display = 'none';
  if (wrap.querySelector('.ss-quote-lock')) return;
  const isShower = service === 'showers';
  const lock = document.createElement('div');
  lock.className = 'ss-quote-lock';
  lock.innerHTML = `
    <div class="ss-quote-lock-sparkle">\u2728</div>
    <div class="ss-quote-lock-title">${isShower ? 'Your free AI rendering is ready' : 'Your project brief is ready'}</div>
    <div class="ss-quote-lock-desc">${isShower
      ? 'One last step - share your contact details and we will unlock a photorealistic AI preview of <strong>your exact configuration</strong>. Yours to keep, no strings.'
      : 'One last step - share your contact details and we will package these selections into a project brief for staff review. Pricing and scheduling stay with the human team.'}</div>
  `;
  wrap.appendChild(lock);
}

function unlockAndGenerateViz(choices: Record<string, string>): void {
  const service = activeChatService(choices);
  const lock = document.querySelector('.ss-quote-lock') as HTMLElement | null;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (lock) lock.remove();
  if (spinner) {
    spinner.style.display = 'flex';
    const label = spinner.querySelector('span');
    if (label) label.textContent = service === 'showers' ? 'Rendering your custom shower\u2026' : 'Preparing your project brief\u2026';
  }

  // Only generate for shower flows
  if (service !== 'showers') {
    markQuoteRenderReady(service === 'railings' ? '/images/railings/railings-1.webp' : '/images/commercial/commercial-1.webp');
    return;
  }
  generateShowerImage(choices).then((url) => {
    if (!url) return;
    markQuoteRenderReady(url);
    // Persist to the customer-generations gallery (fire and forget)
        saveCustomerGeneration(url, {
      service,
      enclosure: choices.enclosure,
      glass: choices.glass,
      hardware: choices.hardware,
      handle: choices.handle,
      accessories: choices.accessories,
      extras: choices.extras,
      doorPlacement: choices.doorPlacement,
      photoSource: choices.photoSource,
      customerName: choices.name,
      customerEmail: choices.email,
      mode: 'chat',
    });
  }).catch((err) => console.warn('[Chat] viz gen failed:', err));
}
