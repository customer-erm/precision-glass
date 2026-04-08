import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow, showQuoteSent, showBuyerGuidePopup } from '../animations/slideshow';
import { setState } from '../utils/state';
import { generateShowerImage } from './image-gen';
import type { ServiceType } from '../utils/state';

/* ------------------------------------------------------------------ */
/*  Quote state                                                        */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};
let pendingImageUrl: string | null = null;

// Track timing of show_slide calls to detect / block auto-advance hallucinations.
// If the agent calls show_slide twice in rapid succession with no real user
// audio in between, we know it's making things up.
let lastShowSlideAt = 0;
let lastUserSpeechAt = 0;
const MIN_SLIDE_INTERVAL_MS = 2500;

window.addEventListener('precision:user-spoke', () => {
  lastUserSpeechAt = Date.now();
});

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
          enum: ['gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'extras', 'process'],
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
          description: 'Optional add-on accessories the customer chose alongside their handle (e.g. "robe hook, towel bar"). Comma-separated. Use only when advancing past the accessories slide.',
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
        accessories: { type: 'string' as const, description: 'Add-on accessories like robe hook, towel bar, support bar — comma-separated' },
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
    name: 'end_session',
    description: 'Cleanly end the voice session after saying goodbye. Call this ONLY after your final goodbye message.',
    parameters: {
      type: 'object' as const,
      properties: {
        customer_name: { type: 'string' as const, description: 'Customer name if known' },
        email: { type: 'string' as const, description: 'Customer email if known' },
        phone: { type: 'string' as const, description: 'Customer phone number if provided' },
        location: { type: 'string' as const, description: 'Customer city/area if provided' },
        timeline: { type: 'string' as const, description: 'Project timeline if provided' },
        budget: { type: 'string' as const, description: 'Budget range if provided' },
      },
      required: [],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Slide context                                                      */
/* ------------------------------------------------------------------ */

const SLIDE_CONTEXT: Record<string, string> = {
  intro: `A dramatic frameless shower fills the screen. Give an exciting pitch — frameless showers transform the bathroom, feel bigger and brighter, no bulky metal frames, just precision glass. They add real value to the home. Ask if they'd like you to walk through the options together. WAIT. When they agree, call show_slide("gallery").`,

  gallery: `A slideshow is cycling through recent installations. Take 4-6 sentences here — really sell the work. Talk about the variety of styles you see, the craftsmanship, how every installation is custom-fit, the way frameless glass transforms a bathroom, mention you've done everything from compact alcoves to luxury spa builds. Get them excited. THEN ask for the email in a single clear sentence: "I'd also love to send you our free frameless shower buyer's guide — can I grab your email?" The VERY LAST action of this turn (after you finish saying that sentence) must be to call the show_buyers_guide tool, so the popup appears at the exact moment you stop talking and start waiting for their email. Then STOP completely and wait silently. If they give an email, call show_slide("enclosures") with the email parameter and customer_name parameter (if you have it). If they decline, just call show_slide("enclosures").`,

  enclosures: `A grid shows all enclosure types. Touch on the key options: Single Door (clean, minimal), Door + Panel (wider openings), Neo-Angle (corner-saving diamond), 90° Corner (two panels meeting at a right angle for corner showers), Frameless Slider (no swing room needed), Curved (spa feel), Arched (statement piece), Splash Panel (open walk-in, just a fixed panel), Steam Shower (sealed floor-to-ceiling), and Custom for unique spaces. Mention the most popular are Single Door and Door + Panel. Ask which style works for their space. WAIT. Call show_slide("glass") with their choice.`,

  glass: `Three glass types shown. Describe all three: Clear Glass — bestseller, crystal clear, shows your tilework. Frosted Glass — acid-etched for privacy, still lets light through. Rain Glass — textured water-droplet pattern, artistic privacy. Ask which appeals to them. WAIT. Call show_slide("hardware") with their choice.`,

  hardware: `Five hardware finishes displayed. FIRST, take 2-3 sentences to explain what "hardware" means on a frameless shower — it's all the metal that holds the glass: the hinges that let the door swing, the wall clips that anchor fixed panels, any handles or pulls, and (if applicable) towel bars or support bars. All of these pieces come in a matching finish that ties the shower into the rest of the bathroom's fixtures (faucets, lights, mirrors). THEN describe the five finishes: Polished Chrome (timeless, most popular, matches almost anything), Brushed Nickel (warm satin tone, hides water spots), Matte Black (bold modern contrast), Polished Brass (classic luxury warmth), Satin Brass (soft golden, very on-trend right now). Ask which finish complements their bathroom. STOP and wait. Call show_slide("accessories") with their choice.`,

  accessories: `Handle and accessory options shown. Describe the HANDLE choices first: Pull Handles (sleek vertical tubular bar, most popular), U-Handles (classic U-shape bracket), Ladder Pulls (ladder-style bar with horizontal rungs, design statement), Knobs (minimalist round). Then mention the OPTIONAL ADD-ONS the customer can pair with any handle: Towel Bars, Robe Hooks, Support Bars. Mention hinges are always included standard. Ask which handle style they prefer AND whether they want any of the add-ons (towel bar, robe hook, support bar) — they can pick zero, one, or several. WAIT for the full answer. If they mention multiple things (e.g. "u-handle with robe hook"), capture the handle in the "choice" parameter and the add-ons in the "accessories" parameter as a comma-separated string. Call show_slide("extras") with both choice (the handle) and accessories (the add-ons, or omit if none).`,

  extras: `Two premium upgrades shown. Describe both: Decorative Grid Patterns — French, colonial, or custom grids on the glass for architectural character. Steam Shower — fully sealed floor-to-ceiling enclosure for a spa experience. Ask if they're interested in either upgrade or want to move on. WAIT. Call show_slide("process") with their choice (use "none" if they decline).`,

  process: `Five process steps shown. Walk through each with enthusiasm: 1) Quote Approved — lock in the design. 2) Precision Measuring — laser templates, every fraction of an inch matters. 3) Glass Ordering — custom cut, polished, tempered at 1100+ degrees, 2-3 weeks. 4) Installation Day — certified installers, usually done in one day. 5) Enjoy — step into your new shower. Then mention your AI is generating a visualization of their selections. Ask if they have any questions before reviewing their configuration. WAIT. Call present_quote() with all their selections: enclosure, glass, hardware, handle, extras.`,
};

function choiceCategoryForSlide(nextSlideId: string): string | null {
  const map: Record<string, string> = {
    glass: 'enclosure',
    hardware: 'glass',
    accessories: 'hardware',
    extras: 'handle',
    process: 'extras',
  };
  return map[nextSlideId] || null;
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
      const service = args.service as ServiceType;
      setState({ currentService: service, isTransformed: true });
      await playTransformAnimation();
      createSlideshow();
      await showSlide('intro');
      return { success: true, message: SLIDE_CONTEXT['intro'] };
    }

    case 'show_slide': {
      // Anti-hallucination guard: refuse the call if it's chained too quickly
      // after the previous one, or if no user speech has been heard since the
      // last show_slide. This blocks the model from auto-advancing through
      // the tour without listening to the customer.
      const now = Date.now();
      const sinceLastSlide = now - lastShowSlideAt;
      const heardUserSinceLastSlide = lastUserSpeechAt > lastShowSlideAt;
      if (lastShowSlideAt > 0 && (sinceLastSlide < MIN_SLIDE_INTERVAL_MS || !heardUserSinceLastSlide)) {
        console.warn('[Tour] Blocking auto-advance show_slide:', {
          slide_id: args.slide_id,
          sinceLastSlide,
          heardUserSinceLastSlide,
        });
        return {
          success: false,
          message: `BLOCKED — you tried to advance to slide "${args.slide_id}" but the customer has NOT actually said anything yet on this slide. You are hallucinating their response. Do NOT call show_slide again. Instead, wait silently for the customer's real voice. Only after you literally hear them speak through the microphone may you advance.`,
        };
      }
      lastShowSlideAt = now;

      // Save email if provided
      if (args.email) {
        setState({ customerEmail: args.email });
        quoteChoices['email'] = args.email;
      }
      if (args.customer_name) {
        quoteChoices['name'] = args.customer_name;
      }
      if (args.accessories) {
        quoteChoices['accessories'] = args.accessories;
        console.log('[Quote] Saved accessories:', args.accessories);
      }
      // Save choice from current slide
      if (args.choice) {
        const category = choiceCategoryForSlide(args.slide_id);
        if (category) {
          quoteChoices[category] = args.choice;
          console.log('[Quote] Saved:', category, '=', args.choice);
        }
      }

      // Walk-in / splash panel: no door, so no handle AND no extras (grid/steam don't apply).
      // Jump straight from hardware → process, marking handle and extras as N/A.
      let targetSlide = args.slide_id;
      const enclosureLower = (quoteChoices['enclosure'] || '').toLowerCase();
      const isWalkIn = enclosureLower.includes('splash') || enclosureLower.includes('walk');
      if (isWalkIn && (targetSlide === 'accessories' || targetSlide === 'extras')) {
        console.log('[Tour] Walk-in/splash panel detected — skipping handle and extras');
        quoteChoices['handle'] = 'N/A';
        quoteChoices['extras'] = 'N/A';
        targetSlide = 'process';
      }
      await showSlide(targetSlide);
      // Reassign so downstream logic uses the resolved slide
      args.slide_id = targetSlide;

      // Start AI image generation as soon as extras choice is made (process slide loads)
      // This gives max time for the image to generate while agent discusses the process
      if (args.slide_id === 'process') {
        console.log('[ImageGen] Starting generation — all choices collected');
        generateShowerImage(quoteChoices).then((imgUrl) => {
          if (imgUrl) {
            pendingImageUrl = imgUrl;
            console.log('[ImageGen] Image ready (cached for quote slide)');
          } else {
            console.warn('[ImageGen] Returned null — no image generated');
          }
        }).catch((err) => console.warn('[ImageGen] Failed:', err));
      }

      let msg = SLIDE_CONTEXT[args.slide_id] || 'Slide is showing.';
      if (isWalkIn && targetSlide === 'process') {
        msg = `NOTE: This is a walk-in / splash panel layout — there is NO door, so we have skipped BOTH the handle/accessories step AND the grid/steam upgrades step (they don't apply). Do NOT mention handles or upgrades. Move directly into the process walkthrough. ` + msg;
      }
      return { success: true, message: msg };
    }

    case 'present_quote': {
      if (args.enclosure) quoteChoices['enclosure'] = args.enclosure;
      if (args.glass) quoteChoices['glass'] = args.glass;
      if (args.hardware) quoteChoices['hardware'] = args.hardware;
      if (args.handle) quoteChoices['handle'] = args.handle;
      if (args.accessories) quoteChoices['accessories'] = args.accessories;
      if (args.extras) quoteChoices['extras'] = args.extras;
      if (args.customer_name) quoteChoices['name'] = args.customer_name;
      if (args.email) quoteChoices['email'] = args.email;

      // Walk-in/splash always wins over a stale value the agent may pass.
      const enclLower = (quoteChoices['enclosure'] || '').toLowerCase();
      if (enclLower.includes('splash') || enclLower.includes('walk')) {
        quoteChoices['handle'] = 'N/A';
        quoteChoices['extras'] = 'N/A';
      }

      await showSlide('quote');
      setTimeout(() => populateQuoteSummary(quoteChoices), 500);

      // Use cached image from process slide, or generate now as fallback
      const applyImage = (url: string) => {
        const imgEl = document.getElementById('qs-generated-img') as HTMLImageElement;
        if (imgEl) {
          imgEl.src = url;
          imgEl.classList.add('loaded');
        }
        const spinner = document.querySelector('.ss-quote-spinner') as HTMLElement;
        if (spinner) spinner.style.display = 'none';
      };

      if (pendingImageUrl) {
        setTimeout(() => applyImage(pendingImageUrl!), 600);
      } else {
        generateShowerImage(quoteChoices).then((imgUrl) => {
          if (imgUrl) applyImage(imgUrl);
        }).catch((err) => console.warn('[ImageGen] Failed:', err));
      }

      const summary = Object.entries(quoteChoices)
        .filter(([k]) => ['enclosure', 'glass', 'hardware', 'handle', 'extras'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      const hasName = !!quoteChoices['name'];
      const hasEmail = !!quoteChoices['email'];

      return {
        success: true,
        message: `The quote summary is displayed showing: ${summary}. An AI visualization is loading on the right.

DO THE FOLLOWING IN ORDER:
1. Read back their selections enthusiastically — tell them their choices look amazing together.
2. Let them know you're preparing a detailed quote and a specialist from your team will reach out within 24 hours with pricing.
3. Casually ask if they'd like to share any additional details to help with the quote — phone number, what city/area they're in, project timeline, or budget range. Say something like "No pressure at all, but if you'd like to share your phone number, general area, timeline, or budget range, it helps us put together an even more accurate quote." ${hasName ? 'You already have their name.' : 'Ask for their name if you don\'t have it.'} ${hasEmail ? 'You already have their email.' : 'Ask for their email if you don\'t have it.'}
4. WAIT for their response.
5. As soon as they respond (whether they share details or politely decline), deliver your full warm goodbye in ONE SINGLE TURN — use their name, thank them, tell them it was great chatting, wish them a great day. Speak the entire goodbye out loud as one continuous turn — do NOT pause for another reply, do NOT ask any more questions, do NOT leave silence at the end.
6. IMMEDIATELY in the same turn (right after the last word of your goodbye) call end_session() with any details they shared. The session will close automatically after your goodbye finishes playing — there is no further response expected from the customer, so do not wait for one.`,
      };
    }

    case 'show_buyers_guide': {
      showBuyerGuidePopup();
      return { success: true, message: 'Buyer\'s guide popup is now visible on screen. Continue speaking — ask for their email naturally.' };
    }

    case 'end_session': {
      console.log('[Session End] Extra details:', args);

      // Save any extra details provided
      if (args.customer_name) quoteChoices['name'] = args.customer_name;
      if (args.email) quoteChoices['email'] = args.email;
      if (args.phone) quoteChoices['phone'] = args.phone;
      if (args.location) quoteChoices['location'] = args.location;
      if (args.timeline) quoteChoices['timeline'] = args.timeline;
      if (args.budget) quoteChoices['budget'] = args.budget;

      console.log('[Final Quote Data]', quoteChoices);

      // Re-populate so any newly provided contact details show on the quote screen
      populateQuoteSummary(quoteChoices);

      // Trigger the "Quote Sent!" success animation
      setTimeout(() => showQuoteSent(), 400);

      // Show restart button
      setTimeout(() => {
        const restartBtn = document.getElementById('quote-restart-btn');
        if (restartBtn) restartBtn.classList.add('visible');
      }, 2500);

      // Stop the mic immediately so we stop sending audio to the API,
      // but leave the WebSocket open long enough for the agent's full
      // goodbye sentence to finish streaming + playing locally.
      window.dispatchEvent(new CustomEvent('precision:end-session-soft'));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('precision:end-session'));
      }, 14000);

      return { success: true, message: 'Session is ending. Finish your final goodbye sentence naturally — the system will close the connection shortly.' };
    }

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Quote summary population                                           */
/* ------------------------------------------------------------------ */

function populateQuoteSummary(choices: Record<string, string>): void {
  const fields = ['enclosure', 'glass', 'hardware', 'handle', 'accessories', 'extras', 'name', 'email', 'phone', 'location', 'timeline', 'budget'];
  for (const field of fields) {
    const el = document.getElementById(`qs-${field}`);
    if (el && choices[field]) {
      el.textContent = choices[field];
      el.classList.add('filled');
    }
  }
}
