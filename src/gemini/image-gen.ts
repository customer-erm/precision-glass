/**
 * Gemini image generation — creates a visualization of the customer's
 * selected shower configuration for the quote summary.
 * Uses gemini-2.5-flash-image (stable image gen model).
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

export async function generateShowerImage(
  choices: Record<string, string>,
): Promise<string | null> {
  if (!API_KEY) {
    console.warn('[ImageGen] No API key');
    return null;
  }

  const enclosure = choices.enclosure || 'frameless single door';
  const glass = choices.glass || 'clear glass';
  const hardware = choices.hardware || 'chrome';
  const handle = choices.handle || 'pull handle';
  const extras = choices.extras && choices.extras !== 'none' ? choices.extras : '';

  const prompt = `Generate an image: A photorealistic interior design photograph of a modern bathroom featuring a ${enclosure} frameless shower enclosure with ${glass}, ${hardware} hardware finish, and ${handle}. ${extras ? `The shower includes ${extras}.` : ''} The bathroom has contemporary tiling, natural lighting, and a luxurious spa-like atmosphere. Professional interior photography, high-end real estate style, warm lighting.`;

  console.log('[ImageGen] Generating with model:', IMAGE_MODEL);
  console.log('[ImageGen] Prompt:', prompt.substring(0, 120) + '...');

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
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[ImageGen] API error:', response.status, errorText.substring(0, 200));
      return null;
    }

    const data = await response.json();
    console.log('[ImageGen] Response received, checking for image data...');

    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.warn('[ImageGen] No parts in response:', JSON.stringify(data).substring(0, 300));
      return null;
    }

    // Find inline image data
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        console.log('[ImageGen] Generated image successfully (' + part.inlineData.mimeType + ')');
        return dataUrl;
      }
    }

    // Log what we got instead
    console.warn('[ImageGen] No image in response parts:', parts.map((p: any) => Object.keys(p)));
    return null;
  } catch (err) {
    console.warn('[ImageGen] Error:', err);
    return null;
  }
}
