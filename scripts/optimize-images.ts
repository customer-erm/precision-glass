import sharp from 'sharp';
import { readdir, mkdir } from 'fs/promises';
import { join, parse, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_ROOT = join(__dirname, '..', '..');
const DEST_ROOT = join(__dirname, '..', 'public', 'images');

interface ConvertTask {
  src: string;
  dest: string;
  width: number;
  quality: number;
}

const MAPPINGS: { srcDir: string; destDir: string; width: number; quality: number; rename?: Record<string, string> }[] = [
  { srcDir: 'Commercial', destDir: 'commercial', width: 1200, quality: 82 },
  { srcDir: 'Railings', destDir: 'railings', width: 1200, quality: 82 },
  { srcDir: 'Showers', destDir: 'showers', width: 1920, quality: 85 },
  { srcDir: 'Process', destDir: 'process', width: 1200, quality: 82 },
];

// Shower-Details need special categorization
const SHOWER_DETAIL_CATEGORIES: Record<string, { dest: string; width: number; quality: number }> = {
  // Enclosures
  'single-1': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'door-panel': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'neo': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'frameless-slider': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'curved': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'arched-shower': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'splash-panel': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'steamshower': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  'custom-work': { dest: 'shower-details/enclosures', width: 800, quality: 80 },
  // Glass
  'clearglass': { dest: 'shower-details/glass', width: 800, quality: 80 },
  'clearglass (1)': { dest: 'shower-details/glass', width: 800, quality: 80 },
  'frostedglass': { dest: 'shower-details/glass', width: 800, quality: 80 },
  'rainglass': { dest: 'shower-details/glass', width: 800, quality: 80 },
  // Hardware finishes
  'Polished-Chrome': { dest: 'shower-details/hardware', width: 600, quality: 80 },
  'Brushed-Nickel-Finish': { dest: 'shower-details/hardware', width: 600, quality: 80 },
  'Matte-Black-Finish': { dest: 'shower-details/hardware', width: 600, quality: 80 },
  'Polished-Brass-Finish': { dest: 'shower-details/hardware', width: 600, quality: 80 },
  'Satin-Brass-Finish': { dest: 'shower-details/hardware', width: 600, quality: 80 },
  'Other-Finishes': { dest: 'shower-details/hardware', width: 600, quality: 80 },
  // Accessories
  'hinge': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  '90-degree': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'knob': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'pull': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'u-handle-1': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'hook': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'towel': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'bar': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'ladder2': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'grid': { dest: 'shower-details/accessories', width: 400, quality: 75 },
  'kit': { dest: 'shower-details/accessories', width: 400, quality: 75 },
};

function cleanFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(\d+\)/g, '') // remove (1) etc
    .replace(/adobestock_\d+(_preview)?/gi, '') // remove stock IDs
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function convertImage(task: ConvertTask): Promise<void> {
  try {
    await sharp(task.src)
      .resize(task.width, undefined, { withoutEnlargement: true })
      .webp({ quality: task.quality })
      .toFile(task.dest);
    console.log(`✓ ${task.dest}`);
  } catch (err) {
    console.error(`✗ ${task.src}: ${err}`);
  }
}

async function main() {
  const tasks: ConvertTask[] = [];

  // Process standard directories
  for (const mapping of MAPPINGS) {
    const srcDir = join(SOURCE_ROOT, mapping.srcDir);
    const destDir = join(DEST_ROOT, mapping.destDir);
    await mkdir(destDir, { recursive: true });

    const files = await readdir(srcDir);
    let idx = 1;
    for (const file of files) {
      if (!/\.(jpe?g|png)$/i.test(file)) continue;
      const name = `${mapping.destDir}-${idx}`;
      tasks.push({
        src: join(srcDir, file),
        dest: join(destDir, `${name}.webp`),
        width: mapping.width,
        quality: mapping.quality,
      });
      idx++;
    }
  }

  // Process Shower-Details with categorization
  const showerDetailsDir = join(SOURCE_ROOT, 'Shower-Details');
  const showerFiles = await readdir(showerDetailsDir);

  for (const file of showerFiles) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;
    const { name } = parse(file);
    const category = SHOWER_DETAIL_CATEGORIES[name];
    if (category) {
      const destDir = join(DEST_ROOT, category.dest);
      await mkdir(destDir, { recursive: true });
      const cleanName = cleanFilename(name) || name.toLowerCase();
      tasks.push({
        src: join(showerDetailsDir, file),
        dest: join(destDir, `${cleanName}.webp`),
        width: category.width,
        quality: category.quality,
      });
    } else {
      console.warn(`⚠ No category for: ${file}`);
    }
  }

  console.log(`Converting ${tasks.length} images...`);
  await Promise.all(tasks.map(convertImage));
  console.log('Done!');
}

main();
