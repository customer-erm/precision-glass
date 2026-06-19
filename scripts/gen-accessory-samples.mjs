/**
 * Generate crisp shower handle/accessory product renders from the existing
 * low-resolution reference images. Saves optimized WebPs back into the public
 * accessory folder.
 *
 *   node scripts/gen-accessory-samples.mjs
 *
 * Reads VITE_GEMINI_API_KEY from .env. Uses the newest image model available
 * to this project, with the prior Flash image model as fallback.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public/images/shower-details/accessories');

function readKey() {
  if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY;
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*VITE_GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  return '';
}

function mimeFor(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'image/webp';
}

const API_KEY = readKey();
if (!API_KEY) {
  console.error('No VITE_GEMINI_API_KEY found (.env or env var).');
  process.exit(1);
}

const MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

const SHARED = [
  'Use case: product-mockup.',
  'Asset type: shower hardware option card and buyer-guide modal image.',
  'Use the reference image only to identify the hardware type and proportions.',
  'Create a clean photorealistic high-resolution studio product render.',
  'Subject must be isolated, centered, fully visible, crisp, and correctly engineered for frameless shower glass.',
  'Seamless warm white or very light gray background, soft studio reflections, polished metal, realistic bevels.',
  'No labels, no text, no watermark, no hands, no people, no decorative bathroom scene.',
].join(' ');

const ASSETS = [
  {
    file: 'hinge.webp',
    prompt: `${SHARED} Subject: a slim frameless shower door pivot hinge with two rectangular clamp plates and a very narrow central knuckle, premium brushed metal finish.`,
  },
  {
    file: '90-degree.webp',
    prompt: `${SHARED} Subject: a frameless glass-to-glass 90 degree corner clamp, two small square clamp plates joined at a precise right angle, premium chrome finish.`,
  },
  {
    file: 'pull.webp',
    prompt: `${SHARED} Subject: a straight tubular shower door pull handle with two round through-glass standoff mounts, premium polished chrome finish.`,
  },
  {
    file: 'u-handle-1.webp',
    prompt: `${SHARED} Subject: a classic rounded-corner D-shaped shower pull handle mounted through glass with two round escutcheon washers, premium polished chrome finish.`,
  },
  {
    file: 'ladder2.webp',
    prompt: `${SHARED} Subject: a tall ladder-style shower door pull with two vertical tubes and two clean through-glass mounting feet, premium polished chrome finish.`,
  },
  {
    file: 'knob.webp',
    prompt: `${SHARED} Subject: a round frameless shower door knob with circular through-glass escutcheon, compact and polished, premium chrome finish.`,
  },
  {
    file: 'towel.webp',
    prompt: `${SHARED} Subject: an accurate frameless shower towel-bar / pull combo shown as a clean product render on a faint transparent glass plane. One tall vertical tubular pull handle is on the OUTSIDE at the right-side latch end, extending above and below its two connector posts. A straight horizontal towel rail is on the INSIDE, passing left from the upper shared through-glass mount. Show three aligned round through-glass collars: top shared mount at the vertical pull, bottom pull mount, and far towel-bar mount. Do not show a centered dangling handle under the towel rail. Premium polished chrome finish.`,
  },
  {
    file: 'hook.webp',
    prompt: `${SHARED} Subject: a compact through-glass robe hook with a round escutcheon and small upturned hook, premium polished chrome finish.`,
  },
  {
    file: 'bar.webp',
    prompt: `${SHARED} Subject: a slim adjustable frameless shower support/stabilizer bar with round wall mount and glass clamp end, premium polished chrome finish.`,
  },
  {
    file: 'grid.webp',
    prompt: `${SHARED} Subject: a close-up sample of matte black decorative shower glass grid muntin bars applied to clear glass, even top, bottom, side, and vertical bars.`,
  },
];

const requested = new Set(process.argv.slice(2));
const assetsToGenerate = requested.size ? ASSETS.filter((asset) => requested.has(asset.file)) : ASSETS;
if (requested.size && assetsToGenerate.length === 0) {
  console.error(`No matching assets. Valid files: ${ASSETS.map((asset) => asset.file).join(', ')}`);
  process.exit(1);
}

async function generateOne(asset) {
  const inputPath = join(OUT_DIR, asset.file);
  const source = readFileSync(inputPath).toString('base64');
  const mimeType = mimeFor(asset.file);
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: asset.prompt },
                { inlineData: { mimeType, data: source } },
              ],
            }],
          }),
        },
      );
      if (!res.ok) {
        console.warn(`  ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 220)}`);
        continue;
      }
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p) => p.inlineData?.data);
      if (imgPart) {
        console.log(`  ok ${model}`);
        return Buffer.from(imgPart.inlineData.data, 'base64');
      }
      console.warn(`  ${model} returned no image part`);
    } catch (err) {
      console.warn(`  ${model} error: ${err?.message || err}`);
    }
  }
  return null;
}

let ok = 0;
for (const asset of assetsToGenerate) {
  console.log(`Generating ${asset.file}...`);
  const buf = await generateOne(asset);
  if (!buf) {
    console.error(`  FAILED ${asset.file}`);
    continue;
  }
  const webp = await sharp(buf)
    .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: false })
    .webp({ quality: 92 })
    .toBuffer();
  writeFileSync(join(OUT_DIR, asset.file), webp);
  console.log(`  saved ${asset.file} (${Math.round(webp.length / 1024)} KB)`);
  ok++;
}

console.log(`Done: ${ok}/${assetsToGenerate.length} generated.`);
process.exit(ok === assetsToGenerate.length ? 0 : 1);
