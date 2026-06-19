/**
 * One-off: generate high-resolution glass sample swatches with Gemini for the
 * buyer's-guide modal + glass slide. Saves optimized WebPs into the public glass folder.
 *
 *   node scripts/gen-glass-samples.mjs
 *
 * Reads VITE_GEMINI_API_KEY from .env. Uses the newest image model available
 * to this project, with the prior Flash image model as fallback. Safe to re-run
 * (overwrites).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public/images/shower-details/glass');

function readKey() {
  if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY;
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*VITE_GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  return '';
}

const API_KEY = readKey();
if (!API_KEY) {
  console.error('No VITE_GEMINI_API_KEY found (.env or env var).');
  process.exit(1);
}

const MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

const SHARED =
  'Photorealistic studio product shot, ultra sharp, high resolution, soft even lighting, ' +
  'shallow depth of field. A single pane of 3/8" frameless tempered shower glass shown ' +
  'straight-on, filling the frame, with a softly blurred warm luxury bathroom behind it so ' +
  'the glass texture and clarity read clearly. Polished factory edge visible. No frame, no ' +
  'hardware, no people, no text or watermark. Premium, magazine-quality.';

const SAMPLES = [
  {
    file: 'clear-sample.webp',
    prompt: `${SHARED} GLASS TYPE: ultra-clear low-iron CLEAR glass — perfectly transparent, ` +
      `crisp, almost invisible, with a faint clean green-free edge and bright specular highlights.`,
  },
  {
    file: 'frosted-sample.webp',
    prompt: `${SHARED} GLASS TYPE: acid-etched FROSTED glass — uniform satin matte surface, ` +
      `translucent, soft milky diffusion that obscures the background into soft shapes, elegant and private.`,
  },
  {
    file: 'rain-sample.webp',
    prompt: `${SHARED} GLASS TYPE: textured RAIN glass — a vertical reeded / cascading water-droplet ` +
      `pattern pressed into the glass, distorting the background into rippled vertical streaks, ` +
      `catching the light along the flutes. Clearly textured, decorative, semi-private.`,
  },
];

async function generateOne(prompt) {
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );
      if (!res.ok) {
        console.warn(`  ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p) => p.inlineData?.data);
      if (imgPart) {
        console.log(`  ✓ ${model}`);
        return Buffer.from(imgPart.inlineData.data, 'base64');
      }
      console.warn(`  ${model} returned no image part`);
    } catch (err) {
      console.warn(`  ${model} error: ${err?.message || err}`);
    }
  }
  return null;
}

mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
for (const s of SAMPLES) {
  console.log(`Generating ${s.file}…`);
  const buf = await generateOne(s.prompt);
  if (buf) {
    const webp = await sharp(buf).webp({ quality: 92 }).toBuffer();
    writeFileSync(join(OUT_DIR, s.file), webp);
    console.log(`  saved ${s.file} (${Math.round(webp.length / 1024)} KB)`);
    ok++;
  } else {
    console.error(`  FAILED ${s.file}`);
  }
}
console.log(`Done: ${ok}/${SAMPLES.length} generated.`);
process.exit(ok === SAMPLES.length ? 0 : 1);
