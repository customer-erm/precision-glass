import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { showQuoteOverlay, updateQuoteField, showQuoteSubmitted } from '../sections/quote';
import { setState } from '../utils/state';
import type { ServiceType } from '../utils/state';

/* ------------------------------------------------------------------ */
/*  Quote state                                                        */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};

export const TOOL_DECLARATIONS = [
  {
    name: 'capture_lead',
    description: 'Capture the customer\'s name and optionally email for the buyer\'s guide.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Customer name' },
        email: { type: 'string' as const, description: 'Customer email (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'select_service',
    description: 'Start the guided tour for a service. Transforms the page into a cinematic slideshow.',
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
          enum: ['gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'process'],
          description: 'The next slide to show',
        },
        choice: {
          type: 'string' as const,
          description: 'Customer\'s preference from the current slide (e.g., "single door", "clear glass")',
        },
      },
      required: ['slide_id'],
    },
  },
  {
    name: 'present_quote',
    description: 'End the tour and show a quote summary with all selections.',
    parameters: {
      type: 'object' as const,
      properties: {
        enclosure: { type: 'string' as const, description: 'Chosen enclosure type' },
        glass: { type: 'string' as const, description: 'Chosen glass type' },
        hardware: { type: 'string' as const, description: 'Chosen hardware finish' },
        accessories: { type: 'string' as const, description: 'Chosen accessories' },
      },
      required: ['enclosure', 'glass', 'hardware'],
    },
  },
  {
    name: 'submit_quote',
    description: 'Submit the final quote request.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Customer name' },
        email: { type: 'string' as const, description: 'Customer email' },
        phone: { type: 'string' as const, description: 'Customer phone' },
        enclosure: { type: 'string' as const, description: 'Enclosure type' },
        glass: { type: 'string' as const, description: 'Glass type' },
        hardware: { type: 'string' as const, description: 'Hardware finish' },
        accessories: { type: 'string' as const, description: 'Accessories' },
        timeline: { type: 'string' as const, description: 'Project timeline' },
        notes: { type: 'string' as const, description: 'Additional notes' },
      },
      required: ['name', 'enclosure', 'glass', 'hardware'],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Slide context — tells the model what's on screen & what to ask     */
/* ------------------------------------------------------------------ */

const SLIDE_CONTEXT: Record<string, string> = {
  intro: `A dramatic full-screen image of a frameless shower is on screen with the title "Frameless Shower Enclosures". Give a brief exciting intro about frameless showers — custom, no metal frames, precision glass. Then say "Let me show you some of our recent work." and call show_slide("gallery").`,

  gallery: `Four large, beautiful photos of completed shower installations fill the screen. Describe the variety briefly — these are all custom, each built for the homeowner's unique space. Then say "Let me show you how to configure yours — starting with the enclosure style." and call show_slide("enclosures").`,

  enclosures: `Four enclosure options are displayed as large elegant cards: Single Door (our most popular, minimal and clean), Door + Panel (fixed panel for wider openings), Neo-Angle (diamond shape for corner spaces), and Frameless Slider (bypass door, great when no swing room). Describe each one briefly. Then ask: "Which of these styles would work best in your space?" WAIT for their answer.`,

  glass: `Three glass types shown as large cards with images: Clear Glass (shows off tilework, opens the space), Frosted Glass (acid-etched for privacy, still lets light through), and Rain Glass (textured pattern, artistic privacy). Describe each briefly. Ask: "Which glass appeals to you?" WAIT for their answer.`,

  hardware: `Five hardware finish options shown as substantial cards: Polished Chrome (timeless classic), Brushed Nickel (warm, hides water spots), Matte Black (bold modern trend), Polished Brass (classic luxury), and Satin Brass (soft golden elegance). Describe a few standouts. Ask: "Which finish would complement your bathroom?" WAIT for their answer.`,

  accessories: `Key accessories displayed: Pull Handles, Towel Bars, Hinges, and Support Bars. These are solid brass with a lifetime warranty, available in all hardware finishes. Give a brief overview. Ask: "Any specific accessories you'd want to include?" WAIT for their answer.`,

  process: `The four-step process is shown with images: 1) Free Consultation, 2) Precision Laser Measurement, 3) Custom Fabrication (2-3 weeks), 4) Professional Installation (usually one day). Total timeline about 3-4 weeks. Walk through it briefly, then call present_quote() with all the customer's selections.`,
};

/* Map next slide to the category the choice belongs to */
function choiceCategoryForSlide(nextSlideId: string): string | null {
  const map: Record<string, string> = {
    glass: 'enclosure',
    hardware: 'glass',
    accessories: 'hardware',
    process: 'accessories',
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
    case 'capture_lead': {
      if (args.name) {
        setState({ customerName: args.name });
        quoteChoices['name'] = args.name;
      }
      if (args.email) {
        setState({ customerEmail: args.email });
        quoteChoices['email'] = args.email;
      }
      const msg = args.email
        ? `Great, captured ${args.name}'s info. The buyer's guide will be sent to ${args.email}. Now ask how you can help — mention frameless showers, glass railings, or commercial glass.`
        : `Got it, ${args.name}. Now ask how you can help — mention frameless showers, glass railings, or commercial glass.`;
      return { success: true, message: msg };
    }

    case 'select_service': {
      const service = args.service as ServiceType;
      setState({ currentService: service, isTransformed: true });
      // Single smooth transition: collapse hero → slideshow appears
      await playTransformAnimation();
      createSlideshow();
      await showSlide('intro');
      return { success: true, message: SLIDE_CONTEXT['intro'] };
    }

    case 'show_slide': {
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
      if (args.accessories) quoteChoices['accessories'] = args.accessories;

      await endSlideshow();
      showQuoteOverlay();
      for (const [field, value] of Object.entries(quoteChoices)) {
        updateQuoteField(field, value);
      }

      const summary = Object.entries(quoteChoices)
        .filter(([k]) => ['enclosure', 'glass', 'hardware', 'accessories'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return {
        success: true,
        message: `Tour complete! Quote summary is on screen: ${summary}. Read back their selections enthusiastically. Ask if they'd like a formal quote with pricing — if yes, ask for phone number and any project timeline or notes. Then call submit_quote().`,
      };
    }

    case 'submit_quote': {
      console.log('[Quote Submitted]', args);
      const fields: Record<string, string> = { ...quoteChoices, ...args };
      for (const [k, v] of Object.entries(fields)) {
        if (v) updateQuoteField(k, v);
      }
      if (args.name) setState({ customerName: args.name });
      if (args.email) setState({ customerEmail: args.email });
      showQuoteSubmitted();
      return { success: true, message: 'Quote submitted! Thank the customer warmly. Let them know your team will reach out within 24 hours with pricing. Ask if they have any other questions.' };
    }

    default:
      console.warn(`Unknown tool: ${name}`);
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
