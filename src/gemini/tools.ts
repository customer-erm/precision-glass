import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { showBuyersGuide, fillBuyersGuideEmail } from '../sections/buyers-guide';
import { showQuoteOverlay, updateQuoteField, showQuoteSubmitted } from '../sections/quote';
import { setState } from '../utils/state';
import type { ServiceType } from '../utils/state';

export const TOOL_DECLARATIONS = [
  {
    name: 'select_service',
    description: 'Transform the landing page to showcase a specific service and start the cinematic presentation. Call when the customer picks a service.',
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
    description: 'Advance the presentation to a specific slide. Each slide shows different product content. Call this to move through the tour.',
    parameters: {
      type: 'object' as const,
      properties: {
        slide_id: {
          type: 'string' as const,
          enum: ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'process'],
          description: 'The slide to transition to',
        },
      },
      required: ['slide_id'],
    },
  },
  {
    name: 'offer_buyers_guide',
    description: "Show the buyer's guide email capture overlay. Call after finishing the tour to offer a free comprehensive guide.",
    parameters: {
      type: 'object' as const,
      properties: {
        service_name: {
          type: 'string' as const,
          description: 'The name of the service for the guide (e.g., "Frameless Shower")',
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'capture_email',
    description: "Store the customer's email for the buyer's guide delivery.",
    parameters: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string' as const,
          description: "The customer's email address",
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'start_quote_collection',
    description: 'Show the quote request form and begin collecting project details.',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_quote_field',
    description: 'Update a specific field in the quote form as the customer provides information.',
    parameters: {
      type: 'object' as const,
      properties: {
        field: {
          type: 'string' as const,
          enum: ['name', 'email', 'phone', 'enclosure_type', 'glass_type', 'hardware_finish', 'timeline', 'notes'],
          description: 'The quote form field to update',
        },
        value: {
          type: 'string' as const,
          description: 'The value to set',
        },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'submit_quote',
    description: 'Submit the completed quote request.',
    parameters: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string' as const,
          description: "A brief summary of the customer's project requirements",
        },
      },
      required: ['summary'],
    },
  },
];

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
      // Create slideshow overlay and show intro slide
      createSlideshow();
      await showSlide('intro');
      return { success: true };
    }

    case 'show_slide': {
      await showSlide(args.slide_id);
      return { success: true };
    }

    case 'offer_buyers_guide': {
      // End the slideshow, revealing the browsable page underneath
      await endSlideshow();
      showBuyersGuide(args.service_name);
      return { success: true };
    }

    case 'capture_email': {
      setState({ customerEmail: args.email });
      fillBuyersGuideEmail(args.email);
      return { success: true };
    }

    case 'start_quote_collection': {
      showQuoteOverlay();
      return { success: true };
    }

    case 'update_quote_field': {
      updateQuoteField(args.field, args.value);
      if (args.field === 'name') setState({ customerName: args.value });
      return { success: true };
    }

    case 'submit_quote': {
      console.log('[Quote Submitted]', args.summary);
      showQuoteSubmitted();
      return { success: true, message: 'Quote submitted successfully' };
    }

    default:
      console.warn(`Unknown tool: ${name}`);
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
