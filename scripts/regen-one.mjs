import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env.prod'), 'utf8');
const m = envRaw.match(/VITE_GEMINI_API_KEY="?([^"\n]+)/);
let key = m ? m[1] : '';
if (key.endsWith(String.fromCharCode(92) + 'n')) key = key.slice(0, -2);

const id = process.argv[2];
if (!id) { console.error('Need id arg'); process.exit(1); }

const { default: script } = await import('./gen-images.mjs').catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
