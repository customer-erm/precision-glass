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

/* Map a handle choice → the accessory reference image we ship in /public */
function findHandleImage(choice: string): string | null {
  const lower = (choice || '').toLowerCase();
  if (!lower || lower === 'none' || lower === 'n/a') return null;
  const list = images.showers.accessories;
  const find = (id: string) => list.find((a) => a.id === id)?.src || null;
  if (lower.includes('ladder')) return find('acc-ladder');
  if (lower.includes('u-handle') || lower.includes('u handle') || lower.includes('uhandle')) return find('acc-uhandle');
  if (lower.includes('knob')) return find('acc-knob');
  if (lower.includes('pull')) return find('acc-pull');
  return null;
}

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
    ['90', '90° Corner'],
    ['ninety', '90° Corner'],
    ['corner', '90° Corner'],
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
  const accessories = (choices.accessories || '').trim();
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
  } else if (handle && handle.toLowerCase() !== 'none' && handle.toLowerCase() !== 'n/a') {
    const handleLower = handle.toLowerCase();
    let handleDetail = '';
    if (handleLower.includes('ladder')) {
      handleDetail = 'a LADDER PULL handle — a tall vertical bar with multiple horizontal rungs between two vertical rails (looks like a small ladder mounted vertically on the door). NOT a single bar. NOT a towel bar. It must have visible horizontal rungs.';
    } else if (handleLower.includes('u-handle') || handleLower.includes('u handle') || handleLower.includes('uhandle')) {
      handleDetail = 'a U-SHAPED handle — a U-bracket pull mounted on the glass surface with two short stand-off attachment points and a single horizontal grip bar between them. NOT a vertical bar. NOT a towel bar. The shape is a clear U.';
    } else if (handleLower.includes('knob')) {
      handleDetail = 'a small ROUND KNOB — a single discreet circular doorknob mounted through-hole in the glass. NO bar, NO pull, just a small round knob.';
    } else if (handleLower.includes('pull')) {
      handleDetail = 'a single SHORT VERTICAL TUBULAR PULL HANDLE roughly 8 inches long, mounted through-hole on the door. It is a SHORT pull, NOT a long towel bar, NOT a horizontal bar. Mounted vertically on the glass door.';
    } else {
      handleDetail = `a ${handle} door handle`;
    }
    parts.push(`CRITICAL — DOOR HANDLE (this MUST match the second reference image exactly): ${handleDetail} The handle finish is ${hardware}. Do not substitute a different style. The handle is mounted ONLY on the door panel — no other glass panels have handles.`);
  }

  if (accessories) {
    parts.push(`Additional fitted accessories on the shower (must be visible in the photo, in ${hardware} finish): ${accessories}. Place them in plausible locations — towel bars on a fixed glass panel, robe hooks on the wall side, support bars horizontally inside the enclosure.`);
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

  const t0 = performance.now();
  console.log('[ImageGen] === START === choices:', choices);
  const prompt = buildPrompt(choices);
  const refSrc = findEnclosureImage(choices.enclosure || '');
  const handleSrc = findHandleImage(choices.handle || '');
  console.log('[ImageGen] Enclosure ref:', refSrc);
  console.log('[ImageGen] Handle ref:', handleSrc);
  console.log('[ImageGen] Prompt:', prompt);

  const [refData, handleData] = await Promise.all([
    imageToInlineData(refSrc),
    handleSrc ? imageToInlineData(handleSrc) : Promise.resolve(null),
  ]);
  if (refData) console.log('[ImageGen] Enclosure ref loaded:', refData.mimeType, refData.data.length);
  if (handleData) console.log('[ImageGen] Handle ref loaded:', handleData.mimeType, handleData.data.length);

  const promptParts: any[] = [
    { text: prompt },
  ];
  if (refData) {
    promptParts.push({ text: 'REFERENCE IMAGE 1 (enclosure layout — copy this exact shape and panel configuration):' });
    promptParts.push({ inlineData: refData });
  }
  if (handleData) {
    promptParts.push({ text: 'REFERENCE IMAGE 2 (door handle style — the door must use a handle that looks exactly like this):' });
    promptParts.push({ inlineData: handleData });
  }

  try {
    console.log('[ImageGen] POST → ', IMAGE_MODEL);
    const tFetch = performance.now();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: '1:1',
            },
          },
        }),
      },
    );

    console.log('[ImageGen] HTTP', response.status, `(${Math.round(performance.now() - tFetch)}ms)`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ImageGen] API error body:', errorText.substring(0, 800));
      return null;
    }

    const data = await response.json();
    console.log('[ImageGen] Response keys:', Object.keys(data || {}));
    if (data?.promptFeedback) console.log('[ImageGen] promptFeedback:', JSON.stringify(data.promptFeedback));
    if (data?.candidates?.[0]?.finishReason) console.log('[ImageGen] finishReason:', data.candidates[0].finishReason);
    if (data?.candidates?.[0]?.safetyRatings) console.log('[ImageGen] safetyRatings:', JSON.stringify(data.candidates[0].safetyRatings));

    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.warn('[ImageGen] No parts in response. Full data:', JSON.stringify(data).substring(0, 800));
      return null;
    }
    console.log('[ImageGen] Parts received:', parts.length, 'shapes:', parts.map((p: any) => Object.keys(p)));

    for (const part of parts) {
      if (part.text) console.log('[ImageGen] text part:', part.text.substring(0, 200));
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        console.log('[ImageGen] ✅ SUCCESS', part.inlineData.mimeType, 'base64 len:', part.inlineData.data.length, `total ${Math.round(performance.now() - t0)}ms`);
        return dataUrl;
      }
    }

    console.warn('[ImageGen] ❌ No image part in response');
    return null;
  } catch (err) {
    console.error('[ImageGen] Exception:', err);
    return null;
  }
}
