import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { showBuyersGuide, fillBuyersGuideEmail } from '../sections/buyers-guide';
import { showQuoteOverlay, updateQuoteField, showQuoteSubmitted } from '../sections/quote';
import { setState } from '../utils/state';
import type { ServiceType } from '../utils/state';

/* ------------------------------------------------------------------ */
/*  Quote state — accumulates choices through the tour                 */
/* ------------------------------------------------------------------ */

const quoteChoices: Record<string, string> = {};

export const TOOL_DECLARATIONS = [
  {
    name: 'select_service',
    description: 'Transform the page to showcase a specific service. Call when the customer agrees to take the tour.',
    parameters: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string' as const,
          enum: ['showers', 'railings', 'commercial'],
          description: 'The service to display',
        },
      },
      required: ['service'],
    },
  },
  {
    name: 'show_slide',
    description: 'Advance to the next slide in the tour. Include the customer\'s choice from the current slide if they made one.',
    parameters: {
      type: 'object' as const,
      properties: {
        slide_id: {
          type: 'string' as const,
          enum: ['gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'process'],
          description: 'The slide to transition to',
        },
        choice: {
          type: 'string' as const,
          description: 'The customer\'s preference from the current slide (e.g., "single door", "clear glass", "matte black")',
        },
      },
      required: ['slide_id'],
    },
  },
  {
    name: 'present_quote',
    description: 'End the tour and present a quote summary with all the customer\'s selections.',
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
    name: 'capture_email',
    description: "Store the customer's email for follow-up and quote delivery.",
    parameters: {
      type: 'object' as const,
      properties: {
        email: { type: 'string' as const, description: "Customer's email" },
      },
      required: ['email'],
    },
  },
  {
    name: 'submit_quote',
    description: 'Submit the completed quote request with all details.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Customer name' },
        email: { type: 'string' as const, description: 'Customer email' },
        phone: { type: 'string' as const, description: 'Customer phone (optional)' },
        enclosure: { type: 'string' as const, description: 'Enclosure type' },
        glass: { type: 'string' as const, description: 'Glass type' },
        hardware: { type: 'string' as const, description: 'Hardware finish' },
        accessories: { type: 'string' as const, description: 'Accessories' },
        notes: { type: 'string' as const, description: 'Additional notes' },
      },
      required: ['name', 'email', 'enclosure', 'glass', 'hardware'],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Slide context — tells the model what's on screen                   */
/* ------------------------------------------------------------------ */

const SLIDE_CONTEXT: Record<string, string> = {
  intro: 'The intro slide is showing — a dramatic full-screen image of a frameless shower. Briefly introduce frameless showers and tell the customer you\'ll show them some recent work. Then call show_slide("gallery").',

  gallery: 'A row of 5 stunning completed shower installations is on screen. The customer can see the range of styles. Describe them briefly, then say you\'ll show them the configuration options. Call show_slide("enclosures").',

  enclosures: 'Nine enclosure types are displayed in a horizontal row: Single Door, Door + Panel, Neo-Angle, Frameless Slider, Curved, Arched, Splash Panel, Steam Shower, and Custom. Each one highlights when you mention it by name. Describe a few standouts, then ask: "Which enclosure style catches your eye?" WAIT for their answer.',

  glass: 'Three glass option cards are on screen: Clear Glass, Frosted Glass, and Rain Glass. Each highlights when named. Describe them briefly, then ask: "Which glass do you prefer?" WAIT for their answer.',

  hardware: 'Six hardware finish swatches are shown: Polished Chrome, Brushed Nickel, Matte Black, Polished Brass, Satin Brass, and Other Finishes. Each highlights when named. Describe them, then ask: "Which finish speaks to you?" WAIT for their answer.',

  accessories: 'Six accessories are displayed: Pull Handles, Towel Bars, Hinges, U-Handles, Knobs, and Support Bars. Each highlights when named. Give a brief overview, then ask: "Any accessories you\'d like included?" WAIT for their answer.',

  process: 'The four-step process is shown: Consultation, Measurement, Fabrication, Installation. Walk them through the timeline briefly. Then call present_quote() with all their selections.',
};

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
      await playTransformAnimation(service);
      createSlideshow();
      await showSlide('intro');
      return { success: true, message: SLIDE_CONTEXT['intro'] };
    }

    case 'show_slide': {
      // Save choice from previous slide
      if (args.choice) {
        const currentSlide = getCurrentCategory(args.slide_id);
        if (currentSlide) {
          quoteChoices[currentSlide] = args.choice;
          console.log('[Quote] Saved:', currentSlide, '=', args.choice);
        }
      }
      await showSlide(args.slide_id);
      const context = SLIDE_CONTEXT[args.slide_id] || `Slide "${args.slide_id}" is now showing.`;
      return { success: true, message: context };
    }

    case 'present_quote': {
      // Save final selections
      if (args.enclosure) quoteChoices['enclosure'] = args.enclosure;
      if (args.glass) quoteChoices['glass'] = args.glass;
      if (args.hardware) quoteChoices['hardware'] = args.hardware;
      if (args.accessories) quoteChoices['accessories'] = args.accessories;

      await endSlideshow();
      showQuoteOverlay();

      // Fill in what we have
      for (const [field, value] of Object.entries(quoteChoices)) {
        updateQuoteField(field, value);
      }

      const summary = Object.entries(quoteChoices)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return {
        success: true,
        message: `The tour is complete. A quote summary is now on screen showing: ${summary}. Read back their selections enthusiastically, then ask if they'd like to receive a formal quote with pricing. If yes, ask for their email and phone number.`,
      };
    }

    case 'capture_email': {
      setState({ customerEmail: args.email });
      fillBuyersGuideEmail(args.email);
      return { success: true };
    }

    case 'submit_quote': {
      console.log('[Quote Submitted]', args);
      if (args.name) {
        setState({ customerName: args.name });
        updateQuoteField('name', args.name);
      }
      if (args.email) updateQuoteField('email', args.email);
      if (args.phone) updateQuoteField('phone', args.phone);
      if (args.enclosure) updateQuoteField('enclosure_type', args.enclosure);
      if (args.glass) updateQuoteField('glass_type', args.glass);
      if (args.hardware) updateQuoteField('hardware_finish', args.hardware);
      if (args.notes) updateQuoteField('notes', args.notes);
      showQuoteSubmitted();
      return { success: true, message: 'Quote submitted! Thank the customer and let them know someone will reach out within 24 hours. Ask if they have any other questions.' };
    }

    default:
      console.warn(`Unknown tool: ${name}`);
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map the NEXT slide to the category the choice belongs to */
function getCurrentCategory(nextSlideId: string): string | null {
  const map: Record<string, string> = {
    glass: 'enclosure',
    hardware: 'glass',
    accessories: 'hardware',
    process: 'accessories',
  };
  return map[nextSlideId] || null;
}
