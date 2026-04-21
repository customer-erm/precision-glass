import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env.prod'), 'utf8');
const m = envRaw.match(/VITE_GEMINI_API_KEY="?([^"\n]+)/);
let key = m ? m[1] : '';
if (key.endsWith(String.fromCharCode(92) + 'n')) key = key.slice(0, -2);

const prompt = `Photorealistic close-up headshot portrait of "Alex" — a warm, friendly
glass design specialist in her early 30s, subtle smile, direct gaze at the
camera. She has shoulder-length wavy auburn hair, a light complexion with
freckles, clear bright eyes. Wearing a crisp white collared shirt under a
deep navy blue blazer. Soft natural window light from the left casting a
gentle highlight on her cheek. Background is an out-of-focus modern glass
workshop — subtle hints of large glass panels and steel fabrication racks,
but the background is blurred into soft bokeh dominated by blue and grey
tones. Tight framing — head and shoulders only, centered. No glasses, no
earrings, no jewelry. Professional editorial portrait style like a LinkedIn
or corporate team page photo. Shallow depth of field, 85mm lens, Canon
5D aesthetic. Very warm, approachable, competent. No text, no logos, no
watermarks.`;

const body = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: { aspectRatio: '1:1' },
  },
};

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${key}`;
console.log('Calling API...');
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error('API error:', res.status, (await res.text()).slice(0, 500));
  process.exit(1);
}

const data = await res.json();
const parts = data?.candidates?.[0]?.content?.parts || [];
for (const part of parts) {
  if (part.inlineData?.mimeType?.startsWith('image/')) {
    const ext = part.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
    const outPath = path.join(__dirname, '..', 'public', 'images', `avatar.${ext}`);
    fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
    console.log(`Saved: ${outPath}`);
    process.exit(0);
  }
}
console.error('No image in response');
process.exit(1);
