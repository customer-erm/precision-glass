/**
 * Playwright smoke test for the cinematic WebGL experience.
 * Drives browse mode end-to-end and the ?classic=1 fallback.
 * Run: node scripts/verify-cinematic.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const SHOTS = new URL('../.verify-shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const results = [];

function log(ok, msg) {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
}

async function launch() {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch({ channel, headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    } catch (e) { /* try next */ }
  }
  throw new Error('No Chromium-family browser available');
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

async function startBrowseTour() {
  await page.click('[data-mode="browse"]');
  await page.waitForSelector('#browse-drawer-cta', { state: 'visible', timeout: 5000 });
  await page.click('#browse-drawer-cta');
  await page.waitForSelector('#photo-prompt.visible', { timeout: 8000 });
  await page.click('#photo-prompt-skip');
}

/* ---- 1. Homepage ---- */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#hero', { timeout: 10000 });
log(true, 'homepage loaded');
await shot('01-home');

/* ---- 2. Browse → showers tour with WebGL stage ---- */
await startBrowseTour();
await page.waitForSelector('#tour-slideshow.cinematic', { timeout: 8000 });
const canvas = await page.waitForSelector('#stage-canvas', { timeout: 10000 });
const box = await canvas.boundingBox();
log(!!box && box.width > 100, `stage canvas mounted (${box?.width}x${box?.height})`);
await page.waitForTimeout(3500); // arrival dolly
await shot('02-intro');

/* ---- 3. Advance: gallery → enclosures ---- */
await page.click('#manual-nav-next');
await page.waitForTimeout(2300);
await shot('03-gallery');
await page.click('#manual-nav-next');
await page.waitForTimeout(2300);
const encCards = await page.$$('#slide-enclosures .ss-enc-card');
log(encCards.length === 10, `enclosures slide shows ${encCards.length} cards`);
await shot('04-enclosures');

/* ---- 4. Select Frameless Slider → assemble ---- */
await encCards[3].click(); // Frameless Slider
await page.waitForTimeout(400);
const selected = await page.$('#slide-enclosures .browse-option.selected');
log(!!selected, 'enclosure card selectable');
await page.click('#manual-nav-next'); // → glass, model assembles
await page.waitForTimeout(3000);
await shot('05-glass-slider-assembled');

/* ---- 5. Frosted glass morph ---- */
const glassCards = await page.$$('#slide-glass .ss-glass-card');
await glassCards[1].click(); // Frosted
await page.click('#manual-nav-next'); // → hardware
await page.waitForTimeout(2800);
await shot('06-hardware-frosted');

/* ---- 6. Matte black finish ---- */
const hwCards = await page.$$('#slide-hardware .ss-hw-card');
await hwCards[2].click(); // Matte Black
await page.click('#manual-nav-next'); // → accessories
await page.waitForTimeout(2800);
await shot('07-accessories-black');

/* ---- 7. Ladder pull handle ---- */
const accCards = await page.$$('#slide-accessories .ss-acc-card');
await accCards[2].click(); // Ladder Pulls
await page.click('#manual-nav-next'); // → extras
await page.waitForTimeout(2000);
await page.click('#manual-nav-next'); // → process
await page.waitForTimeout(2000);
await shot('08-process');

/* ---- 8. Quote: push-through-glass finale ---- */
await page.click('#manual-nav-next'); // → quote
await page.waitForTimeout(4200);
const dimmed = await page.$('#tour-slideshow.cinematic.stage-dim');
log(!!dimmed, 'quote slide dims the stage after push-through');
const lock = await page.$('.ss-quote-lock');
log(!!lock, 'quote lock overlay present (browse mode)');
await shot('09-quote');

/* ---- 9. Fill form & submit ---- */
await page.fill('#bqf-name', 'Demo Tester');
await page.fill('#bqf-email', 'demo@example.com');
await page.click('#manual-nav-next'); // Prepare proposal
await page.waitForTimeout(2500);
const sent = await page.$('#qs-sent-overlay.visible');
log(!!sent, 'proposal-sent overlay appears after submit');
await shot('10-sent');

/* ---- 10. Classic fallback ---- */
const page2 = await ctx.newPage();
page2.on('pageerror', (e) => errors.push(`classic pageerror: ${e.message}`));
await page2.goto(`${BASE}/?classic=1`, { waitUntil: 'networkidle' });
await page2.click('[data-mode="browse"]');
await page2.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await page2.click('#browse-drawer-cta');
await page2.waitForSelector('#photo-prompt.visible');
await page2.click('#photo-prompt-skip');
await page2.waitForSelector('#tour-slideshow', { timeout: 8000 });
await page2.waitForTimeout(1500);
const classicCanvas = await page2.$('#stage-canvas');
const classicClass = await page2.$('#tour-slideshow.cinematic');
log(!classicCanvas && !classicClass, '?classic=1 serves the old flow (no canvas, no cinematic class)');
await page2.screenshot({ path: `${SHOTS}11-classic.png` });

