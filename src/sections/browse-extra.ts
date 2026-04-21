/**
 * Railings and Commercial browse content.
 * Shorter, gallery-led info sections so Browse mode has meaningful
 * scroll content for all three services. Each ends with a "Configure
 * Yours" CTA that kicks off the manual slideshow for that service.
 */

import { el } from '../utils/dom';
import { images } from '../data/image-map';

/* ------------------------------------------------------------------ */
/*  Shared header helper                                               */
/* ------------------------------------------------------------------ */

function sectionHeader(label: string, title: string, desc: string): HTMLElement {
  const header = el('div', { className: 'section-header' });
  header.appendChild(el('div', { className: 'section-label fade-in-up', textContent: label }));
  header.appendChild(el('h3', { className: 'section-title fade-in-up', textContent: title }));
  header.appendChild(el('p', { className: 'section-desc fade-in-up', textContent: desc }));
  return header;
}

/* ------------------------------------------------------------------ */
/*  Railings                                                            */
/* ------------------------------------------------------------------ */

export function buildRailingsContent(): HTMLElement {
  const wrapper = el('div', { className: 'service-content', id: 'service-railings' });

  // Service hero
  const hero = el('section', { className: 'service-hero' });
  const heroBg = el('div', { className: 'service-hero-bg' });
  const gallery = images.railings.gallery;
  const kb = [images.railings.hero, gallery[0], gallery[1], gallery[2]];
  kb.forEach((src, i) => {
    const img = el('img', { src, alt: 'Glass railing installation', loading: i === 0 ? 'eager' : 'lazy' });
    if (i === 0) img.classList.add('kb-active');
    heroBg.appendChild(img);
  });
  let idx = 0;
  setInterval(() => {
    const imgs = heroBg.querySelectorAll('img');
    imgs.forEach((im) => im.classList.remove('kb-active'));
    idx = (idx + 1) % imgs.length;
    imgs[idx].classList.add('kb-active');
  }, 5000);
  const heroContent = el('div', { className: 'service-hero-content' });
  heroContent.appendChild(el('h2', { className: 'service-hero-title', textContent: 'Glass Railings' }));
  heroContent.appendChild(el('p', {
    className: 'service-hero-subtitle',
    textContent: 'Clean lines, uninterrupted views, and engineered safety. Our frameless glass railings are perfect for stairs, balconies, pool decks, and rooftop terraces.',
  }));
  const heroCta = el('button', {
    className: 'service-hero-cta configure-cta',
    type: 'button',
    textContent: 'Configure your railing \u2192',
  });
  heroCta.setAttribute('data-service', 'railings');
  heroContent.appendChild(heroCta);
  hero.append(heroBg, heroContent);

  // Gallery
  const gallerySec = el('section', { className: 'section' });
  const galleryCont = el('div', { className: 'container' });
  galleryCont.appendChild(sectionHeader('Portfolio', 'Clean Lines, Strong Builds', 'Stairs, balconies, pool fencing, and commercial rails \u2014 every project engineered to code.'));
  const galleryGrid = el('div', { className: 'gallery-grid' });
  gallery.forEach((src, i) => {
    const item = el('div', { className: 'gallery-item fade-in-up' });
    item.appendChild(el('img', { className: 'gallery-item-image', src, alt: `Glass railing ${i + 1}`, loading: 'lazy' }));
    galleryGrid.appendChild(item);
  });
  galleryCont.appendChild(galleryGrid);
  gallerySec.appendChild(galleryCont);

  // Why us
  const whySec = el('section', { className: 'section' });
  const whyCont = el('div', { className: 'container' });
  whyCont.appendChild(sectionHeader('Why Precision', 'Engineered to Code, Built to Last', 'Over 20 years of glass railing experience in South Florida \u2014 we handle the engineering, the permitting, and the install.'));
  const reasons = [
    { title: 'Hurricane-rated glass', desc: 'We spec laminated or tempered glass to meet Florida HVHZ codes and engineer for your exact load case.' },
    { title: 'Multiple mounting options', desc: 'Standoff, base shoe, posts & clips, or core-drilled \u2014 we match the system to your structure and finish.' },
    { title: 'Clean, minimal finishes', desc: 'Stainless, matte black, bronze, and brushed nickel. Hardware designed to disappear behind the glass.' },
    { title: 'Licensed and insured', desc: 'Full-service shop with in-house fabrication, permitting support, and certified installation crews.' },
  ];
  const whyGrid = el('div', { className: 'why-grid' });
  reasons.forEach((r) => {
    const card = el('div', { className: 'why-card fade-in-up' });
    card.appendChild(el('h4', { className: 'why-card-title', textContent: r.title }));
    card.appendChild(el('p', { className: 'why-card-desc', textContent: r.desc }));
    whyGrid.appendChild(card);
  });
  whyCont.appendChild(whyGrid);
  whySec.appendChild(whyCont);

  // Bottom CTA
  const ctaSec = el('section', { className: 'section browse-bottom-cta' });
  const ctaCont = el('div', { className: 'container' });
  const ctaCard = el('div', { className: 'bottom-cta-card' });
  ctaCard.appendChild(el('h3', { className: 'bottom-cta-title', textContent: 'Ready to build your rail?' }));
  ctaCard.appendChild(el('p', { className: 'bottom-cta-desc', textContent: 'Walk through the configurator and tell us your mounting, glass, and finish preferences. We\u2019ll send a custom engineered quote.' }));
  const ctaBtn = el('button', {
    className: 'bottom-cta-btn configure-cta',
    type: 'button',
    textContent: 'Start configuring \u2192',
  });
  ctaBtn.setAttribute('data-service', 'railings');
  ctaCard.appendChild(ctaBtn);
  ctaCont.appendChild(ctaCard);
  ctaSec.appendChild(ctaCont);

  wrapper.append(hero, gallerySec, whySec, ctaSec);
  return wrapper;
}

