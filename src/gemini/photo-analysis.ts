import { getBathroomPhoto, getBathroomPhotoAnalysis, setBathroomPhotoAnalysis } from '../utils/bathroom-photo';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL = 'gemini-2.5-flash';

export async function analyzeBathroomPhoto(): Promise<string> {
  const existing = getBathroomPhotoAnalysis();
  if (existing) return existing;

  const photo = getBathroomPhoto();
  if (!photo || !API_KEY) return '';

  try {
    const [mime, b64] = photo.dataUrl.replace(/^data:/, '').split(';base64,');
    const prompt = [
      'You are helping a frameless shower designer review a customer bathroom photo.',
      'Describe the visible bathroom layout in 2 concise sentences, then give 1 practical enclosure recommendation.',
      'Focus on shower/tub footprint, curb/threshold, walls, door swing clearance, vanity/toilet conflicts, plumbing wall, and whether a slider, hinged door, door+panel, splash panel, or steam enclosure seems realistic.',
      'Be honest: say that field measure is still required. Do not mention price or schedule.',
    ].join(' ');

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mime || photo.mimeType, data: b64 } },
          ],
        }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 180 },
      }),
    });
    if (!res.ok) throw new Error(`photo_analysis_${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (text) setBathroomPhotoAnalysis(text);
    return text;
  } catch (err) {
    console.warn('[PhotoAnalysis] Failed:', err);
    return '';
  }
}
