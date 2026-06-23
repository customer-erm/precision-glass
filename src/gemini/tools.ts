import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow, showQuoteSent, showBuyerGuidePopup, getActiveService, getCurrentSlideId, renderQuoteVisuals, markQuoteRenderReady } from '../experience/facade';
import { emitChoice, emitPreview } from '../experience/events';
import { isCinematic } from '../experience/flag';
import { extrasCompat } from '../experience/compat';
import { setState, getState } from '../utils/state';
import { generateShowerImage } from './image-gen';
import { saveCustomerGeneration } from '../utils/save-generation';
import { saveUser } from '../utils/user-storage';
import type { ServiceType } from '../utils/state';
import { getBathroomPhotoAnalysis } from '../utils/bathroom-photo';
import { analyzeBathroomPhoto } from './photo-analysis';

/* ------------------------------------------------------------------ */
/*  Quote state                                                        */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};
let pendingImageUrl: string | null = null;
let pendingImagePromise: Promise<string | null> | null = null;
let presentQuoteAt = 0;

// Track timing of show_slide calls to detect / block auto-advance hallucinations.
// We only enforce a minimum interval between calls — relying on transcription
// turned out to be fragile (short replies like an email address don't always
// produce an inputTranscription event, which would falsely block legitimate
// advances).
let lastShowSlideAt = 0;
const MIN_SLIDE_INTERVAL_MS = 900;
const TOUR_OPTION_SLIDES = new Set([
  'gallery',
  'enclosures',
  'glass',
  'hardware',
  'accessories',
  'extras',
  'process',
  'quote',
  'rail-types',
  'rail-glass',
  'rail-finish',
  'rail-mounting',
  'com-types',
  'com-glass',
  'com-framing',
  'com-scope',
]);

function startPendingShowerRender(): void {
  if (pendingImageUrl || pendingImagePromise) return;
  const snapshot = { ...quoteChoices };
  pendingImagePromise = generateShowerImage(snapshot)
    .then((url) => {
      pendingImageUrl = url;
      return url;
    })
    .catch((err) => {
      console.warn('[ImageGen] Background render failed:', err);
      return null;
    })
    .finally(() => {
      pendingImagePromise = null;
    });
}

/**
 * Defensive: the agent may legitimately jump straight into the tour (e.g.
 * a returning customer says "show me my shower again") without having
 * called select_service. If no slideshow exists yet, build it first so
 * the page always responds visibly to the conversation.
 */
async function ensureSlideshow(service?: 'showers' | 'railings' | 'commercial'): Promise<void> {
  if (document.getElementById('tour-slideshow')) return;
  const svc = service || (getState().currentService as 'showers' | 'railings' | 'commercial' | null) || 'showers';
  setState({ currentService: svc, isTransformed: true });
  await playTransformAnimation();
  createSlideshow(svc);
}

