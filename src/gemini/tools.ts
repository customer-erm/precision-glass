import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { setState } from '../utils/state';
import { generateShowerImage } from './image-gen';
import type { ServiceType } from '../utils/state';

/* ------------------------------------------------------------------ */
/*  Quote state                                                        */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};

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
    description: 'End the tour and show a quote summary with all selections plus an AI-generated visualization.',
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
    name: 'submit_quote',
    description: 'Submit the final quote. Returns user to landing page.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
        email: { type: 'string' as const },
        phone: { type: 'string' as const },
        enclosure: { type: 'string' as const },
        glass: { type: 'string' as const },
        hardware: { type: 'string' as const },
        handle: { type: 'string' as const },
        extras: { type: 'string' as const },
        timeline: { type: 'string' as const },
        notes: { type: 'string' as const },
      },
      required: ['name', 'email', 'enclosure', 'glass', 'hardware'],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Slide context                                                      */
/* ------------------------------------------------------------------ */

const SLIDE_CONTEXT: Record<string, string> = {
  intro: `A dramatic full-screen frameless shower fills the screen with the title "Frameless Shower Enclosures". Give a brief exciting pitch about frameless showers — they transform the bathroom, no metal frames, just precision glass. Then say "Let me show you some of our recent work" and call show_slide("gallery").`,

  gallery: `A beautiful 16:9 slideshow is cycling through recent installations with a crossfade effect. Describe the variety briefly — modern, spa-like, each one custom. Then offer the free buyer's guide: "By the way, I'd love to send you our free frameless shower buyer's guide — it covers everything including pricing. Can I grab your email?" WAIT for their response. If they give an email, include it in the email parameter when you call show_slide("enclosures"). If they decline, just call show_slide("enclosures").`,

  enclosures: `An auto-scrolling carousel shows all 9 enclosure types in contain mode — you can see the full shape of each one. The most popular are Single Door (clean, minimal), Door + Panel (wider openings), Neo-Angle (corner spaces), and Frameless Slider (no swing room needed). Describe a few standouts. Ask: "Which enclosure style would work best for your space?" WAIT.`,

  glass: `Three glass types shown as large cards: Clear Glass (bestseller, shows tilework), Frosted Glass (acid-etched privacy), Rain Glass (textured artistic privacy). Describe each briefly. Ask: "Which glass appeals to you?" WAIT.`,

  hardware: `Five hardware finishes: Polished Chrome (timeless), Brushed Nickel (warm, hides spots), Matte Black (bold modern), Polished Brass (classic luxury), Satin Brass (soft golden). Describe standouts. Ask: "Which finish would complement your bathroom?" WAIT.`,

  accessories: `Handle and accessory options displayed: Pull Handles, U-Handles, Ladder Pulls, Knobs, Towel Bars, Robe Hooks, Support Bars. Hinges included standard. Ask: "What style of handle do you prefer?" WAIT.`,

  extras: `Two premium upgrades: decorative glass grid patterns (architectural character) and steam shower enclosures (fully sealed spa experience). Ask: "Interested in either upgrade, or shall we move on?" WAIT.`,

  process: `Five steps shown: 1) Quote Approved, 2) Precision Measuring, 3) Glass Ordering (2-3 weeks), 4) Installation Day (usually one day), 5) Enjoy your new shower. Walk through briefly with enthusiasm. Then call present_quote() with all selections.`,
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

      // Generate AI visualization in background
      generateShowerImage(quoteChoices).then((imgUrl) => {
        if (imgUrl) {
          const imgEl = document.getElementById('qs-generated-img') as HTMLImageElement;
          if (imgEl) {
            imgEl.src = imgUrl;
            imgEl.classList.add('loaded');
          }
        }
      }).catch((err) => console.warn('[ImageGen] Failed:', err));

      const summary = Object.entries(quoteChoices)
        .filter(([k]) => ['enclosure', 'glass', 'hardware', 'handle', 'extras'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return {
        success: true,
        message: `The quote summary is displayed showing: ${summary}. An AI visualization of their custom shower is being generated and will appear shortly. Read back their selections with enthusiasm. Ask for their name, email, and any additional details (timeline, special requirements). Then call submit_quote() with everything.`,
      };
    }

    case 'submit_quote': {
      console.log('[Quote Submitted]', args);
      setState({ customerName: args.name || '', customerEmail: args.email || '' });

      const submitted = document.getElementById('quote-submitted-msg');
      if (submitted) submitted.classList.add('visible');

      // Morph back to landing after delay
      setTimeout(async () => {
        await endSlideshow();
        const hero = document.getElementById('hero');
        if (hero) {
          hero.style.display = '';
          hero.style.opacity = '0';
          requestAnimationFrame(() => {
            hero.style.transition = 'opacity 0.8s ease';
            hero.style.opacity = '1';
          });
        }
        setState({ isTransformed: false, currentService: null });
      }, 3500);

      return { success: true, message: 'Quote submitted! The page will return to the main site shortly. Thank the customer warmly — your team will follow up within 24 hours with detailed pricing.' };
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
