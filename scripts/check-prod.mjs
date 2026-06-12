/** Minimal prod check: cinematic stage mounts on the live site (no form submits). */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://precision-glass-one.vercel.app';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('[data-mode="browse"]');
await page.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await page.click('#browse-drawer-cta');
await page.waitForSelector('#tour-slideshow.cinematic #stage-canvas', { timeout: 15000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: '.verify-shots/17-prod-live.png' });
console.log('✅ PROD cinematic stage mounted at', BASE);
console.log(errors.length ? `errors: ${errors.join('; ')}` : 'no page errors');
await browser.close();
