/**
 * Gemini image generation — turns the 3D enclosure reference image into a
 * photorealistic visualization with the customer's chosen finishes applied.
 *
 * Strategy: instead of describing every detail in text (which was overloading
 * the prompt and producing slow / wrong results), we send the existing 3D
 * shower-style image as visual context and only ask the model to:
 *   - convert it to a photorealistic bathroom photo
 *   - apply the chosen hardware finish, handle style, glass type, and extras
 */

import { images } from '../data/image-map';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const IMAGE_MODEL = 'gemini-3-pro-image-preview';

/* ------------------------------------------------------------------ */
/*  Map an enclosure choice string to its 3D reference image          */
/* ------------------------------------------------------------------ */

function findEnclosureImage(choice: string): string {
  const lower = choice.toLowerCase();
  const list = images.showers.enclosures;
  // Keyword → label match
  const keywordMap: Array<[string, string]> = [
    ['splash', 'Splash Panel'],
    ['walk', 'Splash Panel'],
    ['neo', 'Neo-Angle'],
    ['slider', 'Frameless Slider'],
    ['slide', 'Frameless Slider'],
    ['curved', 'Curved'],
    ['arch', 'Arched'],
    ['steam', 'Steam Shower'],
    ['custom', 'Custom'],
    ['door + panel', 'Door + Panel'],
    ['door+panel', 'Door + Panel'],
    ['panel', 'Door + Panel'],
    ['single', 'Single Door'],
    ['door', 'Single Door'],
  ];
  for (const [kw, label] of keywordMap) {
    if (lower.includes(kw)) {
      const found = list.find((e) => e.label === label);
      if (found) return found.src;
    }
  }
  return list[0].src; // fallback: single door
}

/* ------------------------------------------------------------------ */
/*  Fetch local image as base64 inlineData                             */
/* ------------------------------------------------------------------ */

async function imageToInlineData(src: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) {
      console.warn('[ImageGen] Could not fetch reference image:', src, res.status);
      return null;
    }
    const blob = await res.blob();
    const mimeType = blob.type || 'image/webp';
    const buf = await blob.arrayBuffer();
    // base64 encode
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const data = btoa(binary);
    return { mimeType, data };
  } catch (err) {
    console.warn('[ImageGen] imageToInlineData failed:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Concise prompt — relies on the reference image for layout         */
/* ------------------------------------------------------------------ */

function buildPrompt(choices: Record<string, string>): string {
  const glass = (choices.glass || 'clear glass').trim();
  const hardware = (choices.hardware || 'polished chrome').trim();
  const handle = (choices.handle || '').trim();
  const extras = (choices.extras || '').trim();
  const enclosureLower = (choices.enclosure || '').toLowerCase();
  const isWalkIn = enclosureLower.includes('splash') || enclosureLower.includes('walk');

  const parts: string[] = [];
  parts.push(
    'Recreate the EXACT shower enclosure shape, layout, and panel configuration shown in the reference image, but as a photorealistic interior photograph of that shower installed in a luxury modern bathroom.',
  );
  parts.push(`Glass type: ${glass}.`);
  parts.push(`All hardware (hinges, clips, brackets) finished in ${hardware}.`);

  if (isWalkIn) {
    parts.push('This is an open walk-in layout — there is NO door and NO handle. Do not add a handle to the glass.');
  } else if (handle && handle.toLowerCase() !== 'none') {
    parts.push(`Door handle: ${handle}, in ${hardware} finish.`);
  }

  if (extras && extras.toLowerCase() !== 'none') {
    parts.push(`Additional features: ${extras}.`);
  }

  parts.push(
    'Frameless construction (no metal frames around glass edges). Contemporary large-format tile, recessed lighting, rain showerhead. Architectural photography, eye-level 3/4 angle, warm natural lighting.',
  );

  return parts.join(' ');
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
  const refSrc = findEnclosureImage(choices.enclosure || '');
  console.log('[ImageGen] Reference image:', refSrc);
  console.log('[ImageGen] Prompt:', prompt);

  const refData = await imageToInlineData(refSrc);

  const promptParts: any[] = [{ text: prompt }];
  if (refData) {
    promptParts.push({ inlineData: refData });
  } else {
    console.warn('[ImageGen] Proceeding without reference image');
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
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
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.warn('[ImageGen] No parts in response');
      return null;
    }

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        console.log('[ImageGen] Generated image successfully');
        return dataUrl;
      }
    }

    console.warn('[ImageGen] No image in response parts');
    return null;
  } catch (err) {
    console.warn('[ImageGen] Error:', err);
    return null;
  }
}