export const TOOL_DECLARATIONS = [
  {
    name: 'select_service',
    description: 'Start the guided tour for a service. Transforms the page into a cinematic slideshow.',
    parameters: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string' as const,
          enum: ['showers', 'railings', 'commercial'],
        },
        customer_name: { type: 'string' as const, description: 'Customer name if known' },
        email: { type: 'string' as const, description: 'Customer email if known' },
      },
      required: ['service'],
    },
  },
  {
    name: 'show_slide',
    description: 'Advance to the next slide. Include the customer\'s preference from the current slide.',
    parameters: {
      type: 'object' as const,
      properties: {
        slide_id: {
          type: 'string' as const,
          description: 'The next slide id. Showers flow: enclosures, glass, hardware, accessories, extras, process. Railings flow: gallery, rail-types, rail-glass, rail-finish, rail-mounting, process. Commercial flow: gallery, com-types, com-glass, com-framing, com-scope, process.',
        },
        choice: {
          type: 'string' as const,
          description: 'Customer\'s preference from the current slide',
        },
        email: {
          type: 'string' as const,
          description: 'Customer email if they provided it for the buyer\'s guide',
        },
        customer_name: {
          type: 'string' as const,
          description: 'Customer name once they have told it to you',
        },
        accessories: {
          type: 'string' as const,
          description: 'Optional add-on accessories the customer chose alongside their handle (e.g. "robe hook"). Comma-separated. Towel bar combo is a handle choice, not a separate add-on. Use only when advancing past the accessories slide.',
        },
      },
      required: ['slide_id'],
    },
  },
  {
    name: 'present_quote',
    description: 'Show the quote summary with all selections plus an AI-generated visualization. Agent should continue talking after this.',
    parameters: {
      type: 'object' as const,
      properties: {
        enclosure: { type: 'string' as const },
        glass: { type: 'string' as const },
        hardware: { type: 'string' as const },
        handle: { type: 'string' as const },
        accessories: { type: 'string' as const, description: 'Add-on accessories like a robe hook. Comma-separated. Towel bar combo should usually be the handle choice.' },
        extras: { type: 'string' as const },
        customer_name: { type: 'string' as const, description: 'Customer name if known' },
        email: { type: 'string' as const, description: 'Customer email if known' },
      },
      required: ['enclosure', 'glass', 'hardware'],
    },
  },
  {
    name: 'show_buyers_guide',
    description: 'Display the small Buyer\'s Guide popup on screen. Call this in the SAME turn that you offer the free buyer\'s guide to the customer (right before or as you ask for their email), so the popup appears alongside your offer.',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'show_topic',
    description: "Surface a large on-screen content modal to visually answer a question or highlight a topic with images from our library. Use this when the customer asks about something outside the main tour flow — e.g. \"show me some matte black installs\", \"what do steam showers look like\", or \"show me pool-deck railings\". You write the title and body (keep body to 1-3 short paragraphs). Specify image_tags (keywords like 'matte-black', 'frosted-glass', 'steam', 'neo-angle', 'railings', 'storefront') and the system will pull the most relevant images from our library. This is a spontaneous teaching moment — it does NOT advance the tour and does NOT replace show_slide.",
    parameters: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, description: 'Short heading shown at top of the modal' },
        body: { type: 'string' as const, description: '1-3 short paragraphs of supporting copy. Supports **bold** and *italic*.' },
        image_tags: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Keywords to find relevant images (e.g. ["matte black", "hardware"], ["frosted glass"], ["neo-angle", "corner"], ["steam shower"], ["railings", "pool deck"], ["storefront"]). The system scores each image in the library against these.',
        },
        primary_cta_label: { type: 'string' as const, description: 'Optional CTA button label. Defaults to "Start a quote".' },
        primary_cta_action: {
          type: 'string' as const,
          enum: ['open_contact', 'launch_voice', 'launch_chat', 'close'],
          description: 'What the primary CTA button does. Default: open_contact.',
        },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'request_photo_upload',
    description: 'Open the bathroom-photo upload card on screen. Call this ONLY after the customer has said YES to adding a photo. The call blocks until they finish (upload, skip, or a 2.5-minute timeout) and the result tells you what happened. While the card is open their mic is paused, so wait for the result before speaking.',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'preview_option',
    description: 'Live-preview an option on the on-screen 3D model while you talk. Showers: enclosure/glass/hardware/handle/accessories/extras. Railings: rail-type/rail-glass/rail-finish/rail-mounting. Commercial: com-type/com-glass/com-framing/com-scope. It does NOT record a selection and does NOT advance the tour.',
    parameters: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string' as const,
          enum: ['enclosure', 'glass', 'hardware', 'handle', 'accessories', 'extras', 'rail-type', 'rail-glass', 'rail-finish', 'rail-mounting', 'com-type', 'com-glass', 'com-framing', 'com-scope'],
        },
        value: {
          type: 'string' as const,
          description: 'The option to preview, e.g. "Frosted Glass", "Matte Black", "Frameless Slider", "Ladder Pull", "Grid Patterns", "Steam Upgrade"',
        },
      },
      required: ['category', 'value'],
    },
  },
  {
    name: 'set_camera_view',
    description: 'Move the 3D camera around the active model for emphasis — e.g. "let me get you a closer look". Use sparingly.',
    parameters: {
      type: 'object' as const,
      properties: {
        view: {
          type: 'string' as const,
          enum: ['front', 'side', 'closeup', 'overview'],
        },
      },
      required: ['view'],
    },
  },
  {
    name: 'end_session',
    description: 'Cleanly end the voice session after saying goodbye. Call this ONLY after your final goodbye message.',
    parameters: {
      type: 'object' as const,
      properties: {
        customer_name: { type: 'string' as const, description: 'Customer name if known' },
        email: { type: 'string' as const, description: 'Customer email if known' },
        phone: { type: 'string' as const, description: 'Customer phone number if provided' },
        address: { type: 'string' as const, description: 'Customer street address/city/state if provided' },
        location: { type: 'string' as const, description: 'Customer city/area if provided' },
        timeline: { type: 'string' as const, description: 'Project stage if provided' },
        budget: { type: 'string' as const, description: 'Estimated budget range if provided' },
        notes: { type: 'string' as const, description: 'Optional project notes, constraints, or staff-review context if provided' },
      },
      required: [],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Slide context                                                      */
/* ------------------------------------------------------------------ */

const SLIDE_CONTEXT_BY_SERVICE: Record<'showers' | 'railings' | 'commercial', Record<string, string>> = {
  showers: {
  intro: `The page has morphed into the design studio — a glowing 3D blueprint of a shower is on the stage. Introduce yourself as Alex, their shower designer. In 2 punchy sentences: frameless glass transforms a bathroom, and the final visualization can use their selections with an optional bathroom photo. THEN ask ONE question: would they like to add a photo of their bathroom so you can tailor everything to their space and render their new shower into it at the end? WAIT for their answer.
- If YES: say one short sentence like "Perfect — I'm putting the upload card on screen now, take your time", then call request_photo_upload() and follow the instructions it returns.
- If NO or they hesitate: totally fine, don't push. Ask if they're ready to look at the layout options together, and when they agree call show_slide("enclosures"). Do not open or mention recent work.`,

  gallery: `Recent installations are cycling beside the 3D model. Keep this BRISK — 2 sentences max about the work (custom-fit, everything from compact alcoves to luxury spa builds). THEN ask for the email in a single clear sentence: "I'd also love to send you our free frameless shower buyer's guide — can I grab your email?" Then STOP completely and wait silently. The buyer's guide popup will appear on screen automatically while you're talking — you do not need to call any tool for it. If they give an email, call show_slide("enclosures") with the email parameter and customer_name parameter (if you have it). If they decline, just call show_slide("enclosures").`,

  enclosures: `The enclosure styles are fading in one by one beside the 3D model. REQUIRED FIRST SPOKEN SENTENCE, EXACTLY: "Notice the icons next to each option. You can click those to get more details or just ask me about them." Do not skip or paraphrase that sentence. If a bathroom photo or placement cue exists, examine the visible opening like an installer before recommending anything: alcove/tub-to-shower openings usually mean Single Door, Door + Panel, or Frameless Slider; do NOT recommend Neo-Angle or 90° Corner unless a true corner stall footprint is visible. Then pace your description to roughly match (one style at a time, top to bottom): Single Door (compact wall-to-wall shower-stall door), Door + Panel (wider alcove openings), Neo-Angle (corner-saving diamond), 90° Corner (two panels meeting at a right angle), Frameless Slider (no swing room needed), Splash Panel (open walk-in, just a fixed panel), and Steam Shower (sealed floor-to-ceiling). Mention the most popular are Single Door and Door + Panel, and that arched tops and fully custom layouts are available too — just ask. Do not offer curved glass in this flow for now. If they ask what a style would look like or are deciding between two, call preview_option(category "enclosure") to assemble that style on the model while you talk. Ask which style works for their space. WAIT. Call show_slide("glass") with their choice.`,

  glass: `Three common glass types are shown. Describe all three: Clear Glass — bestseller, crystal clear, shows your tilework. Frosted Glass — acid-etched for privacy, still lets light through. Rain Glass — textured water-droplet pattern, artistic privacy. Verbally mention that other glass styles and privacy patterns can be discussed on request. If they ask what one looks like, call preview_option(category "glass") — the 3D model's glass morphs live, which is a great "watch this" moment. Ask which appeals to them. WAIT. Call show_slide("hardware") with their choice.`,

  hardware: `Five hardware finishes are fading in beside the model. ONE sentence on what hardware means (the hinges, clips, brackets, rollers, and handles that hold the glass — finished to match the bathroom's faucets and fixtures), then name the five finishes briskly: Polished Chrome (timeless, most popular), Brushed Nickel (warm, hides water spots), Matte Black (bold modern), Polished Brass (classic luxury), Satin Brass (soft gold, on-trend). Verbally mention that additional specialty finishes and hardware styles can be reviewed on request. If they're comparing, call preview_option(category "hardware") to re-plate the model live — one, then the other. Ask which finish complements their bathroom. STOP and wait. Call show_slide("accessories") with their choice.`,

  accessories: `Handle and accessory options are fading in beside the model. Quickly name the HANDLES: Pull (most popular), U-Handle (classic), Ladder Pull (design statement), Knob (minimal), and Towel Bar combo (outside pull with inside towel rail) — then in one sentence the optional add-ons: robe hook and fixed-panel support/stabilizer bar. Ask which handle they'd like AND whether they want any add-ons. WAIT for the full answer. If they mention multiple things (e.g. "u-handle with robe hook and support bar"), capture the handle in the "choice" parameter and the add-ons in the "accessories" parameter as a comma-separated string. If they choose towel bar, save it as the handle choice, not as an accessory. If they ask what a handle looks like, call preview_option(category "handle") to swap it onto the 3D model's door. If they ask about robe hooks or support bars, call preview_option(category "accessories") with the add-ons so they appear in addition to the handle. Call show_slide("extras") with both choice (the handle) and accessories (the add-ons, or omit if none).`,

  extras: `Two premium upgrades shown. Describe both: Decorative Grid Patterns — French, colonial, or custom grids on the glass for architectural character. Steam Shower — fully sealed floor-to-ceiling glass for a spa experience. Make it explicit that they can choose Grid only, Steam only, BOTH, or neither. They can also click the cards on/off: grid only, steam only, both selected, or no cards selected all count. If they ask what one looks like, call preview_option(category "extras") with "Grid Patterns", "Steam Upgrade", "Grid Patterns + Steam Upgrade", or "none" so the model updates immediately. Ask which of the four choices they want. WAIT. Then ALWAYS call show_slide("process") with the exact choice: "Grid Patterns", "Steam Upgrade", "Grid Patterns + Steam Upgrade", or "none" if they decline or turn both options off. NEVER skip the process step.`,

  process: `Five process steps are shown and the AI visualization is now generating in the background. Do not rush this slide and do not say the visualization is complete yet. Walk through each step with useful detail: 1) Proposal Review — the team reviews the selected layout, glass, hardware, uploaded photo or site notes, and any clearance concerns before treating it like a real project. 2) Precision Measuring — a specialist verifies wall plumb, curb level, tile condition, out-of-square openings, door swing, and every fraction of an inch before glass is ordered. 3) Glass Ordering — panels are custom cut, polished, drilled for hardware, and tempered only after field measurements are confirmed. 4) Installation Planning — the team confirms hardware, access, protection, scheduling, and any constraints around vanities, toilets, fixtures, or steam sealing. 5) Enjoy — the final install should feel clean, solid, and easy to live with. Then say the visualization is still finishing from their selections. Ask if they have any questions before reviewing their configuration. WAIT. Only after they are ready, call present_quote() with all their selections: enclosure, glass, hardware, handle, accessories, extras.`,
  },

  railings: {
    intro: `A dramatic glass railing image fills the screen. Pitch architectural glass railings — they completely transform a deck, balcony, stair, or pool surround. The view is unobstructed, the look is modern and clean, and they're built marine-grade for South Florida weather. Ask if they'd like you to walk through the options. WAIT. When they agree, call show_slide("gallery").`,
    gallery: `A slideshow of recent railing installs is cycling. Take 3-4 sentences describing the variety — pool surrounds, stair runs, balcony cap rails, multi-level decks — and the craftsmanship. Then ask if they have a project in mind, and where it would be (deck, stair, pool, balcony). WAIT for their answer. Call show_slide("rail-types").`,
    'rail-types': `Four railing systems are listed: Frameless Glass Panel, Standoff Glass, Posted Glass, Cable Rail. Walk through each in 1-2 sentences, mention frameless is the most popular for residential modern builds, posted/cable is more common for elevated decks. Ask which appeals to them. WAIT. Call show_slide("rail-glass") with their choice.`,
    'rail-glass': `Glass type and thickness options shown: Clear Tempered, Low-Iron Ultra-Clear, Tinted, Frosted. Describe each briefly, mention low-iron is the upgrade for waterfront and pools because it removes the green tint. Ask which they'd like. WAIT. Call show_slide("rail-finish") with their choice.`,
    'rail-finish': `Hardware finishes: Polished Stainless 316, Brushed Satin Stainless, Matte Black Aluminum, Bronze/Champagne. Mention everything is marine grade for salt air. Ask which finish suits their home. WAIT. Call show_slide("rail-mounting") with their choice.`,
    'rail-mounting': `Mounting options: Top Mount, Side/Fascia Mount, Core-Drilled, Embedded Shoe. Briefly explain each — top mount is most common, fascia frees up walking space, embedded shoe is the cleanest premium look. Ask which works best for their substrate (concrete, wood, steel). WAIT. Call show_slide("process") with their choice.`,
    process: `Five process steps. Walk through with enthusiasm: 1) Proposal Review — design and engineering notes captured. 2) Site Measure — laser-accurate measurements of every post location. 3) Fabrication — custom-cut tempered glass and marine-grade hardware after verification. 4) Installation Planning — licensed crew confirms anchors, seals, and access needs. 5) Enjoy — your new view, code-compliant and built to last. Ask if they have questions before reviewing their configuration. WAIT. Call present_quote() with their selections (enclosure parameter = railing system, glass = glass type, hardware = finish, handle = mounting style).`,
  },

  commercial: {
    intro: `A commercial glass image fills the screen. Introduce the commercial side of Precision Glass in 2-3 sentences: licensed commercial glazing, storefronts, curtain walls, office partitions, doors, code/submittal review. Explain that the flow will ask for one project category, then glass performance, framing, and scale. Ask if they want to start with examples. WAIT. When they agree, call show_slide("gallery").`,
    gallery: `Commercial portfolio cycling on screen. Briefly describe the examples on screen: retail storefronts, restaurant entries, office buildouts, and curtain wall work. Do not ask project type yet; tell them the next step will choose the category. Call show_slide("com-types") when they are ready.`,
    'com-types': `Four project type categories are shown: Storefront System, Curtain Wall, Interior Partitions, Doors & Hardware. This is the single project-type question. Walk through each briefly, mention storefront is the common starting point for retail and small commercial entries. Ask which category best matches the job. WAIT. Call show_slide("com-glass") with their choice.`,
    'com-glass': `Glass spec options: Clear Insulated (IGU), Low-E Coated, Hurricane/Impact Rated, Tinted/Spandrel/Frosted. CRITICAL — anywhere in South Florida HVHZ requires impact rated, mention this. Ask what their performance and code needs are. WAIT. Call show_slide("com-framing") with their choice.`,
    'com-framing': `Framing system options: Standard Aluminum, Thermally Broken, Frameless/Minimal, Stainless/Architectural. Briefly explain each, mention thermally broken for energy code on new builds. Ask which suits the look, code needs, and performance goals. WAIT. Call show_slide("com-scope") with their choice.`,
    'com-scope': `Scale tiers are shown: Small/Repair, Medium Build-Out, Full Storefront, Curtain Wall/Multi-Story. Do not ask project type again. Ask for approximate scale or stage so the team can route review, submittals, and site coordination correctly. WAIT. Call show_slide("process") with their choice.`,
    process: `Five process steps. Walk through with enthusiasm tailored to commercial: 1) Proposal & Engineering Review — drawings, specs, and code needs captured. 2) Permit & Submittals — the team reviews city, NOA, and shop drawing needs. 3) Fabrication Planning — custom aluminum extrusions and tempered/laminated glass after verification. 4) Installation Planning — licensed crew confirms access, sealants, and hardware. 5) Final Walkthrough & Punchlist — every detail signed off. Ask if they have questions. WAIT. Call present_quote() with their selections (enclosure = project type, glass = glass spec, hardware = framing system, handle = scope/project stage).`,
  },
};

function loadUserName(): string {
  try {
    const raw = localStorage.getItem('precision-glass-user');
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed?.name as string) || '';
  } catch {
    return '';
  }
}

function getSlideContext(slideId: string): string {
  const ctx = SLIDE_CONTEXT_BY_SERVICE[getActiveService()];
  let msg = ctx?.[slideId] || 'Slide is showing.';
  if (getActiveService() === 'showers' && slideId === 'intro') {
    return 'The page has morphed into the shower designer. Introduce yourself as Alex, explain that you can use their selections and an optional bathroom photo to create the final visualization, then actively ask: "Would you like to upload a bathroom photo first so the final visualization can reflect your own space?" WAIT. If YES, call request_photo_upload(). If NO, say no problem and ask if they are ready to choose the enclosure layout; when they agree, call show_slide("enclosures"). Do not explain the step-by-step process yet, and do not open or mention recent work.';
  }
  if (getActiveService() === 'showers' && slideId === 'gallery' && (quoteChoices.email || getState().customerEmail)) {
    msg += ' You already have their email, so do NOT ask for it again; mention you can send the buyer guide and visualization there, then continue to enclosure styles.';
  }
  return msg;
}

/* ------------------------------------------------------------------ */
/*  Quick-reply options for chat mode                                  */
/* ------------------------------------------------------------------ */

const SLIDE_QUICK_REPLIES_BY_SERVICE: Record<'showers' | 'railings' | 'commercial', Record<string, string[]>> = {
  showers: {
    intro: ['Choose layout', 'Add a photo first'],
    enclosures: ['Single Door', 'Door + Panel', 'Neo-Angle', '90\u00B0 Corner', 'Frameless Slider', 'Splash Panel', 'Steam Shower'],
    glass: ['Clear Glass', 'Frosted Glass', 'Rain Glass'],
    hardware: ['Polished Chrome', 'Brushed Nickel', 'Matte Black', 'Polished Brass', 'Satin Brass'],
    accessories: ['Pull Handle', 'U-Handle', 'Ladder Pull', 'Knob', 'Towel Bar', 'Robe Hook', 'None, thanks'],
    extras: ['Grid Patterns', 'Steam Upgrade', 'Both', 'Neither'],
    process: ['No questions, let\u2019s see it', 'What\u2019s the timeline?', 'How does installation work?'],
  },
  railings: {
    intro: ['Yes, show me', 'Tell me about Precision Glass'],
    gallery: ['Show me the options', 'Skip ahead'],
    'rail-types': ['Standoff Mount', 'Base Shoe', 'Posts & Clips', 'Pool Fence'],
    'rail-glass': ['Clear Tempered', 'Laminated Safety', 'Tinted / Privacy'],
    'rail-finish': ['Stainless', 'Matte Black', 'Bronze', 'Brushed Nickel'],
    'rail-mounting': ['Surface Mount', 'Fascia Mount', 'Core-Drilled'],
    process: ['No questions', 'Tell me about permits'],
  },
  commercial: {
    intro: ['Yes, walk me through', 'Just a few questions first'],
    gallery: ['Let\u2019s get specific', 'Who do you usually work with?'],
    'com-types': ['Storefront System', 'Curtain Wall', 'Interior Partitions', 'Doors & Hardware'],
    'com-glass': ['Clear Insulated', 'Low-E Coated', 'Hurricane Rated', 'Tinted / Spandrel'],
    'com-framing': ['Standard Aluminum', 'Thermally Broken', 'Frameless / Minimal', 'Stainless Architectural'],
    'com-scope': ['Small / Repair', 'Medium Build-Out', 'Full Storefront', 'Curtain Wall / Multi-Story'],
    process: ['No questions', 'Do you handle permits?'],
  },
};

export function getQuickReplies(slideId: string): string[] {
  const svc = getActiveService();
  if (!svc) return [];
  const map = SLIDE_QUICK_REPLIES_BY_SERVICE[svc as 'showers' | 'railings' | 'commercial'];
  return map?.[slideId] || [];
}

// Wrap any instructional tool result so the model treats it as a private
// system note and never speaks any of it aloud.
function instr(text: string): string {
  return `[INTERNAL INSTRUCTION FOR THE AGENT — DO NOT READ ANY OF THE FOLLOWING TEXT OUT LOUD. This is a private stage cue, not dialogue. Use it only to decide what to say in your own words.]\n\n${text}`;
}

function injectQuoteLock(): void {
  const wrap = document.querySelector('.ss-quote-img-wrap') as HTMLElement | null;
  if (!wrap || wrap.querySelector('.ss-quote-lock')) return;
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (spinner) spinner.style.display = 'none';
  const lock = document.createElement('div');
  lock.className = 'ss-quote-lock';
  lock.innerHTML = `
    <div class="ss-quote-lock-sparkle">✨</div>
    <div class="ss-quote-lock-title">Rendering locked</div>
    <div class="ss-quote-lock-desc">Name and email are enough to generate and send the AI rendering.</div>
  `;
  wrap.appendChild(lock);
}

function unlockQuoteImageSlot(): void {
  document.querySelector('.ss-quote-lock')?.remove();
  const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement | null;
  if (spinner) {
    spinner.style.display = 'flex';
    const label = spinner.querySelector('span');
    if (label) label.textContent = 'Rendering your custom shower...';
  }
}

function choiceCategoryForSlide(nextSlideId: string): string | null {
  const byService: Record<'showers' | 'railings' | 'commercial', Record<string, string>> = {
    showers: {
      glass: 'enclosure',
      hardware: 'glass',
      accessories: 'hardware',
      extras: 'handle',
      process: 'extras',
    },
    railings: {
      'rail-glass': 'rail-type',
      'rail-finish': 'rail-glass',
      'rail-mounting': 'rail-finish',
      process: 'rail-mounting',
    },
    commercial: {
      'com-glass': 'com-type',
      'com-framing': 'com-glass',
      'com-scope': 'com-framing',
      process: 'com-scope',
    },
  };
  return byService[getActiveService()]?.[nextSlideId] || null;
}

/* ------------------------------------------------------------------ */
/*  Tool handler                                                       */
/* ------------------------------------------------------------------ */

export async function handleToolCall(
  name: string,
  args: Record<string, string>,
): Promise<{ success: boolean; message?: string }> {
  console.log(`[Tool Call] ${name}`, args);

  switch (name) {
    case 'select_service': {
      const service = args.service as 'showers' | 'railings' | 'commercial';
      pendingImageUrl = null;
      pendingImagePromise = null;
      if (args.customer_name) {
        quoteChoices['name'] = args.customer_name;
        setState({ customerName: args.customer_name });
      }
      if (args.email) {
        quoteChoices['email'] = args.email;
        setState({ customerEmail: args.email });
      }
      setState({ currentService: service, isTransformed: true });
      await playTransformAnimation();
      createSlideshow(service);
      const firstSlide = 'intro';
      await showSlide(firstSlide);
      lastShowSlideAt = 0; // reset guard for the new flow
      // The photo-upload card is no longer auto-opened — the agent offers it
      // and calls request_photo_upload only if the customer says yes.
      const msg = getSlideContext(firstSlide);
      return { success: true, message: instr(msg) };
    }

    case 'show_slide': {
      // Anti-hallucination guard: only applies to VOICE mode, because the
      // voice agent can stream multiple tool calls in a single turn due to
      // misfires. Chat and browse modes are user-driven (chip taps / button
      // clicks) so the guard would only cause false positives there.
      const mode = getState().currentMode;
      const isUserDriven = mode === 'chat' || mode === 'browse';
      const now = Date.now();
      const sinceLastSlide = now - lastShowSlideAt;
      if (!isUserDriven && lastShowSlideAt > 0 && sinceLastSlide < MIN_SLIDE_INTERVAL_MS) {
        console.warn('[Tour] Blocking rapid show_slide:', {
          slide_id: args.slide_id,
          sinceLastSlide,
        });
        return {
          success: false,
          message: instr(`That advance was blocked only because it came ${sinceLastSlide}ms after the previous one. If the customer really did make this choice, call show_slide AGAIN right now with the exact same arguments — it will succeed. Do not drop their selection.`),
        };
      }
      lastShowSlideAt = now;
      await ensureSlideshow();

      // Save email if provided
      if (args.email) {
        setState({ customerEmail: args.email });
        quoteChoices['email'] = args.email;
      }
      if (args.customer_name) {
        quoteChoices['name'] = args.customer_name;
        setState({ customerName: args.customer_name });
      }
      if (args.accessories) {
        quoteChoices['accessories'] = args.accessories;
        emitChoice('accessories', args.accessories);
        console.log('[Quote] Saved accessories:', args.accessories);
      }
      // Save choice from current slide
      let extrasSanitizedNote = '';
      let shouldPauseForUpgradePreview = false;
      if (args.choice) {
        const category = choiceCategoryForSlide(args.slide_id);
        if (category) {
          let value = args.choice;
          // Upgrades that don't apply to the chosen enclosure are stripped —
          // the proposal must never promise an impossible install.
          if (category === 'extras' && !/^(none|n\/a)$/i.test(value.trim())) {
            const compat = extrasCompat(quoteChoices['enclosure'] || '');
            const wantsGrid = /grid|both/i.test(value);
            const wantsSteam = /steam|both/i.test(value);
            const removed: string[] = [];
            if (wantsSteam && !compat.steam) removed.push(`the Steam upgrade (${compat.steamReason})`);
            if (wantsGrid && !compat.grid) removed.push(`Grid Patterns (${compat.gridReason})`);
            if (removed.length) {
              value = [wantsGrid && compat.grid && 'Grid Patterns', wantsSteam && compat.steam && 'Steam Upgrade']
                .filter(Boolean).join(', ') || 'none';
              extrasSanitizedNote = `NOTE: I removed ${removed.join(' and ')} from their selections because it is not compatible with their ${quoteChoices['enclosure']}. Gently tell the customer this in one friendly sentence and confirm the rest of their design is unaffected. `;
            }
          }
          quoteChoices[category] = value;
          emitChoice(category, value);
          shouldPauseForUpgradePreview = category === 'extras'
            && args.slide_id === 'process'
            && !/^(none|n\/a)$/i.test(value.trim());
          console.log('[Quote] Saved:', category, '=', value);
        }
      }

      // Walk-in / splash panel: no door, so no handle AND no extras (grid/steam don't apply).
      // Jump straight from hardware → process, marking handle and extras as N/A.
      // Showers flow only.
      let targetSlide = args.slide_id;
      const isShowers = getActiveService() === 'showers';
      if (isShowers && targetSlide === 'gallery') targetSlide = 'enclosures';
      const enclosureLower = (quoteChoices['enclosure'] || '').toLowerCase();
      const isWalkIn = isShowers && (enclosureLower.includes('splash') || enclosureLower.includes('walk'));
      if (isWalkIn && (targetSlide === 'accessories' || targetSlide === 'extras')) {
        console.log('[Tour] Walk-in/splash panel detected — skipping handle and extras');
        quoteChoices['handle'] = 'N/A';
        quoteChoices['extras'] = 'N/A';
        targetSlide = 'process';
      }
      try {
        const { closeContentModal } = await import('../sections/content-modal');
        closeContentModal();
      } catch {
        // Best-effort cleanup only.
      }
      if (shouldPauseForUpgradePreview && targetSlide === 'process') {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
      await showSlide(targetSlide);
      // Reassign so downstream logic uses the resolved slide
      args.slide_id = targetSlide;

      if (isShowers && args.slide_id === 'process') {
        startPendingShowerRender();
      }

      let msg = getSlideContext(args.slide_id);
      if (isWalkIn && targetSlide === 'process') {
        msg = `NOTE: This is a walk-in / splash panel layout — there is NO door, so we have skipped BOTH the handle/accessories step AND the grid/steam upgrades step (they don't apply). Do NOT mention handles or upgrades. Move directly into the process walkthrough. ` + msg;
      }
      // Arriving at the upgrades step: tell the agent what does NOT apply
      // to the chosen style (the cards are greyed out on screen too).
      if (isShowers && args.slide_id === 'extras') {
        const compat = extrasCompat(quoteChoices['enclosure'] || '');
        const notes: string[] = [];
        if (!compat.steam) notes.push(`The STEAM upgrade is NOT available with their ${quoteChoices['enclosure']} — ${compat.steamReason}. Its card is greyed out on screen. Do NOT offer steam; if they ask, explain why in one friendly sentence.`);
        if (!compat.grid) notes.push(`GRID PATTERNS are NOT available with their ${quoteChoices['enclosure']} — ${compat.gridReason}. The card is greyed out. Do NOT offer grids; if they ask, explain why briefly.`);
        if (notes.length) msg = `${notes.join(' ')} ` + msg;
        if (!compat.steam && !compat.grid) {
          msg += ' Since neither upgrade applies, keep this step to one short sentence and move on to show_slide("process").';
        }
      }
      if (extrasSanitizedNote) msg = extrasSanitizedNote + msg;
      return { success: true, message: instr(msg) };
    }

    case 'present_quote': {
      if (args.enclosure) quoteChoices['enclosure'] = args.enclosure;
      if (args.glass) quoteChoices['glass'] = args.glass;
      if (args.hardware) quoteChoices['hardware'] = args.hardware;
      if (args.handle) quoteChoices['handle'] = args.handle;
      if (args.accessories) quoteChoices['accessories'] = args.accessories;
      if (args.extras) quoteChoices['extras'] = args.extras;
      for (const k of ['enclosure', 'glass', 'hardware', 'handle', 'accessories', 'extras'] as const) {
        if (quoteChoices[k]) emitChoice(k, quoteChoices[k]);
      }
      if (args.customer_name) quoteChoices['name'] = args.customer_name;
      if (args.email) quoteChoices['email'] = args.email;

      // The customer's name must never be missing from their own proposal —
      // fall back through every place it may have been captured.
      if (!quoteChoices['name']) {
        const known = getState().customerName || loadUserName();
        if (known) quoteChoices['name'] = known;
      }

      // Walk-in/splash always wins over a stale value the agent may pass.
      const enclLower = (quoteChoices['enclosure'] || '').toLowerCase();
      if (enclLower.includes('splash') || enclLower.includes('walk')) {
        quoteChoices['handle'] = 'N/A';
        quoteChoices['extras'] = 'N/A';
      }

      // Final compatibility pass — the proposal never promises an
      // upgrade the chosen style can't physically take.
      const extrasVal = quoteChoices['extras'] || '';
      if (extrasVal && !/^(none|n\/a)$/i.test(extrasVal.trim())) {
        const compat = extrasCompat(quoteChoices['enclosure'] || '');
        const wg = /grid|both/i.test(extrasVal) && compat.grid;
        const ws = /steam|both/i.test(extrasVal) && compat.steam;
        quoteChoices['extras'] = [wg && 'Grid Patterns', ws && 'Steam Upgrade'].filter(Boolean).join(', ') || 'none';
      }

      await ensureSlideshow();
      await showSlide('quote');
      presentQuoteAt = Date.now();
      setTimeout(() => populateQuoteSummary(quoteChoices), 500);

      let renderReady = false;
      if (getActiveService() === 'showers') {
        const applyImage = (url: string) => {
          pendingImageUrl = url;
          markQuoteRenderReady(url);
          saveCustomerGeneration(url, {
            service: 'showers',
            enclosure: quoteChoices.enclosure,
            glass: quoteChoices.glass,
            hardware: quoteChoices.hardware,
            handle: quoteChoices.handle,
            accessories: quoteChoices.accessories,
            extras: quoteChoices.extras,
            doorPlacement: quoteChoices.doorPlacement,
            photoSource: quoteChoices.photoSource,
            customerName: quoteChoices.name,
            customerEmail: quoteChoices.email,
            mode: getState().currentMode === 'chat' ? 'chat' : 'voice',
          });
          renderReady = true;
        };
        try {
          const imgUrl = pendingImageUrl || await (pendingImagePromise || generateShowerImage(quoteChoices));
          if (imgUrl) applyImage(imgUrl);
        } catch (err) {
          console.warn('[ImageGen] Failed:', err);
        }
      } else {
        const heroSrc = getActiveService() === 'railings' ? '/images/railings/railings-1.webp' : '/images/commercial/commercial-1.webp';
        markQuoteRenderReady(heroSrc);
        renderReady = true;
      }

      const summary = Object.entries(quoteChoices)
        .filter(([k]) => ['enclosure', 'glass', 'hardware', 'handle', 'extras', 'rail-type', 'rail-glass', 'rail-finish', 'rail-mounting', 'com-type', 'com-glass', 'com-framing', 'com-scope'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      const visualLine = getActiveService() === 'showers'
        ? (renderReady ? 'The AI rendering is complete and visible on the right.' : 'The AI rendering could not complete automatically; the proposal can still be saved with the configuration and staff can follow up.')
        : 'A project reference image is shown on the right; no AI visualization is needed for this intake.';

      return {
        success: true,
        message: instr(`The quote summary is displayed showing: ${summary}. ${visualLine}

DO THE FOLLOWING IN ORDER:
1. Read back their selections enthusiastically - tell them their choices look great together.
2. Tell them the visualization is ready and tied to the email collected earlier if one is available.
3. Ask ONE optional-details question: whether they want to add an estimated budget range, project timeline/stage, measurements, or staff-review notes before you prepare the downloadable PDF. Make clear this is optional.
4. STOP and wait for their answer.
5. After they answer, call end_session() with customer_name, email, and any optional timeline, budget, phone, address, or notes they provide. Do not give pricing or promise a firm timeline.`),
      };

    }

    case 'show_buyers_guide': {
      showBuyerGuidePopup();
      return { success: true, message: instr('Buyer\'s guide popup is now visible on screen. Continue speaking — ask for their email naturally.') };
    }

    case 'show_topic': {
      const activeSlide = getCurrentSlideId();
      if (document.getElementById('tour-slideshow') && activeSlide && TOUR_OPTION_SLIDES.has(activeSlide)) {
        return {
          success: false,
          message: instr(`Do not open a content modal during the active guided tour. The customer is on "${activeSlide}" and likely just needs this option handled in-flow. If they selected an option, record it with show_slide. If they asked a question, answer briefly out loud and keep them on the current options.`),
        };
      }
      // Dynamically pull the content-modal module (it's already loaded in main)
      const { showTopic } = await import('../sections/content-modal');
      const title = String(args.title || '').trim() || 'Here you go';
      const body = String(args.body || '').trim();
      const image_tags = Array.isArray(args.image_tags)
        ? (args.image_tags as unknown as string[])
        : typeof args.image_tags === 'string'
        ? String(args.image_tags).split(',').map((s) => s.trim())
        : [];
      const primaryCtaLabel = args.primary_cta_label ? String(args.primary_cta_label) : undefined;
      const primaryCtaAction = args.primary_cta_action ? String(args.primary_cta_action) : undefined;
      showTopic({
        title,
        body,
        image_tags,
        primary_cta:
          primaryCtaLabel || primaryCtaAction
            ? {
                label: primaryCtaLabel || 'Start a quote',
                action: (primaryCtaAction as 'open_contact' | 'launch_voice' | 'launch_chat' | 'close') || 'open_contact',
              }
            : undefined,
      });
      return {
        success: true,
        message: instr(`A content modal is now showing on screen with the title "${title}" and ${image_tags.length ? 'relevant images from our library' : 'a default image selection'}. Briefly acknowledge that you pulled it up for them — one short sentence like "I've got some examples on screen for you" — then wait for them to engage or ask the next question. Do NOT read the modal body aloud.`),
      };
    }

    case 'request_photo_upload': {
      const { openPhotoPrompt } = await import('../sections/photo-prompt');
      // Pause the mic while the card is open — the customer may step away
      // to take a photo and we don't want to stream dead air to the API.
      window.dispatchEvent(new CustomEvent('precision:mic-pause'));
      let uploaded = false;
      try {
        uploaded = await openPhotoPrompt({ timeoutMs: 150_000 });
      } finally {
        window.dispatchEvent(new CustomEvent('precision:mic-resume'));
      }
      if (uploaded) {
        quoteChoices['photoSource'] = 'customer_upload';
        const analysis = await analyzeBathroomPhoto();
        const nextSlide = 'enclosures';
        return {
          success: true,
          message: instr(`The customer uploaded a photo of their bathroom. ${analysis ? `Bathroom photo analysis: ${analysis} Briefly describe what you see and the most realistic shower direction. ` : ''}Tell them you can now tailor the design to their real space. Then continue with show_slide("${nextSlide}") when they are ready.`),
        };
      }
      const nextSlide = 'enclosures';
      return {
        success: true,
        message: instr(`The customer closed or skipped the upload card (or it timed out). No problem - do NOT mention the photo again. Ask if they're ready to look at the options, and when they agree call show_slide("${nextSlide}").`),
      };
    }

    case 'preview_option': {
      const category = String(args.category || '').toLowerCase().trim();
      const value = String(args.value || '').trim();
      if (!isCinematic()) {
        return { success: false, message: instr('The live 3D preview is not available right now. Describe the option in words instead and continue the conversation.') };
      }
      if (!['enclosure', 'glass', 'hardware', 'handle', 'accessories', 'extras', 'rail-type', 'rail-glass', 'rail-finish', 'rail-mounting', 'com-type', 'com-glass', 'com-framing', 'com-scope'].includes(category) || !value) {
        return { success: false, message: instr('Invalid preview call. Use a supported category for the active service, with a value.') };
      }
      emitPreview(category, value);
      return {
        success: true,
        message: instr(`The 3D model is now previewing "${value}". Point it out in ONE short sentence (e.g. "take a look — that's it on the model now") and keep the conversation going. This did NOT record a selection — when the customer states their final pick, advance with show_slide as usual.`),
      };
    }

    case 'set_camera_view': {
      const view = String(args.view || '').toLowerCase().trim();
      if (!isCinematic()) {
        return { success: false, message: instr('The 3D camera is not available right now. Continue the conversation normally.') };
      }
      emitPreview('camera', view);
      return { success: true, message: instr(`The camera is gliding to the ${view} view. Continue naturally — no need to announce it.`) };
    }

    case 'end_session': {
      console.log('[Session End] Extra details:', args);

      // Block end_session if it fires too soon after present_quote; that
      // means the agent skipped the read-back and goodbye.
      const sincePresent = Date.now() - presentQuoteAt;
      if (getState().currentMode !== 'chat' && presentQuoteAt > 0 && sincePresent < 3000) {
        console.warn('[Tour] Blocking premature end_session, sincePresent=', sincePresent);
        return {
          success: false,
          message: instr(`BLOCKED - only ${Math.round(sincePresent / 1000)}s have passed since present_quote. You skipped the closing flow. Go back and: (1) read back their selections enthusiastically, (2) tell them the visualization is ready, (3) ask whether they want to add optional staff-review details like budget range, timeline/stage, measurements, or notes, (4) WAIT for their answer, then call end_session with any details they provide.`),
        };
      }

      // Save any extra details provided
      if (args.customer_name) quoteChoices['name'] = args.customer_name;
      if (args.email) quoteChoices['email'] = args.email;
      if (args.phone) quoteChoices['phone'] = args.phone;
      if (args.address) quoteChoices['address'] = args.address;
      if (args.location) quoteChoices['location'] = args.location;
      if (args.timeline) quoteChoices['timeline'] = args.timeline;
      if (args.budget) quoteChoices['budget'] = args.budget;
      if (args.notes) quoteChoices['notes'] = args.notes;

      const missingRequired = [
        !quoteChoices['name'] && 'name',
        !quoteChoices['email'] && 'email',
      ].filter(Boolean);
      if (false && getActiveService() === 'showers' && missingRequired.length) {
        return {
          success: false,
          message: instr(`BLOCKED - the rendering cannot be unlocked yet. Missing required details: ${missingRequired.join(', ')}. Ask for only the missing details, then after they answer give the goodbye and call end_session again with those fields.`),
        };
      }

      console.log('[Final Quote Data]', quoteChoices);

      // Persist the customer to localStorage so next visit the agent
      // greets them by name and skips re-asking the basics.
      try {
        const service = (getActiveService?.() as ServiceType) || getState().currentService || undefined;
        saveUser({
          name: quoteChoices['name'] || undefined,
          email: quoteChoices['email'] || undefined,
          phone: quoteChoices['phone'] || undefined,
          address: quoteChoices['address'] || quoteChoices['location'] || undefined,
          location: quoteChoices['location'] || undefined,
          timeline: quoteChoices['timeline'] || undefined,
          budget: quoteChoices['budget'] || undefined,
          notes: quoteChoices['notes'] || undefined,
          preferredMode: getState().currentMode || undefined,
          lastQuote: {
            service: (service as 'showers' | 'railings' | 'commercial') || undefined,
            enclosure: quoteChoices['enclosure'] || quoteChoices['rail-type'] || quoteChoices['com-type'] || undefined,
            glass: quoteChoices['glass'] || quoteChoices['rail-glass'] || quoteChoices['com-glass'] || undefined,
            hardware: quoteChoices['hardware'] || quoteChoices['rail-finish'] || quoteChoices['com-framing'] || undefined,
            handle: quoteChoices['handle'] || quoteChoices['rail-mounting'] || quoteChoices['com-scope'] || undefined,
            accessories: quoteChoices['accessories'] || undefined,
            extras: quoteChoices['extras'] || undefined,
          },
        });
      } catch (err) {
        console.warn('[UserStorage] Save failed in end_session:', err);
      }

      // Re-populate so any newly provided contact details show on the quote screen
      populateQuoteSummary(quoteChoices);
      if (false && getActiveService() === 'showers') {
        unlockQuoteImageSlot();
        generateShowerImage(quoteChoices).then((imgUrl) => {
          if (!imgUrl) return;
          markQuoteRenderReady(imgUrl);
          saveCustomerGeneration(imgUrl, {
            service: 'showers',
            enclosure: quoteChoices.enclosure,
            glass: quoteChoices.glass,
            hardware: quoteChoices.hardware,
            handle: quoteChoices.handle,
            accessories: quoteChoices.accessories,
            extras: quoteChoices.extras,
            doorPlacement: quoteChoices.doorPlacement,
            photoSource: quoteChoices.photoSource,
            customerName: quoteChoices.name,
            customerEmail: quoteChoices.email,
            customerPhone: quoteChoices.phone,
            customerAddress: quoteChoices.address || quoteChoices.location,
            mode: getState().currentMode === 'chat' ? 'chat' : 'voice',
          });
        }).catch((err) => console.warn('[ImageGen] Failed:', err));
      }

      // Trigger the proposal-ready success animation immediately so the
      // user sees it even if the agent gets disconnected mid-goodbye.
      showQuoteSent();

      // Stop the mic immediately so we stop sending audio to the API,
      // but leave the WebSocket open long enough for the agent's full
      // goodbye sentence to finish streaming + playing locally.
      window.dispatchEvent(new CustomEvent('precision:end-session-soft'));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('precision:end-session'));
      }, 14000);

      // Return NO message: the goodbye has already been spoken. Anything we
      // hand back here can get read aloud by the model (it previously voiced
      // the "do not generate any more audio" instruction). An empty result
      // closes the call cleanly and silently.
      return { success: true };
    }

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Quote summary population                                           */
/* ------------------------------------------------------------------ */

function populateQuoteSummary(choices: Record<string, string>): void {
  renderQuoteVisuals(choices);
}
