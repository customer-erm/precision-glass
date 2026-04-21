/**
 * One-shot image generation script for:
 *   - Sleek 3D product renders of every shower enclosure type (replaces
 *     the old flat line drawings)
 *   - About page supporting imagery (founder portrait, workshop,
 *     installation in progress)
 *
 * Uses Google's Gemini 3 Pro Image Preview (Nano Banana Pro) for best
 * quality output.
 *
 * Usage:
 *   GEMINI_API_KEY=xxxxx node scripts/gen-images.mjs [group]
 *
 *   group = "enclosures" | "about" | "all"  (default: all)
 *
 * Saves to:
 *   public/images/shower-details/enclosures-3d/<id>.webp
 *   public/images/about/<id>.webp
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-3-pro-image-preview';

if (!API_KEY) {
  console.error('ERROR: set GEMINI_API_KEY env var before running.');
  process.exit(1);
}

/* ================================================================== */
/*  Prompt definitions                                                  */
/* ================================================================== */

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

const ENCLOSURES = [
  {
    id: 'single-door',
    label: 'Single Door',
    prompt: `A single hinged frameless glass door, 30 inches wide, with two wall-mounted pivot hinges on the right side. Just one clean sheet of tempered glass forming the entire shower door, no fixed panels, no bottom rail. A simple chrome pull handle mounted through the glass on the left side. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'door-panel',
    label: 'Door + Panel',
    prompt: `Frameless shower enclosure with TWO glass panels: one hinged door on the right (28 inches wide) and one fixed glass panel on the left (30 inches wide), joined at a subtle vertical seam. Pivot hinges on the right wall. Chrome U-handle on the door. No frames around any glass edges. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'neo-angle',
    label: 'Neo-Angle',
    prompt: `Neo-angle frameless shower enclosure — THREE glass panels forming a pentagonal/diamond footprint in a corner. Two angled side panels meeting the wall, one center door panel that opens outward with pivot hinges, glass-to-glass clips connecting the panels at the angled joints. Chrome hardware. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'corner-90',
    label: '90° Corner',
    prompt: `Frameless 90-degree corner shower enclosure tucked into a bathroom corner. TWO glass walls meet at a clean right-angle corner via glass-to-glass clips at top and bottom. One of the walls includes a HINGED GLASS DOOR (approximately 24-28 inches wide) with two chrome pivot hinges mounted to the adjacent wall and a vertical chrome pull handle mounted through the glass on the door. The other wall is a fixed glass panel. Knife-edge glass-to-glass corner where the two walls meet. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'slider',
    label: 'Frameless Slider',
    prompt: `Frameless sliding shower door system with TWO large parallel glass panels — one fixed, one sliding — on a continuous top-mounted stainless steel rail. Two visible chrome roller trolleys hanging from the rail. Subtle floor guide. The door slides horizontally, NO hinges, NO pivots anywhere. Clean minimal silhouette. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'curved',
    label: 'Curved',
    prompt: `Curved frameless shower enclosure — a single radius-bent sheet of tempered glass forming a smooth arc shape for the shower. No seams, no straight edges on the curved panel. Chrome wall brackets. Spa-like flowing profile. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'arched',
    label: 'Arched',
    prompt: `Frameless arched shower enclosure fitted INSIDE an arched masonry opening in the bathroom wall. TWO matching hinged glass doors meeting in the middle — each door\u2019s top edge follows a smooth arch that matches the stone archway above. The outer sides of the doors are straight and vertical. Both doors have chrome pull handles mounted vertically through the glass near the center where they meet. Pivot hinges on both outer edges. The arched stone/tile opening frames the glass elegantly like a chapel entry, with a visible low stone threshold at the bottom. The glass itself is the star — the arches on the glass match the wall arch. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'splash-panel',
    label: 'Splash Panel',
    prompt: `Minimalist walk-in splash panel — a SINGLE FIXED sheet of frameless tempered glass, 28 inches wide and ceiling-height, mounted to the wall with two small chrome clips. NO door, NO hinges, NO moving parts. Just one stationary pane of glass acting as a water barrier for an open walk-in shower. Clean, sculptural, minimal. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'steam-shower',
    label: 'Steam Shower',
    prompt: `Steam shower enclosure — fully sealed frameless glass enclosure, floor to ceiling. Glass door plus a transom/header panel above it. Compression seals around all edges. Chrome hardware. Designed to contain steam. ${BASE_ENC_STYLE}`,
  },
  {
    id: 'custom',
    label: 'Custom',
    prompt: `Custom multi-panel frameless shower enclosure with an unusual layout — four glass panels at varying angles forming an irregular footprint. Glass-to-glass clips at the angled joints, chrome hardware. Bespoke configuration for a non-standard bathroom. ${BASE_ENC_STYLE}`,
  },
];