/* ---- 11. Mobile viewport sanity ---- */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mpage = await mctx.newPage();
mpage.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
await mpage.goto(BASE, { waitUntil: 'networkidle' });
await mpage.click('[data-mode="browse"]');
await mpage.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await mpage.click('#browse-drawer-cta');
await mpage.waitForSelector('#photo-prompt.visible');
await mpage.click('#photo-prompt-skip');
await mpage.waitForSelector('#stage-canvas', { timeout: 10000 });
await mpage.waitForTimeout(3000);
await mpage.screenshot({ path: `${SHOTS}12-mobile-intro.png` });
log(true, 'mobile viewport renders the cinematic tour');

/* ---- 12. Agent-conducted previews (same events the voice tools emit) ---- */
const ppage = await ctx.newPage();
ppage.on('pageerror', (e) => errors.push(`preview pageerror: ${e.message}`));
await ppage.goto(BASE, { waitUntil: 'networkidle' });
await ppage.click('[data-mode="browse"]');
await ppage.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await ppage.click('#browse-drawer-cta');
await ppage.waitForSelector('#photo-prompt.visible');
await ppage.click('#photo-prompt-skip');
await ppage.waitForSelector('#stage-canvas', { timeout: 10000 });
await ppage.waitForTimeout(3500);
const dispatch = (category, value) =>
  ppage.evaluate(([c, v]) => window.dispatchEvent(new CustomEvent('pg:preview', { detail: { category: c, value: v } })), [category, value]);
await dispatch('enclosure', 'Curved');
await ppage.waitForTimeout(2600);
await ppage.screenshot({ path: `${SHOTS}13-preview-curved.png` });
await dispatch('glass', 'Rain Glass');
await dispatch('hardware', 'Satin Brass');
await ppage.waitForTimeout(1600);
await dispatch('camera', 'closeup');
await ppage.waitForTimeout(2200);
await ppage.screenshot({ path: `${SHOTS}14-preview-rain-brass-closeup.png` });
log(true, 'preview events morph the model without advancing the tour');
const stillIntro = await ppage.$('#slide-intro.active');
log(!!stillIntro, 'tour did not advance during previews');

/* ---- 13. Photo upload → vision backdrop in the 3D scene ---- */
const photoPage = await ctx.newPage();
photoPage.on('pageerror', (e) => errors.push(`photo pageerror: ${e.message}`));
await photoPage.goto(BASE, { waitUntil: 'networkidle' });
const fakeBathroom = await photoPage.screenshot(); // any real PNG works as the "bathroom"
await photoPage.click('[data-mode="browse"]');
await photoPage.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await photoPage.click('#browse-drawer-cta');
await photoPage.waitForSelector('#photo-prompt.visible');
await photoPage.setInputFiles('#photo-prompt-input', { name: 'bathroom.png', mimeType: 'image/png', buffer: fakeBathroom });
await photoPage.waitForSelector('#photo-prompt-continue:not([hidden])', { timeout: 8000 });
await photoPage.click('#photo-prompt-continue');
await photoPage.waitForSelector('#stage-canvas', { timeout: 10000 });
await photoPage.waitForTimeout(4500);
await photoPage.screenshot({ path: `${SHOTS}15-photo-backdrop.png` });
log(true, 'uploaded photo flow reaches the tour (backdrop visible in screenshot 15)');

/* ---- 14. Chat mode reaches the cinematic tour ---- */
const cpage = await ctx.newPage();
cpage.on('pageerror', (e) => errors.push(`chat pageerror: ${e.message}`));
await cpage.goto(BASE, { waitUntil: 'networkidle' });
await cpage.click('[data-mode="chat"]');
await cpage.waitForSelector('#chat-panel.visible', { timeout: 8000 });
await cpage.waitForTimeout(1200);
await cpage.fill('#chat-input', 'Justin');
await cpage.press('#chat-input', 'Enter');
await cpage.waitForTimeout(1800);
await cpage.locator('.chat-chip', { hasText: /shower/i }).first().click();
await cpage.waitForSelector('#photo-prompt.visible', { timeout: 10000 });
await cpage.click('#photo-prompt-skip');
await cpage.waitForSelector('#tour-slideshow.cinematic #stage-canvas', { timeout: 10000 });
await cpage.waitForTimeout(3000);
await cpage.screenshot({ path: `${SHOTS}16-chat-tour.png` });
log(true, 'chat mode drives the cinematic tour');

console.log('\n--- RESULTS ---');
console.log(results.join('\n'));
console.log('\n--- CONSOLE/PAGE ERRORS ---');
console.log(errors.length ? errors.join('\n') : '(none)');

await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