/* ------------------------------------------------------------------ */
/*  Commercial                                                          */
/* ------------------------------------------------------------------ */

export function buildCommercialContent(): HTMLElement {
  const wrapper = el('div', { className: 'service-content', id: 'service-commercial' });

  // Service hero
  const hero = el('section', { className: 'service-hero' });
  const heroBg = el('div', { className: 'service-hero-bg' });
  const gallery = images.commercial.gallery;
  const kb = [images.commercial.hero, gallery[0], gallery[1], gallery[2]];
  kb.forEach((src, i) => {
    const img = el('img', { src, alt: 'Commercial glass installation', loading: i === 0 ? 'eager' : 'lazy' });
    if (i === 0) img.classList.add('kb-active');
    heroBg.appendChild(img);
  });
  let idx = 0;
  setInterval(() => {
    const imgs = heroBg.querySelectorAll('img');
    imgs.forEach((im) => im.classList.remove('kb-active'));
    idx = (idx + 1) % imgs.length;
    imgs[idx].classList.add('kb-active');
  }, 5000);
  const heroContent = el('div', { className: 'service-hero-content' });
  heroContent.appendChild(el('h2', { className: 'service-hero-title', textContent: 'Commercial Glass' }));
  heroContent.appendChild(el('p', {
    className: 'service-hero-subtitle',
    textContent: 'Storefronts, curtain walls, office partitions, and custom architectural glass. Fully licensed, fully insured, and code-stamped end-to-end.',
  }));
  const heroCta = el('button', {
    className: 'service-hero-cta configure-cta',
    type: 'button',
    textContent: 'Tell us about your project \u2192',
  });
  heroCta.setAttribute('data-service', 'commercial');
  heroContent.appendChild(heroCta);
  hero.append(heroBg, heroContent);

  // Gallery
  const gallerySec = el('section', { className: 'section' });
  const galleryCont = el('div', { className: 'container' });
  galleryCont.appendChild(sectionHeader('Projects', 'Retail, Office, Hospitality', 'Storefronts and architectural systems across South Florida \u2014 from boutique retail to multi-story curtain walls.'));
  const galleryGrid = el('div', { className: 'gallery-grid' });
  gallery.forEach((src, i) => {
    const item = el('div', { className: 'gallery-item fade-in-up' });
    item.appendChild(el('img', { className: 'gallery-item-image', src, alt: `Commercial project ${i + 1}`, loading: 'lazy' }));
    galleryGrid.appendChild(item);
  });
  galleryCont.appendChild(galleryGrid);
  gallerySec.appendChild(galleryCont);

  // Capabilities
  const capSec = el('section', { className: 'section' });
  const capCont = el('div', { className: 'container' });
  capCont.appendChild(sectionHeader('Capabilities', 'Full-Service Commercial Glazier', 'End-to-end from design consult to final walkthrough.'));
  const caps = [
    { title: 'Storefront Systems', desc: 'Aluminum storefronts, entrance systems, revolving doors, automatic sliders.' },
    { title: 'Curtain Walls', desc: 'Unitized and stick-built curtain wall systems for multi-story commercial buildings.' },
    { title: 'Interior Partitions', desc: 'Office dividers, conference room walls, frameless glass partitions with demountable systems.' },
    { title: 'Doors & Hardware', desc: 'Entry doors, herculite, all-glass systems, panic hardware, ADA-compliant operators.' },
    { title: 'Hurricane / Impact Rated', desc: 'Florida HVHZ compliant systems with full NOA documentation.' },
    { title: 'Engineering & Permits', desc: 'In-house shop drawings, engineering stamps, and permit expediting services.' },
  ];
  const capGrid = el('div', { className: 'why-grid' });
  caps.forEach((c) => {
    const card = el('div', { className: 'why-card fade-in-up' });
    card.appendChild(el('h4', { className: 'why-card-title', textContent: c.title }));
    card.appendChild(el('p', { className: 'why-card-desc', textContent: c.desc }));
    capGrid.appendChild(card);
  });
  capCont.appendChild(capGrid);
  capSec.appendChild(capCont);

  // Bottom CTA
  const ctaSec = el('section', { className: 'section browse-bottom-cta' });
  const ctaCont = el('div', { className: 'container' });
  const ctaCard = el('div', { className: 'bottom-cta-card' });
  ctaCard.appendChild(el('h3', { className: 'bottom-cta-title', textContent: 'Have a project in mind?' }));
  ctaCard.appendChild(el('p', { className: 'bottom-cta-desc', textContent: 'Answer a few questions about your project type, glass spec, framing, and scope \u2014 we\u2019ll respond with a detailed quote and timeline.' }));
  const ctaBtn = el('button', {
    className: 'bottom-cta-btn configure-cta',
    type: 'button',
    textContent: 'Start project intake \u2192',
  });
  ctaBtn.setAttribute('data-service', 'commercial');
  ctaCard.appendChild(ctaBtn);
  ctaCont.appendChild(ctaCard);
  ctaSec.appendChild(ctaCont);

  wrapper.append(hero, gallerySec, capSec, ctaSec);
  return wrapper;
}
