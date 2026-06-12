/** Verify: extras render in 3D (grid+steam on process slide) and incompatible cards grey out. */
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle'] });

// Run A: Door + Panel → both upgrades apply → visible on the running shower
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await p.click('[data-mode="browse"]');
await p.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await p.click('#browse-drawer-cta');
await p.waitForSelector('#tour-slideshow.cinematic #stage-canvas', { timeout: 15000 });
await p.waitForTimeout(2500);
const next = async (ms = 1400) => { await p.click('#manual-nav-next'); await p.waitForTimeout(ms); };
await next(); // gallery
await next(1800); // enclosures
await p.click('#slide-enclosures .ss-enc-card:nth-child(2)'); // Door + Panel
await next(1800); // glass
await p.click('#slide-glass .ss-glass-card:nth-child(1)');
await next(1400); // hardware
await p.click('#slide-hardware .ss-hw-card:nth-child(3)'); // Matte Black
await next(1400); // accessories
await p.click('#slide-accessories .ss-acc-card:nth-child(1)');
await next(1400); // extras
const steamDisabledA = await p.$('#slide-extras .ss-extra-card.cine-disabled');
console.log('Door+Panel: any upgrade greyed out (expect none):', !!steamDisabledA);
// pick BOTH upgrades by dispatching the choice (cards are single-select in browse)
await p.evaluate(() => window.dispatchEvent(new CustomEvent('pg:choice', { detail: { category: 'extras', value: 'Both' } })));
await p.waitForTimeout(1800);
await next(2600); // process — water + steam transom + grid
await p.screenshot({ path: '.verify-shots/50-extras-on-process.png' });

// Run B: Frameless Slider → steam must be greyed out
const q = await b.newPage({ viewport: { width: 1440, height: 900 } });
await q.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await q.click('[data-mode="browse"]');
await q.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await q.click('#browse-drawer-cta');
await q.waitForSelector('#tour-slideshow.cinematic #stage-canvas', { timeout: 15000 });
await q.waitForTimeout(2200);
const qnext = async (ms = 1300) => { await q.click('#manual-nav-next'); await q.waitForTimeout(ms); };
await qnext(); // gallery
await qnext(1700); // enclosures
await q.click('#slide-enclosures .ss-enc-card:nth-child(4)'); // Frameless Slider
await qnext(1600); // glass
await q.click('#slide-glass .ss-glass-card:nth-child(1)');
await qnext(1200); // hardware
await q.click('#slide-hardware .ss-hw-card:nth-child(1)');
await qnext(1200); // accessories
await q.click('#slide-accessories .ss-acc-card:nth-child(1)');
await qnext(1600); // extras
const steamCard = await q.$$eval('#slide-extras .ss-extra-card', (cards) =>
  cards.map((c) => ({ label: c.querySelector('h4')?.textContent, disabled: c.classList.contains('cine-disabled'), note: c.querySelector('.cine-incompat-note')?.textContent || '' })));
console.log('Slider extras state:', JSON.stringify(steamCard, null, 1));
await q.screenshot({ path: '.verify-shots/51-extras-greyed-slider.png' });

await b.close();
console.log('done');
