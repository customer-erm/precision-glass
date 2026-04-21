/**
 * Generate a custom Precision Glass logo via Gemini 3 Pro Image Preview.
 * Produces:
 *   public/images/logo/icon.png       — PG monogram icon, glass aesthetic
 *   public/images/logo/lockup.png     — icon + wordmark horizontal lockup
 *   public/images/logo/icon-dark.png  — icon optimized for dark backgrounds
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env.prod'), 'utf8');
const m = envRaw.match(/VITE_GEMINI_API_KEY="?([^"\n]+)/);
let key = m ? m[1] : '';
if (key.endsWith(String.fromCharCode(92) + 'n')) key = key.slice(0, -2);

const MODEL = 'gemini-3-pro-image-preview';

const LOGOS = [
  {
    id: 'icon-dark',
    prompt: `Design a premium logo icon: the letters "P" and "G" intertwined and
fused together as a single elegant monogram, rendered as if sculpted from
polished crystal-clear glass. The monogram sits centered in the frame with
generous padding. Subtle refraction and specular highlights suggest real
thick tempered glass (3/8" thickness aesthetic). A hint of deep blue
internal tint catches the light at the edges. The monogram floats against
a SOLID DARK NAVY background (#0a1628). Clean, minimal, architectural,
high-end — think luxury brand mark on the marble wall of a Miami Design
District showroom. The letters are custom-drawn with a geometric sans-serif
feel (inspired by Futura + modernist glasswork), slightly bold, with a
clever intertwine where the bowl of the P hooks through the G. Professional
vector-logo look, perfectly centered composition. No text other than the
monogram, no additional elements, no watermark, no frames or borders.`,
  },
  {
    id: 'lockup-dark',
    prompt: `Design a premium horizontal brand lockup for "Precision Glass". On
the left: the letters "P" and "G" intertwined as a single monogram,
rendered like polished tempered glass with subtle blue internal tint and
crisp specular edge highlights. On the right: the words "Precision Glass"
as a clean custom-drawn wordmark, geometric sans-serif (Futura-ish but a
bit more tailored), "Precision" in white bold weight and "Glass" in a
slightly lighter blue accent color to echo the tint in the icon. The icon
and wordmark are separated by a thin subtle vertical rule. Everything sits
centered on a SOLID DARK NAVY background (#0a1628). Clean, minimal,
architectural luxury brand aesthetic. No tagline, no additional elements,
no frames, no watermark. The full composition should feel like a
professional vector logo lockup suitable for a high-end custom glass
fabricator in Miami.`,
  },
  {
    id: 'icon-light',
    prompt: `Design a premium logo icon: the letters "P" and "G" intertwined and
fused together as a single elegant monogram, rendered as if sculpted from
polished clear tempered glass with dark navy internal tint. The monogram
sits centered in the frame with generous padding. Subtle refraction and
crisp specular highlights suggest real 3/8" glass thickness. The monogram
floats against a SOLID OFF-WHITE background (#f7f9fb). Clean, minimal,
architectural luxury feel. Custom geometric sans-serif letterforms with a
clever intertwine where the bowl of the P hooks through the G. No text
other than the monogram, no frames, no watermarks.`,
  },
];

async function generateOne(item, outDir) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: item.prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: item.id.startsWith('lockup') ? '16:9' : '1:1' },
    },
  };
  console.log(`[${item.id}] generating\u2026`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[${item.id}] API ${res.status}:`, (await res.text()).slice(0, 200));
    return;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      const ext = part.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
      const outPath = path.join(outDir, `${item.id}.${ext}`);
      fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
      console.log(`[${item.id}] saved \u2192 ${path.relative(path.join(__dirname, '..'), outPath)}`);
      return;
    }
  }
  console.warn(`[${item.id}] no image in response`);
}

const outDir = path.join(__dirname, '..', 'public', 'images', 'logo');
fs.mkdirSync(outDir, { recursive: true });

for (const item of LOGOS) {
  await generateOne(item, outDir);
  await new Promise((r) => setTimeout(r, 1500));
}

console.log('\nDone.');
