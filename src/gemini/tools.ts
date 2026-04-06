import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { setState } from '../utils/state';
import { generateShowerImage } from './image-gen';
import type { ServiceType } from '../utils/state';

/* ------------------------------------------------------------------ */
/*  Quote state                                                        */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};
let pendingImageUrl: string | null = null;

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
        extras: { type: 'string' as const },
      },
      required: ['enclosure', 'glass', 'hardware'],
    },
  },
  {
    name: 'end_session',
    description: 'Cleanly end the voice session after saying goodbye. Call this ONLY after your final goodbye message.',
    parameters: {
      type: 'object' as const,
      properties: {
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
  intro: `A dramatic full-screen frameless shower fills the screen with the title "Frameless Shower Enclosures". NOW give your exciting sales pitch — frameless showers transform the entire bathroom, make it feel bigger and brighter, no bulky metal frames collecting grime, just clean precision glass lines. They're not just a shower upgrade — they add real value to the home. Then ask: "Would you like me to walk you through the options so we can build your perfect configuration together?" WAIT for their response. When they agree, call show_slide("gallery").`,

  gallery: `A beautiful 16:9 slideshow is cycling through recent installations with a crossfade effect. Describe the variety briefly — modern, spa-like, each one custom. Then offer the free buyer's guide: "By the way, I'd love to send you our free frameless shower buyer's guide — it covers everything including pricing. Can I grab your email?" WAIT for their response. If they give an email, include it in the email parameter when you call show_slide("enclosures"). If they decline, just call show_slide("enclosures").`,

  enclosures: `An auto-scrolling carousel shows all 9 enclosure types in contain mode — you can see the full shape of each one. The most popular are Single Door (clean, minimal), Door + Panel (wider openings), Neo-Angle (corner spaces), and Frameless Slider (no swing room needed). Describe a few standouts. Ask: "Which enclosure style would work best for your space?" WAIT.`,

  glass: `Three glass types shown as large cards: Clear Glass (bestseller, shows tilework), Frosted Glass (acid-etched privacy), Rain Glass (textured artistic privacy). Describe each briefly. Ask: "Which glass appeals to you?" WAIT.`,

  hardware: `Five hardware finishes: Polished Chrome (timeless), Brushed Nickel (warm, hides spots), Matte Black (bold modern), Polished Brass (classic luxury), Satin Brass (soft golden). Describe standouts. Ask: "Which finish would complement your bathroom?" WAIT.`,

  accessories: `Handle and accessory options displayed: Pull Handles, U-Handles, Ladder Pulls, Knobs, Towel Bars, Robe Hooks, Support Bars. Hinges included standard. Ask: "What style of handle do you prefer?" WAIT.`,

  extras: `Two premium upgrades: decorative glass grid patterns (architectural character) and steam shower enclosures (fully sealed spa experience). Ask: "Interested in either upgrade, or shall we move on?" WAIT.`,

  process: `Five steps shown on screen. Walk through EACH step in detail with enthusiasm:

1) Quote Approved — "Once you're happy with everything, we lock in your design and confirm every detail — enclosure style, glass type, hardware finish, handles."

2) Precision Measuring — "Our team comes out with laser measurement tools. We template every angle, every fraction of an inch. Frameless glass has zero tolerance for error, so precision is everything."

3) Glass Ordering — "Your panels are custom cut, edges polished smooth, then tempered at over 1100 degrees for safety. This takes about 2 to 3 weeks depending on complexity."

4) Installation Day — "This is the exciting part. Our certified installers typically complete everything in a single day. We mount the hardware, set the glass, seal everything up, and do a full quality check."

5) Enjoy — "And then it's yours. Step into a shower that feels completely open and luxurious."

After describing all steps, mention: "By the way, I've been having our AI create a custom visualization of exactly what your shower will look like based on everything you've selected. It might take just a moment to finish rendering."

Then ask: "Before we take a look at your complete configuration, do you have any questions about the process or anything we've covered?" WAIT for their response. Then call present_quote() with all selections.`,
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
      // Save email if provided
      if (args.email) {
        setState({ customerEmail: args.email });
        quoteChoices['email'] = args.email;
      }
      // Save choice from current slide
      if (args.choice) {
        const category = choiceCategoryForSlide(args.slide_id);
        if (category) {
          quoteChoices[category] = args.choice;
          console.log('[Quote] Saved:', category, '=', args.choice);
        }
      }
      await showSlide(args.slide_id);

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

      return { success: true, message: SLIDE_CONTEXT[args.slide_id] || 'Slide is showing.' };
    }

    case 'present_quote': {
      if (args.enclosure) quoteChoices['enclosure'] = args.enclosure;
      if (args.glass) quoteChoices['glass'] = args.glass;
      if (args.hardware) quoteChoices['hardware'] = args.hardware;
      if (args.handle) quoteChoices['handle'] = args.handle;
      if (args.extras) quoteChoices['extras'] = args.extras;

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
5. After they respond, give a warm genuine goodbye using their name. Thank them, tell them it was great chatting, wish them a great day.
6. THEN call end_session() with any details they shared (phone, location, timeline, budget).`,
      };
    }

    case 'end_session': {
      console.log('[Session End] Extra details:', args);

      // Save any extra details provided
      if (args.phone) quoteChoices['phone'] = args.phone;
      if (args.location) quoteChoices['location'] = args.location;
      if (args.timeline) quoteChoices['timeline'] = args.timeline;
      if (args.budget) quoteChoices['budget'] = args.budget;

      console.log('[Final Quote Data]', quoteChoices);

      // Show restart button
      setTimeout(() => {
        const restartBtn = document.getElementById('quote-restart-btn');
        if (restartBtn) restartBtn.classList.add('visible');
      }, 1500);

      // Kill the voice agent after a short delay to let final audio flush
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('precision:end-session'));
      }, 3000);

      return { success: true, message: 'Session ending. Goodbye audio is playing.' };
    }

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Quote summary population                                           */
/* ------------------------------------------------------------------ */

function populateQuoteSummary(choices: Record<string, string>): void {
  const fields = ['enclosure', 'glass', 'hardware', 'handle', 'extras'];
  for (const field of fields) {
    const el = document.getElementById(`qs-${field}`);
    if (el && choices[field]) {
      el.textContent = choices[field];
      el.classList.add('filled');
    }
  }
}
