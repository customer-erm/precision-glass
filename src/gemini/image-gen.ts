/**
 * Gemini image generation — creates a photorealistic visualization of the
 * customer's selected shower configuration for the quote summary.
 * Uses gemini-3-pro-image-preview (Nano Banana Pro) for best quality.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const IMAGE_MODEL = 'gemini-3-pro-image-preview';

/* ------------------------------------------------------------------ */
/*  Detailed enclosure descriptions for accurate image generation      */
/* ------------------------------------------------------------------ */

const ENCLOSURE_DESCRIPTIONS: Record<string, string> = {
  'single door': 'a single frameless glass door panel (24-36 inches wide) mounted with two pivot hinges on one side, swinging outward. No fixed panels — just one clean sheet of tempered glass forming the shower entry in an alcove setting. The hinges attach directly to the wall with minimal metal clips.',

  'door + panel': 'a frameless hinged glass door paired with a fixed glass panel on one side, designed for wider shower openings (48-60 inches). The door swings open on pivot hinges while the stationary panel is secured with wall-mount clips. A small gap between door and panel is sealed with a clear sweep.',

  'neo-angle': 'a neo-angle frameless shower enclosure fitted into a corner, consisting of three glass panels forming a diamond/pentagonal shape — two angled side panels and a center door panel that opens outward. Glass-to-glass clips connect the panels at the angles. The enclosure sits on a corner shower base.',

  'frameless slider': 'a frameless sliding glass shower door system with two large glass panels — one fixed and one sliding on a top-mounted track/rail. The sliding panel glides smoothly behind the fixed panel. No swing clearance needed. Mounted with minimal hardware clips at top and bottom.',

  'curved': 'a curved frameless glass shower enclosure with a single radius-formed bent glass panel that curves elegantly around the shower space. No straight edges on the curved section. The glass is heat-bent into a smooth arc shape, creating a sleek spa-like entry.',

  'arched': 'a frameless glass shower enclosure with an arched/curved top edge on the glass panels. The sides are straight but the top of the glass door features a decorative arch shape, creating an elegant statement piece. Mounted with standard pivot hinges.',

  'splash panel': 'a single fixed frameless glass splash panel (24-30 inches wide) mounted to the wall with simple wall clips. NO door, NO hinges, NO moving parts — just one stationary sheet of glass acting as a water barrier for an open walk-in shower design. The entry side is completely open with no glass.',

  'steam shower': 'a fully enclosed floor-to-ceiling frameless glass steam shower enclosure. The glass panels extend all the way to the ceiling with a transom panel above the door to create a complete seal. No gaps anywhere — designed to contain steam. The door has a tight seal strip.',

  'custom': 'a custom multi-panel frameless glass shower enclosure with a unique bespoke configuration tailored to an irregular bathroom space. Multiple glass panels joined with glass-to-glass clips at various angles.',
};

const GLASS_DESCRIPTIONS: Record<string, string> = {
  'clear glass': 'crystal clear tempered glass with no coating, tint, or texture — fully transparent, showing the tile work behind it with maximum light transmission',
  'frosted glass': 'acid-etched frosted tempered glass with a uniform satin/matte finish across the entire surface, translucent but not transparent, diffusing light softly for privacy',
  'rain glass': 'rain-textured tempered glass with a vertical water-droplet pattern embossed into one side of the glass, providing artistic privacy while letting distorted light through',
};

const HANDLE_DESCRIPTIONS: Record<string, string> = {
  'pull handle': 'a vertical tubular pull handle (6-8 inches long) mounted through-hole in the glass door',
  'pull handles': 'a vertical tubular pull handle (6-8 inches long) mounted through-hole in the glass door',
  'u-handle': 'a U-shaped handle mounted on the glass door surface with two attachment points',
  'u-handles': 'a U-shaped handle mounted on the glass door surface with two attachment points',
  'ladder pull': 'a ladder-style door pull with horizontal rungs between two vertical bars, mounted on the glass',
  'ladder pulls': 'a ladder-style door pull with horizontal rungs between two vertical bars, mounted on the glass',
  'knob': 'a small round glass door knob mounted through-hole in the glass',
  'knobs': 'a small round glass door knob mounted through-hole in the glass',
};

