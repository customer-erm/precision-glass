/** Quick mobile-only check of the split-stage enclosures slide. */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.click('[data-mode="browse"]');
await page.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await page.click('#browse-drawer-cta');
await page.waitForSelector('#stage-canvas', { timeout: 10000 });
await page.waitForTimeout(3000);
await page.click('#manual-nav-next');
await page.waitForTimeout(1800);
await page.click('#manual-nav-next');
await page.waitForTimeout(2800);
await page.screenshot({ path: '.verify-shots/12b-mobile-enclosures.png' });
console.log('done');
await browser.close();
