/**
 * Loader that reads .env.prod (handles Vercel-escaped \n) and runs gen-images.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '..', '.env.prod');
const envRaw = fs.readFileSync(envPath, 'utf8');
const match = envRaw.match(/VITE_GEMINI_API_KEY="?([^"\n]+)/);
if (!match) { console.error('No API key'); process.exit(1); }
let key = match[1];
if (key.endsWith(String.fromCharCode(92) + 'n')) key = key.slice(0, -2);

const group = process.argv[2] || 'all';
const child = spawn('node', [path.join(__dirname, 'gen-images.mjs'), group], {
  stdio: 'inherit',
  env: { ...process.env, GEMINI_API_KEY: key },
});
child.on('exit', (code) => process.exit(code || 0));
