/**
 * "About the company" — a full CRO-optimized story section.
 *
 * Structure (classic high-converting sequence):
 *   1. Section hero with headline, social proof, and primary CTA
 *   2. Stats strip (20+ years · 1,800+ installs · 4.9 rating · lifetime)
 *   3. "Why Precision" 4-card differentiator grid
 *   4. Founder story — photo + quote
 *   5. Certifications / trust badges strip
 *   6. Testimonial carousel (3-star + name + location)
 *   7. Lifetime guarantee callout
 *   8. FAQ accordion (objection handling)
 *   9. Final CTA section with urgency line
 */

import { el } from '../utils/dom';
import { images } from '../data/image-map';

export function buildAboutSection(): HTMLElement {
  const section = el('section', { className: 'about-section', id: 'about-section' });

  section.appendChild(buildAboutHero());
  section.appendChild(buildStatsStrip());
  section.appendChild(buildWhyUs());
  section.appendChild(buildFounderStory());
  section.appendChild(buildTrustBadges());
  section.appendChild(buildTestimonials());
  section.appendChild(buildGuarantee());
  section.appendChild(buildFAQ());
  section.appendChild(buildFinalCTA());

  return section;
}

/* ------------------------------------------------------------------ */
/*  1. Section hero                                                    */
/* ------------------------------------------------------------------ */

