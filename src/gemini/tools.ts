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
  intro: `A dramatic frameless shower fills the screen. Give an exciting pitch — frameless showers transform the bathroom, feel bigger and brighter, no bulky metal frames, just precision glass. They add real value to the home. Ask if they'd like you to walk through the options together. WAIT. When they agree, call show_slide("gallery").`,

  gallery: `A slideshow is cycling through recent installations. Briefly describe the variety — modern, spa-like, each custom. Then offer the buyer's guide: "I'd love to send you our free frameless shower buyer's guide. Can I grab your email?" WAIT. If they give an email, call show_slide("enclosures") with the email parameter. If they decline, just call show_slide("enclosures").`,

  enclosures: `A carousel shows all 9 enclosure types. Touch on the key options: Single Door (clean, minimal), Door + Panel (wider openings), Neo-Angle (corner-saving), Frameless Slider (no swing room needed), Curved (spa feel), Arched (statement piece), Splash Panel (open walk-in, just a fixed panel), Steam Shower (sealed floor-to-ceiling), and Custom for unique spaces. Mention the most popular are Single Door and Door + Panel. Ask which style works for their space. WAIT. Call show_slide("glass") with their choice.`,

  glass: `Three glass types shown. Describe all three: Clear Glass — bestseller, crystal clear, shows your tilework. Frosted Glass — acid-etched for privacy, still lets light through. Rain Glass — textured water-droplet pattern, artistic privacy. Ask which appeals to them. WAIT. Call show_slide("hardware") with their choice.`,

  hardware: `Five hardware finishes displayed. Describe all five: Polished Chrome (timeless, most popular), Brushed Nickel (warm, hides water spots), Matte Black (bold modern), Polished Brass (classic luxury), Satin Brass (soft golden, very on-trend). Ask which finish complements their bathroom. WAIT. Call show_slide("accessories") with their choice.`,

  accessories: `Handle and accessory options shown. Describe: Pull Handles (sleek tubular, most popular), U-Handles (classic U-shape), Ladder Pulls (ladder-style, design statement), Knobs (minimalist), Towel Bars, Robe Hooks, Support Bars. Mention hinges are always included standard. Ask what handle style they prefer. WAIT. Call show_slide("extras") with their choice.`,

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
