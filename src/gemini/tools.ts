import { playTransformAnimation } from '../animations/transform';
import { createSlideshow, showSlide, endSlideshow } from '../animations/slideshow';
import { showBuyersGuide, fillBuyersGuideEmail } from '../sections/buyers-guide';
import { showQuoteOverlay, updateQuoteField, showQuoteSubmitted } from '../sections/quote';
import { setState } from '../utils/state';
import type { ServiceType } from '../utils/state';

export const TOOL_DECLARATIONS = [
  {
    name: 'select_service',
    description: 'Transform the landing page to showcase a specific service and start the cinematic tour. Call when the customer picks a service. Returns the full narration script — read and narrate it continuously without calling any other tools.',
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

/* ------------------------------------------------------------------ */
/*  Full narration script returned by select_service                   */
/*  The model reads this and narrates continuously.                    */
/*  CUE PHRASES (capitalized below) trigger client-side slide changes. */
/* ------------------------------------------------------------------ */

const SHOWER_TOUR_SCRIPT = `
The page has transformed into a cinematic full-screen presentation. The intro slide is showing a dramatic image of a frameless shower.

Narrate the ENTIRE script below continuously. Do NOT call any tools until the very end. The website will automatically change slides as you speak — just keep talking naturally.

---

"Great choice — frameless showers are what we're known for. Every enclosure we build is completely custom. No metal frames — just precision-cut tempered glass and minimal hardware. The result is a clean, open feel that transforms any bathroom into something special.

Let me show you some of our RECENT INSTALLATIONS. Every one of these was custom-built for the homeowner — designed around their space, their style, their vision. You can see the range, from sleek minimalist setups to dramatic floor-to-ceiling enclosures.

Now let me walk you through the options so you can start building yours. We offer nine ENCLOSURE STYLES. The single door is our most popular — minimal and elegant. The door and panel adds a fixed panel for wider openings. The neo-angle is perfect for corner spaces. Our slider works great when you don't have swing clearance. We also do curved glass, arched tops, splash panels, steam shower enclosures, and fully custom configurations.

NOW FOR GLASS. Clear glass is our bestseller — shows off your tilework and opens up the space. Frosted glass is acid-etched for privacy while still letting light through. And rain glass has a beautiful textured pattern — it catches light and provides privacy with artistic flair. All options come in three-eighths or half-inch tempered safety glass.

HARDWARE PERSONALIZES the whole look. Matte black is our hottest trend — bold, modern contrast. Chrome is the timeless choice that works with everything. Brushed nickel has a warm, subtle tone and hides water spots. Polished brass for classic luxury. Satin brass for that soft golden elegance. Plus additional finishes for unique visions.

Now for the FINISHING TOUCHES. Our pull handles are the most requested — clean lines, premium feel. The towel bar mounts directly through the glass, no wall drilling. Plus matching hinges, U-handles, door knobs, and support bars. Everything is solid brass with a lifetime warranty, available in all six hardware finishes.

HERE'S HOW IT ALL comes together. Step one, a free consultation to discuss your vision. Step two, precision laser measurement — every fraction of an inch matters. Step three, custom fabrication, usually two to three weeks. Step four, professional installation, most done in a single day. Start to finish, about three to four weeks.

That's our complete frameless shower line. I'd love to send you our BUYER'S GUIDE — it covers everything we just discussed plus pricing. Would you like that?"

---

After finishing this narration, wait for the customer's response about the buyer's guide. If they say yes, call offer_buyers_guide("Frameless Shower"). If they want to skip ahead, move to quoting.
`;

export async function handleToolCall(
  name: string,
  args: Record<string, string>,
): Promise<{ success: boolean; message?: string; script?: string }> {
  console.log(`[Tool Call] ${name}`, args);

  switch (name) {
    case 'select_service': {
      const service = args.service as ServiceType;
      setState({ currentService: service, isTransformed: true });
      await playTransformAnimation(service);
      // Create slideshow overlay and show intro slide
      createSlideshow();
      await showSlide('intro');
      // Return full narration script — model narrates continuously, no more tool calls
      return { success: true, script: SHOWER_TOUR_SCRIPT };
    }

    case 'offer_buyers_guide': {
      // The tour end is handled by transcript-triggers when it detects "buyer's guide"
      // This tool call may come after the tour ends for explicit model action
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