function buildAboutHero(): HTMLElement {
  const wrap = el('div', { className: 'about-hero' });
  wrap.innerHTML = `
    <div class="about-hero-bg">
      <img src="${images.showers.gallery[4]}" alt="" loading="lazy">
    </div>
    <div class="about-hero-inner">
      <div class="about-hero-eyebrow">
        <span class="about-hero-mark">\u25C6</span>
        <span>Our Story</span>
        <span class="about-hero-mark">\u25C6</span>
      </div>
      <h2 class="about-hero-title">Glass that lasts a lifetime,<br>installed like we'd want our own.</h2>
      <p class="about-hero-lead">Family-owned. Locally rooted. Obsessively detailed. For two decades, South Florida homeowners and builders have trusted Precision Glass to bring clarity, elegance, and engineering-grade safety to their most important spaces.</p>
      <div class="about-hero-actions">
        <button type="button" class="about-hero-cta" data-about-cta="contact">Book a free consultation \u2192</button>
        <div class="about-hero-trust">
          <div class="about-trust-stars" aria-label="4.9 out of 5 stars">${stars(5)}</div>
          <span class="about-trust-text">4.9/5 from <strong>320+ reviews</strong> \u00B7 South Florida's trusted glass specialists</span>
        </div>
      </div>
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  2. Stats strip                                                     */
/* ------------------------------------------------------------------ */

function buildStatsStrip(): HTMLElement {
  const wrap = el('div', { className: 'about-stats' });
  const stats = [
    { value: '20+', label: 'Years in business', hint: 'Est. 2004, South Florida' },
    { value: '1,800+', label: 'Installations completed', hint: 'Residential + commercial' },
    { value: '4.9\u2605', label: 'Average customer rating', hint: '320+ verified reviews' },
    { value: 'Lifetime', label: 'Workmanship warranty', hint: 'On every install, no exceptions' },
  ];
  wrap.innerHTML = `
    <div class="about-stats-inner">
      ${stats
        .map(
          (s) => `
        <div class="about-stat">
          <div class="about-stat-value">${s.value}</div>
          <div class="about-stat-label">${s.label}</div>
          <div class="about-stat-hint">${s.hint}</div>
        </div>`,
        )
        .join('')}
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  3. Why Precision differentiators                                   */
/* ------------------------------------------------------------------ */

function buildWhyUs(): HTMLElement {
  const wrap = el('div', { className: 'about-why' });
  const reasons = [
    {
      icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
      title: 'In-house fabrication',
      body: 'We cut, polish, and temper every pane at our own facility \u2014 no subcontracting, no miscommunication, no finger-pointing when something goes wrong.',
    },
    {
      icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      title: 'Licensed, bonded & insured',
      body: 'FL contractor license, $2M liability coverage, workers\u2019 comp. We show proof before we show up, and every install is permitted to code.',
    },
    {
      icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      title: 'Lifetime workmanship warranty',
      body: 'If a seal fails, a clip loosens, or a hinge wears out \u2014 we come fix it. Forever. We\u2019ve honored this since 2004.',
    },
    {
      icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      title: 'Zero-pressure consultations',
      body: 'Our team visits your home, measures, and advises \u2014 free. No deposits, no aggressive sales. Quote it, sleep on it, decide on your own timeline.',
    },
  ];
  wrap.innerHTML = `
    <div class="about-why-header">
      <div class="about-section-eyebrow">What sets us apart</div>
      <h3 class="about-section-title">Four reasons South Florida keeps calling us</h3>
    </div>
    <div class="about-why-grid">
      ${reasons
        .map(
          (r) => `
        <div class="about-why-card">
          <div class="about-why-icon">${r.icon}</div>
          <h4 class="about-why-title">${r.title}</h4>
          <p class="about-why-body">${r.body}</p>
        </div>`,
        )
        .join('')}
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  4. Founder story                                                   */
/* ------------------------------------------------------------------ */

function buildFounderStory(): HTMLElement {
  const wrap = el('div', { className: 'about-founder' });
  wrap.innerHTML = `
    <div class="about-founder-inner">
      <div class="about-founder-image">
        <img src="${images.showers.gallery[1]}" alt="Founder at work" loading="lazy">
        <div class="about-founder-badge">
          <strong>Miguel Alvarez</strong>
          <span>Founder & Master Glazier</span>
        </div>
      </div>
      <div class="about-founder-body">
        <div class="about-section-eyebrow">From the founder</div>
        <h3 class="about-founder-quote">
          <span class="about-founder-mark">\u201C</span>
          Glass is a trust business. You\u2019re hanging hundreds of pounds in someone\u2019s home. I built Precision Glass so that every install is done the way I\u2019d want it done in my own house \u2014 nothing less.
          <span class="about-founder-mark">\u201D</span>
        </h3>
        <p class="about-founder-copy">
          Miguel started Precision Glass out of a single bay in 2004 after a decade working for a high-end custom glass shop in Miami. He wanted his own crew, his own standards, and complete control over every cut, polish, and temper cycle.
        </p>
        <p class="about-founder-copy">
          Twenty years later, we\u2019ve grown to a team of 14 \u2014 installers, fabricators, drafters, and project managers. What hasn\u2019t changed is who signs off on every project before it ships: Miguel.
        </p>
        <div class="about-founder-signature">
          <svg viewBox="0 0 120 40" width="120" height="40" class="about-sig-svg"><path d="M5 30 Q 15 5, 30 20 T 55 25 T 85 15 T 115 20" stroke="#ff8a4c" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
          <span>\u2014 Miguel A., Founder</span>
        </div>
      </div>
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  5. Trust badges / certifications                                   */
/* ------------------------------------------------------------------ */

function buildTrustBadges(): HTMLElement {
  const wrap = el('div', { className: 'about-badges' });
  const badges = [
    { icon: '\u2696', label: 'Florida Licensed Contractor', sub: 'CGC #123456' },
    { icon: '\u{1F6E1}', label: 'Fully Insured', sub: '$2M liability \u00B7 workers\u2019 comp' },
    { icon: 'A+', label: 'BBB Accredited', sub: 'A+ rating since 2008' },
    { icon: '\u{1F3C6}', label: 'Houzz \u201CBest of Service\u201D', sub: '5 years running' },
    { icon: '\u2B50', label: 'Top-Rated on Google', sub: '320+ 5-star reviews' },
    { icon: '\u{1F4D0}', label: 'HVHZ Code Compliant', sub: 'Miami-Dade NOA certified' },
  ];
  wrap.innerHTML = `
    <div class="about-badges-inner">
      <div class="about-badges-label">Licensed \u00B7 Insured \u00B7 Certified \u00B7 Trusted</div>
      <div class="about-badges-grid">
        ${badges
          .map(
            (b) => `
          <div class="about-badge">
            <div class="about-badge-icon">${b.icon}</div>
            <div class="about-badge-body">
              <strong>${b.label}</strong>
              <span>${b.sub}</span>
            </div>
          </div>`,
          )
          .join('')}
      </div>
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  6. Testimonials                                                    */
/* ------------------------------------------------------------------ */

function buildTestimonials(): HTMLElement {
  const wrap = el('div', { className: 'about-testimonials' });
  const reviews = [
    {
      quote: 'They arrived exactly when they said, finished in a single day, and the shower looks like something out of a magazine. Two years later \u2014 zero issues, and when a hinge got loose they came back next day. No charge.',
      name: 'Jennifer R.',
      role: 'Homeowner \u00B7 Coral Gables',
    },
    {
      quote: 'I\u2019m a GC and I use Miguel\u2019s team on every high-end project. They\u2019re the only shop I\u2019ve found that actually hits measurements on the first try, every time. That alone saves me weeks.',
      name: 'David K.',
      role: 'General Contractor \u00B7 Fort Lauderdale',
    },
    {
      quote: 'We shopped five glass companies. Precision Glass was the only one that took a full hour to walk us through the options without pushing. Price was mid-range but the craftsmanship is 10/10.',
      name: 'Sarah & Tom L.',
      role: 'Homeowners \u00B7 Boca Raton',
    },
    {
      quote: 'The curved enclosure they fabricated for our master bath is a piece of art. Neighbors stop by just to see it. Worth every penny.',
      name: 'Carlos M.',
      role: 'Homeowner \u00B7 Miami Beach',
    },
  ];
  wrap.innerHTML = `
    <div class="about-testimonials-header">
      <div class="about-section-eyebrow">What our clients say</div>
      <h3 class="about-section-title">Real homeowners. Real projects. Real reviews.</h3>
    </div>
    <div class="about-testimonials-track">
      ${reviews
        .map(
          (r) => `
        <blockquote class="about-testimonial">
          <div class="about-testimonial-stars">${stars(5)}</div>
          <p class="about-testimonial-quote">${r.quote}</p>
          <footer>
            <strong>${r.name}</strong>
            <span>${r.role}</span>
          </footer>
        </blockquote>`,
        )
        .join('')}
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  7. Lifetime guarantee callout                                      */
/* ------------------------------------------------------------------ */

function buildGuarantee(): HTMLElement {
  const wrap = el('div', { className: 'about-guarantee' });
  wrap.innerHTML = `
    <div class="about-guarantee-inner">
      <div class="about-guarantee-medal">
        <svg viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
      </div>
      <div class="about-guarantee-body">
        <div class="about-section-eyebrow">The Precision Promise</div>
        <h3 class="about-guarantee-title">Lifetime workmanship guarantee \u2014 in writing.</h3>
        <p class="about-guarantee-copy">
          Hinges, clips, seals, brackets, sweeps. Any piece of the install that fails due to our workmanship \u2014 we fix it or replace it, for as long as you own the home. No deductibles, no service fees, no fine print.
        </p>
        <ul class="about-guarantee-list">
          <li>Covers all hardware and install-point failures</li>
          <li>Transferable to future owners of the home</li>
          <li>Next-business-day response on warranty calls</li>
          <li>Honored on every install since 2004 \u2014 ask for references</li>
        </ul>
      </div>
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  8. FAQ (objection handling)                                        */
/* ------------------------------------------------------------------ */

function buildFAQ(): HTMLElement {
  const wrap = el('div', { className: 'about-faq' });
  const faqs = [
    {
      q: 'How long does a typical install take?',
      a: 'A standard frameless shower or glass railing install is completed in a single day. Custom curves, steam enclosures, or multi-story curtain walls take 1\u20133 days. We give you a firm schedule up front.',
    },
    {
      q: 'Do you handle permits?',
      a: 'Yes. We handle all permitting, code compliance, and NOA (Notice of Acceptance) documentation for South Florida HVHZ zones at no extra cost. You don\u2019t touch a single piece of paperwork.',
    },
    {
      q: 'What happens if the glass breaks?',
      a: 'Tempered safety glass is extremely rare to break, but if it happens within the first year due to fabrication defects we replace it free. After year one, we re-fabricate at cost \u2014 typically 30\u201340% below market rate for our clients.',
    },
    {
      q: 'Do you offer financing?',
      a: 'Yes \u2014 we partner with three regional lenders offering 0% APR for 12\u201318 months on qualified credit. Apply during your consultation, decision in minutes.',
    },
    {
      q: 'What\u2019s your service area?',
      a: 'We serve Miami-Dade, Broward, and Palm Beach counties in full. Martin, St. Lucie, and Monroe are available for projects over $15k. All installs are performed by our in-house team \u2014 we never subcontract.',
    },
    {
      q: 'How are you different from the big-box glass companies?',
      a: 'We\u2019re family-owned and fabrication-focused. Big-box companies sell you glass \u2014 we craft it. That means every piece gets inspected by the founder before it ships, and every customer gets a direct line to the team that built their install.',
    },
  ];
  wrap.innerHTML = `
    <div class="about-faq-header">
      <div class="about-section-eyebrow">Frequently asked</div>
      <h3 class="about-section-title">The questions we hear most</h3>
    </div>
    <div class="about-faq-list">
      ${faqs
        .map(
          (f, i) => `
        <details class="about-faq-item"${i === 0 ? ' open' : ''}>
          <summary class="about-faq-question">
            <span>${f.q}</span>
            <span class="about-faq-toggle" aria-hidden="true">+</span>
          </summary>
          <p class="about-faq-answer">${f.a}</p>
        </details>`,
        )
        .join('')}
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  9. Final CTA with urgency                                          */
/* ------------------------------------------------------------------ */

function buildFinalCTA(): HTMLElement {
  const wrap = el('div', { className: 'about-final-cta' });
  wrap.innerHTML = `
    <div class="about-final-cta-inner">
      <div class="about-final-cta-badge">This week only \u00B7 Free in-home design consult</div>
      <h3 class="about-final-cta-title">Ready to see what your space could look like?</h3>
      <p class="about-final-cta-lead">
        In 30 minutes we\u2019ll measure, sketch options, and show you exactly what\u2019s possible \u2014 with an itemized quote you can take home. Zero pressure, zero deposit.
      </p>
      <div class="about-final-cta-row">
        <button type="button" class="about-final-cta-btn" data-about-cta="contact">Book my free consultation</button>
        <a href="tel:+18005551234" class="about-final-cta-phone">
          <span>or call</span>
          <strong>(800) 555-1234</strong>
        </a>
      </div>
      <div class="about-final-cta-foot">
        <span>${stars(5)}</span>
        <span>4.9/5 from 320+ reviews \u00B7 Licensed \u2022 Bonded \u2022 Insured \u2022 Lifetime Warranty</span>
      </div>
    </div>
  `;
  return wrap;
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function stars(n: number): string {
  return Array(n).fill('\u2605').join('');
}
