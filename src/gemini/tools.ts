import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { setState } from '../utils/state';
import type { ServiceType } from '../utils/state';

/* ------------------------------------------------------------------ */
/*  Quote state                                                        */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};

export const TOOL_DECLARATIONS = [
  {
    name: 'select_service',
    description: 'Start the guided tour. Transforms the page into a cinematic slideshow.',
    parameters: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string' as const,
          enum: ['showers', 'railings', 'commercial'],
          description: 'The service to showcase',
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
          description: 'The next slide to show',
        },
        choice: {
          type: 'string' as const,
          description: 'Customer\'s preference from the current slide',
        },
      },
      required: ['slide_id'],
    },
  },
  {
    name: 'present_quote',
    description: 'End the tour and show a beautiful quote summary with all selections.',
    parameters: {
      type: 'object' as const,
      properties: {
        enclosure: { type: 'string' as const, description: 'Chosen enclosure type' },
        glass: { type: 'string' as const, description: 'Chosen glass type' },
        hardware: { type: 'string' as const, description: 'Chosen hardware finish' },
        handle: { type: 'string' as const, description: 'Chosen handle style' },
        extras: { type: 'string' as const, description: 'Grid pattern, steam option, or none' },
      },
      required: ['enclosure', 'glass', 'hardware'],
    },
  },
  {
    name: 'submit_quote',
    description: 'Submit the final quote request with all details. Returns user to main page.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Customer name' },
        email: { type: 'string' as const, description: 'Customer email' },
        phone: { type: 'string' as const, description: 'Customer phone' },
        enclosure: { type: 'string' as const, description: 'Enclosure type' },
        glass: { type: 'string' as const, description: 'Glass type' },
        hardware: { type: 'string' as const, description: 'Hardware finish' },
        handle: { type: 'string' as const, description: 'Handle style' },
        extras: { type: 'string' as const, description: 'Extras' },
        timeline: { type: 'string' as const, description: 'Project timeline' },
        notes: { type: 'string' as const, description: 'Additional notes' },
      },
      required: ['name', 'email', 'enclosure', 'glass', 'hardware'],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Slide context                                                      */
/* ------------------------------------------------------------------ */

const SLIDE_CONTEXT: Record<string, string> = {
  intro: `A dramatic full-screen frameless shower image fills the screen. This is your moment to sell the beauty of frameless glass. Mention the free buyer's guide — say if they share their email you'll send it over. Keep it natural: "Before we dive in, I'd love to send you our free frameless shower buyer's guide — can I grab your email?" If they give it, note it. If not, no pressure. Then say "Let me show you some of our recent installations" and call show_slide("gallery").`,

  gallery: `A beautiful 16:9 slideshow is cycling through four of your recent frameless shower installations — the images fade into each other automatically. Describe the variety: modern minimalist, spa-like, floor-to-ceiling — each one custom built. Keep it brief and cinematic. Then say "Now let me show you how to configure yours" and call show_slide("enclosures").`,

  enclosures: `The enclosure configuration screen shows two large featured options on the left (Single Door and Door + Panel in 'contain' mode so you can see the full shape), plus a grid of additional options on the right (Neo-Angle, Slider, Curved, Arched, Splash Panel, Steam, Custom). Describe the two main options briefly — Single Door is most popular for clean simplicity, Door + Panel for wider openings. Mention the grid has specialty options. Ask: "Which style would work best for your bathroom?" WAIT for their answer.`,

  glass: `Three glass types shown as large beautiful cards: Clear Glass (our bestseller, shows off your tilework), Frosted Glass (acid-etched privacy with light), and Rain Glass (textured artistic privacy). Describe each. Ask: "Which glass appeals to you?" WAIT.`,

  hardware: `Five hardware finishes displayed prominently: Polished Chrome (timeless), Brushed Nickel (warm, hides water spots), Matte Black (bold modern trend), Polished Brass (classic luxury), Satin Brass (soft golden elegance). Describe a couple standouts. Ask: "Which finish would complement your bathroom?" WAIT.`,

  accessories: `Handle and accessory options are displayed: Pull Handles, U-Handles, Ladder Pulls, Knobs, Towel Bars, Robe Hooks, and Support Bars. This slide is about choosing their handle style — the hinges are included standard. Describe a few options. Ask: "What style of handle do you prefer?" WAIT.`,

  extras: `Two premium upgrade options are shown: decorative glass grid patterns and steam shower enclosures. Grid patterns add architectural character. Steam requires a fully sealed enclosure for spa functionality. Ask: "Are you interested in either of these upgrades, or shall we move on to the process?" WAIT.`,

  process: `Five steps are shown with images: 1) Quote Approved — we finalize your design, 2) Precision Measuring — laser-accurate templates, 3) Glass Ordering — custom cut and tempered, 4) Installation Day — professional install, usually one day, 5) Enjoy — your new shower is ready. Walk through each step with a bit more detail and enthusiasm. Then call present_quote() with all the customer's selections.`,
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

      // Show the quote summary slide inside the slideshow
      await showSlide('quote');

      // Populate the quote display
      setTimeout(() => populateQuoteSummary(quoteChoices), 500);

      const summary = Object.entries(quoteChoices)
        .filter(([k]) => ['enclosure', 'glass', 'hardware', 'handle', 'extras'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return {
        success: true,
        message: `The quote summary is beautifully displayed on screen showing: ${summary}. Read back their selections with enthusiasm — "Here's what we've put together for you..." Then ask for any additional details: timeline, special requirements. Ask for their email and name so you can send a formal quote with pricing. Once you have everything, call submit_quote().`,
      };
    }

    case 'submit_quote': {
      console.log('[Quote Submitted]', args);
      setState({ customerName: args.name || '', customerEmail: args.email || '' });

      // Show submitted state
      const submitted = document.getElementById('quote-submitted-msg');
      if (submitted) submitted.classList.add('visible');

      // Morph back to landing page after delay
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
      }, 3000);

      return { success: true, message: 'Quote submitted! The page will return to the main site in a moment. Thank the customer warmly — let them know your team will follow up within 24 hours with detailed pricing. Ask if they have any other questions.' };
    }

    default:
      console.warn(`Unknown tool: ${name}`);
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
