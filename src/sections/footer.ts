/**
 * Site footer — full-width, always visible at bottom of page.
 * Includes logo, service links, social links, contact info, hours.
 */

import { el } from '../utils/dom';

const PHONE_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

const MAIL_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;

const PIN_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

const CLOCK_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

const FB_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>`;

const IG_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`;

const LI_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;

const HOUZZ_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 22V13.5L7 13.5V22H2.5V2H7v7l10-3v-6h4.5v22H17z"/></svg>`;

export function buildFooter(): HTMLElement {
  const footer = el('footer', { className: 'site-footer', id: 'site-footer' });
  const inner = el('div', { className: 'site-footer-inner' });

  // --- Brand column ---
  const brand = el('div', { className: 'footer-col footer-brand' });
  brand.innerHTML = `
    <div class="footer-logo"><img src="/images/logo/lockup-dark.jpg" alt="Precision Glass"></div>
    <p class="footer-tagline">Custom frameless glass installations \u2014 designed, fabricated, and installed by a family-owned South Florida glass shop serving Miami, Fort Lauderdale, and Palm Beach since 2004.</p>
    <div class="footer-socials">
      <a href="#" class="footer-social" aria-label="Facebook">${FB_SVG}</a>
      <a href="#" class="footer-social" aria-label="Instagram">${IG_SVG}</a>
      <a href="#" class="footer-social" aria-label="LinkedIn">${LI_SVG}</a>
      <a href="#" class="footer-social" aria-label="Houzz">${HOUZZ_SVG}</a>
    </div>
  `;

  // --- Services column ---
  const services = el('div', { className: 'footer-col' });
  services.innerHTML = `
    <h5 class="footer-title">Services</h5>
    <ul class="footer-links">
      <li><button type="button" data-nav-service="showers">Frameless Showers</button></li>
      <li><button type="button" data-nav-service="railings">Glass Railings</button></li>
      <li><button type="button" data-nav-service="commercial">Commercial Glass</button></li>
      <li><button type="button" id="footer-quote-link">Request a Quote</button></li>
    </ul>
  `;

  // --- Company column ---
  const company = el('div', { className: 'footer-col' });
  company.innerHTML = `
    <h5 class="footer-title">Company</h5>
    <ul class="footer-links">
      <li><a href="#">About</a></li>
      <li><a href="#">Portfolio</a></li>
      <li><a href="#">Buyer's Guide</a></li>
      <li><a href="#">Warranty</a></li>
      <li><a href="#">Careers</a></li>
    </ul>
  `;

  // --- Contact column ---
  const contact = el('div', { className: 'footer-col' });
  contact.innerHTML = `
    <h5 class="footer-title">Get in Touch</h5>
    <ul class="footer-contact">
      <li><a href="tel:+18005551234">${PHONE_SVG}<span>(800) 555-1234</span></a></li>
      <li><a href="mailto:hello@precisionglass.com">${MAIL_SVG}<span>hello@precisionglass.com</span></a></li>
      <li><span>${PIN_SVG}<span>Fort Lauderdale, FL<br>Serving South Florida</span></span></li>
      <li><span>${CLOCK_SVG}<span>Mon\u2013Fri 8am\u20136pm<br>Sat 9am\u20132pm</span></span></li>
    </ul>
  `;

  inner.append(brand, services, company, contact);
  footer.appendChild(inner);

  // --- Bottom bar ---
  const bottom = el('div', { className: 'site-footer-bottom' });
  bottom.innerHTML = `
    <div class="site-footer-bottom-inner">
      <span class="footer-copyright">\u00A9 ${new Date().getFullYear()} Precision Glass. All rights reserved.</span>
      <span class="footer-license">FL License #CGC123456 \u00B7 Licensed \u2022 Bonded \u2022 Insured</span>
      <div class="footer-legal">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
        <a href="#">Accessibility</a>
      </div>
    </div>
  `;
  footer.appendChild(bottom);

  return footer;
}
