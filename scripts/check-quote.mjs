/** Drive browse to the quote slide and screenshot the no-scroll layout. */
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: '.verify-shots/30-hero-circles.png' });
await p.click('[data-mode="browse"]');
await p.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await p.click('#browse-drawer-cta');
await p.waitForSelector('#tour-slideshow.cinematic #stage-canvas', { timeout: 15000 });
await p.waitForTimeout(2500);
// step through: gallery → enclosures (pick) → glass (pick) → hardware (pick) → accessories (pick) → extras → process → quote
const next = async (ms = 1500) => { await p.click('#manual-nav-next'); await p.waitForTimeout(ms); };
await next(); // gallery
await next(2000); // enclosures
await p.click('#slide-enclosures .ss-enc-card:nth-child(2)'); // Door + Panel
await next(2000); // glass
await p.click('#slide-glass .ss-glass-card:nth-child(1)');
await next(2000); // hardware
await p.screenshot({ path: '.verify-shots/31-hardware-focus.png' });
await p.click('#slide-hardware .ss-hw-card:nth-child(2)');
await next(1600); // accessories
await p.click('#slide-accessories .ss-acc-card:nth-child(1)');
await next(1200); // extras
await next(2200); // process (water+steam)
await p.screenshot({ path: '.verify-shots/32-process.png' });
await next(4200); // quote (push-through)
const hasBodyScroll = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight && getComputedStyle(document.body).overflow !== 'hidden');
const card = await p.$('.ss-quote-card');
const cardScrolls = card ? await card.evaluate((el) => el.scrollHeight > el.clientHeight + 4) : null;
console.log('body scrollbar:', hasBodyScroll, '| card inner scroll needed:', cardScrolls);
await p.screenshot({ path: '.verify-shots/33-quote-noscroll.png' });
await b.close();
console.log('done');
