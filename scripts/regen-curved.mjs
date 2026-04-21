import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env.prod'), 'utf8');
const m = envRaw.match(/VITE_GEMINI_API_KEY="?([^"\n]+)/);
let key = m ? m[1] : '';
if (key.endsWith(String.fromCharCode(92) + 'n')) key = key.slice(0, -2);

const BASE_ENC_STYLE = `
Style: clean modern 3D architectural product render in editorial CGI style.
The shower enclosure is installed inside a MINIMAL BATHROOM CONTEXT so the
viewer can clearly understand how it fits in a real bathroom:
  - A deep navy / dark blue subway tile wall directly behind the shower
    (large 4x8 inch glossy ceramic tiles, thin light grout lines), wrapping
    inside the shower area
  - A light grey / warm white tile floor extending out in front of the shower
  - A simple chrome rain showerhead and single lever mixer on the rear wall
  - Everything else (side walls, ceiling, surrounding room) fades into a soft
    clean neutral gradient studio background
Crystal-clear tempered glass panels (3/8 inch thick) with realistic subtle
edge reflections, light refraction, and slight ambient occlusion. Brushed
nickel / chrome hardware where applicable. Three-quarter angle view slightly
above eye-level so the floor tile is visible. Soft diffused natural lighting
from the upper left. Architectural visualization quality, ultra-sharp,
photorealistic materials. No people, no text, no watermarks, no brand logos.
The shower is the hero — floor and back wall tile provide just enough
context, nothing more.
`.trim();

const prompt = `Curved frameless shower enclosure — a single radius-bent sheet of tempered glass forming a smooth arc shape for the shower. No seams, no straight edges on the curved panel. Chrome wall brackets. Spa-like flowing profile. ${BASE_ENC_STYLE}`;

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
  console.error('API error:', res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}

const data = await res.json();
const parts = data?.candidates?.[0]?.content?.parts || [];
for (const part of parts) {
  if (part.inlineData?.mimeType?.startsWith('image/')) {
    const ext = part.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
    const outPath = path.join(__dirname, '..', 'public', 'images', 'shower-details', 'enclosures-3d', `curved.${ext}`);
    fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
    console.log(`Saved: ${outPath}`);
    process.exit(0);
  }
}
console.error('No image in response');
process.exit(1);