/* ------------------------------------------------------------------ */
/*  Prompt builder                                                     */
/* ------------------------------------------------------------------ */

function buildPrompt(choices: Record<string, string>): string {
  const enclosureRaw = (choices.enclosure || 'single door').toLowerCase();
  const glassRaw = (choices.glass || 'clear glass').toLowerCase();
  const hardwareRaw = (choices.hardware || 'chrome').toLowerCase();
  const handleRaw = (choices.handle || 'pull handle').toLowerCase();
  const extras = choices.extras && choices.extras.toLowerCase() !== 'none' ? choices.extras : '';

  // Find best match from description maps
  const enclosureDesc = Object.entries(ENCLOSURE_DESCRIPTIONS).find(([k]) => enclosureRaw.includes(k))?.[1]
    || ENCLOSURE_DESCRIPTIONS['single door'];
  const glassDesc = Object.entries(GLASS_DESCRIPTIONS).find(([k]) => enclosureRaw.includes(k) || glassRaw.includes(k))?.[1]
    || GLASS_DESCRIPTIONS['clear glass'];
  const handleDesc = Object.entries(HANDLE_DESCRIPTIONS).find(([k]) => handleRaw.includes(k))?.[1]
    || 'a pull handle mounted on the glass door';

  let prompt = `Generate a photorealistic interior design photograph of a luxury bathroom shower, shot at eye level with a wide-angle lens.

SHOWER ENCLOSURE: ${enclosureDesc}

GLASS TYPE: The glass panels are ${glassDesc}.

HARDWARE FINISH: All metal hardware (hinges, clips, handles, support bars) is in a ${hardwareRaw} finish.

HANDLE: The door features ${handleDesc} in ${hardwareRaw} finish.`;

  if (extras) {
    prompt += `\n\nUPGRADES: The shower also includes ${extras}.`;
  }

  prompt += `

CRITICAL DETAILS:
- FRAMELESS means there are NO metal frames or channels around the edges of the glass. The glass edges are exposed and polished. Only small discrete hardware pieces (hinges, clips) attach the glass to walls.
- The bathroom has contemporary large-format wall tiles, a modern tile floor, recessed LED lighting, and a rain showerhead.
- Professional architectural photography style, warm natural lighting, high-end real estate quality.
- Show the full shower enclosure from a 3/4 angle so the door configuration and glass type are clearly visible.`;

  return prompt;
}

/* ------------------------------------------------------------------ */
/*  API call                                                           */
/* ------------------------------------------------------------------ */

export async function generateShowerImage(
  choices: Record<string, string>,
): Promise<string | null> {
  if (!API_KEY) {
    console.warn('[ImageGen] No API key');
    return null;
  }

  const prompt = buildPrompt(choices);

  console.log('[ImageGen] Generating with model:', IMAGE_MODEL);
  console.log('[ImageGen] Prompt:', prompt.substring(0, 200) + '...');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }],
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            aspectRatio: '1:1',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[ImageGen] API error:', response.status, errorText.substring(0, 300));
      return null;
    }

    const data = await response.json();
    console.log('[ImageGen] Response received, checking for image data...');

    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.warn('[ImageGen] No parts in response:', JSON.stringify(data).substring(0, 300));
      return null;
    }

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        console.log('[ImageGen] Generated image successfully (' + part.inlineData.mimeType + ')');
        return dataUrl;
      }
    }

    console.warn('[ImageGen] No image in response parts:', parts.map((p: any) => Object.keys(p)));
    return null;
  } catch (err) {
    console.warn('[ImageGen] Error:', err);
    return null;
  }
}
