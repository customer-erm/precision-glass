/** Capture: returning-user hero panel, neo-angle model, gallery rail. */
import { chromium } from 'playwright';

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

// Seed a returning user with a last design
await ctx.addInitScript(() => {
  localStorage.setItem('precision-glass-user', JSON.stringify({
    name: 'Justin', email: 'justin@example.com', visitCount: 2,
    firstVisit: '2026-06-01', lastVisit: '2026-06-10', preferredMode: 'voice',
    lastQuote: { service: 'showers', enclosure: 'Frameless Slider', glass: 'Frosted Glass', hardware: 'Matte Black' },
  }));
});

const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await p.waitForTimeout(3200);
await p.screenshot({ path: '.verify-shots/20-hero-returning.png' });

// Into the tour → neo-angle preview
await p.click('[data-mode="browse"]');
await p.waitForSelector('#browse-drawer-cta', { state: 'visible' });
await p.click('#browse-drawer-cta');
await p.waitForSelector('#tour-slideshow.cinematic #stage-canvas', { timeout: 15000 });
await p.waitForTimeout(3200);
await p.evaluate(() => window.dispatchEvent(new CustomEvent('pg:preview', { detail: { category: 'enclosure', value: 'Neo-Angle' } })));
await p.waitForTimeout(2600);
await p.screenshot({ path: '.verify-shots/21-neo-angle.png' });

// Gallery spacing
await p.click('#manual-nav-next');
await p.waitForTimeout(2600);
await p.screenshot({ path: '.verify-shots/22-gallery-space.png' });

console.log('done');
await b.close();