const ABOUT_IMAGES = [
  {
    id: 'founder-portrait',
    prompt: `Photorealistic editorial portrait of a friendly, confident Hispanic-American master glazier in his mid-50s, short salt-and-pepper hair, wearing a clean navy polo shirt with a small "Precision Glass" logo embroidered on the chest. Standing in front of a brightly-lit glass fabrication workshop with large panels of tempered glass on vertical racks behind him, slightly out of focus. Warm natural window light from the left side. Professional magazine-quality portrait, shallow depth of field, 85mm lens look. Relaxed friendly expression, arms loosely crossed or one hand on hip. High-end real estate photography style. No text, no watermarks.`,
  },
  {
    id: 'workshop',
    prompt: `Photorealistic wide interior of a modern glass fabrication workshop — large vertical racks holding sheets of tempered glass of various sizes, a CNC glass cutting table in the foreground with a polished aluminum surface, bright overhead LED lighting, clean polished concrete floor, stainless steel tempering oven in the background. Industrial but immaculately clean and organized. Clear midday lighting, wide angle architectural interior photograph. No people. High-end commercial photography quality.`,
  },
  {
    id: 'installation',
    prompt: `Photorealistic image of two professional glass installers (one Hispanic man in his 40s, one younger man in his late 20s, both in matching navy polo shirts) carefully setting a large frameless glass shower door panel into place in a luxury modern bathroom. One installer steadies the glass from above while the other secures a chrome pivot hinge at the base. Warm natural light through a large window. High-end home interior, white marble tile walls. Documentary-style editorial photography, shallow depth of field, focused on the installers' hands on the glass. No text, no watermarks.`,
  },
  {
    id: 'hero-luxury',
    prompt: `Photorealistic hero image of a finished high-end luxury master bathroom with a stunning frameless glass shower enclosure as the centerpiece. Polished chrome hardware, crystal-clear glass, soft neutral tile (large format white marble with gray veining), a rain showerhead, a floating vanity with vessel sinks to the side, warm golden-hour natural light pouring through a large frosted window. Spa-like, calm, aspirational. Real-estate magazine quality, architectural wide-angle shot. No people, no text, no watermarks.`,
  },
];

/* ================================================================== */
/*  Generation                                                          */
/* ================================================================== */

async function generateImage(prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '1:1' },
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return {
        mimeType: part.inlineData.mimeType,
        data: Buffer.from(part.inlineData.data, 'base64'),
      };
    }
  }
  throw new Error('No image in response');
}

async function run(items, outDir, label) {
  await fs.mkdir(outDir, { recursive: true });
  console.log(`\n=== ${label} (${items.length} images) ===`);
  for (const item of items) {
    const outPath = path.join(outDir, `${item.id}.webp`);
    try {
      console.log(`[${item.id}] generating\u2026`);
      const img = await generateImage(item.prompt);
      // Gemini returns PNG/JPEG. Save as .webp? Actually save with
      // original mime. We'll keep extension simple by detecting.
      const ext = img.mimeType.includes('png') ? 'png' : img.mimeType.includes('webp') ? 'webp' : 'jpg';
      const finalPath = outPath.replace(/\.webp$/, `.${ext}`);
      await fs.writeFile(finalPath, img.data);
      console.log(`[${item.id}] saved \u2192 ${path.relative(ROOT, finalPath)} (${(img.data.length / 1024).toFixed(0)}kb)`);
    } catch (err) {
      console.warn(`[${item.id}] FAILED:`, err.message);
    }
    // Be gentle — rate-limit between calls
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const group = process.argv[2] || 'all';

if (group === 'enclosures' || group === 'all') {
  await run(ENCLOSURES, path.join(ROOT, 'public', 'images', 'shower-details', 'enclosures-3d'), 'Enclosure 3D renders');
}
if (group === 'about' || group === 'all') {
  await run(ABOUT_IMAGES, path.join(ROOT, 'public', 'images', 'about'), 'About page imagery');
}

console.log('\nDone.');
