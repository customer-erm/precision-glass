import { el } from '../utils/dom';
import { images } from '../data/image-map';

export function buildShowerContent(): HTMLElement {
  const wrapper = el('div', { className: 'service-content', id: 'service-showers' });

  // 1. Service Hero
  const hero = el('section', { className: 'service-hero', id: 'shower-hero' });
  const heroBg = el('div', { className: 'service-hero-bg' });
  heroBg.appendChild(el('img', { src: images.showers.hero, alt: 'Frameless shower enclosure' }));
  const heroContent = el('div', { className: 'service-hero-content' });
  const heroTitle = el('h2', { className: 'service-hero-title', id: 'shower-hero-title' });
  const heroSub = el('p', { className: 'service-hero-subtitle', textContent: 'Custom frameless glass enclosures designed, fabricated, and installed by our expert team. No frames. No compromises. Just clean lines and stunning clarity.' });
  heroContent.append(heroTitle, heroSub);
  hero.append(heroBg, heroContent);

  // 2. Our Work Gallery
  const gallerySection = el('section', { className: 'section', id: 'shower-gallery' });
  const galleryContainer = el('div', { className: 'container' });
  const galleryHeader = buildSectionHeader('Our Work', 'Craftsmanship You Can See', 'Every project is unique. Here are some of our recent frameless shower installations.');
  const galleryGrid = el('div', { className: 'gallery-grid' });
  images.showers.gallery.forEach((src, i) => {
    const item = el('div', { className: 'gallery-item fade-in-up' });
    item.appendChild(el('img', { className: 'gallery-item-image', src, alt: `Frameless shower installation ${i + 1}`, loading: 'lazy' }));
    galleryGrid.appendChild(item);
  });
  galleryContainer.append(galleryHeader, galleryGrid);
  gallerySection.appendChild(galleryContainer);

  // 3. Enclosure Types
  const encSection = el('section', { className: 'section', id: 'enclosure-types' });
  const encContainer = el('div', { className: 'container' });
  const encHeader = buildSectionHeader('Enclosure Types', 'Choose Your Configuration', 'Every space is unique. We offer nine distinct enclosure styles to perfectly fit your bathroom layout.');
  const encGrid = el('div', { className: 'enclosure-grid' });
  images.showers.enclosures.forEach((item) => {
    encGrid.appendChild(buildGridItem(item.id, item.src, item.label, item.desc));
  });
  encContainer.append(encHeader, encGrid);
  encSection.appendChild(encContainer);

  // 3. Glass Options
  const glassSection = el('section', { className: 'section', id: 'glass-options' });
  const glassContainer = el('div', { className: 'container' });
  const glassHeader = buildSectionHeader('Glass Options', 'Select Your Glass', 'Premium tempered safety glass in three stunning options.');
  const glassGrid = el('div', { className: 'glass-grid' });
  images.showers.glass.forEach((item) => {
    const card = el('div', { className: 'glass-card fade-in-up', id: item.id });
    card.appendChild(el('img', { className: 'glass-card-image', src: item.src, alt: item.label, loading: 'lazy' }));
    const info = el('div', { className: 'glass-card-info' });
    info.appendChild(el('h4', { className: 'glass-card-label', textContent: item.label }));
    info.appendChild(el('p', { className: 'glass-card-desc', textContent: item.desc }));
    card.appendChild(info);
    glassGrid.appendChild(card);
  });
  glassContainer.append(glassHeader, glassGrid);
  glassSection.appendChild(glassContainer);

  // 4. Hardware Finishes
  const hwSection = el('section', { className: 'section', id: 'hardware-finishes' });
  const hwContainer = el('div', { className: 'container' });
  const hwHeader = buildSectionHeader('Hardware Finishes', 'Choose Your Finish', 'Coordinate your hardware with your bathroom aesthetic.');
  const hwGrid = el('div', { className: 'hardware-grid' });
  images.showers.hardware.forEach((item) => {
    const card = el('div', { className: 'hardware-card fade-in-up', id: item.id });
    card.appendChild(el('img', { className: 'hardware-card-image', src: item.src, alt: item.label, loading: 'lazy' }));
    card.appendChild(el('h4', { className: 'hardware-card-label', textContent: item.label }));
    card.appendChild(el('p', { className: 'hardware-card-desc', textContent: item.desc }));
    hwGrid.appendChild(card);
  });
  hwContainer.append(hwHeader, hwGrid);
  hwSection.appendChild(hwContainer);

  // 5. Accessories
  const accSection = el('section', { className: 'section', id: 'accessories' });
  const accContainer = el('div', { className: 'container' });
  const accHeader = buildSectionHeader('Accessories', 'Complete the Look', 'Every detail matters — from handles to towel bars.');
  const accGrid = el('div', { className: 'accessories-grid' });
  images.showers.accessories.forEach((item) => {
    const card = el('div', { className: 'accessory-item fade-in-up', id: item.id });
    card.appendChild(el('img', { className: 'accessory-item-image', src: item.src, alt: item.label, loading: 'lazy' }));
    card.appendChild(el('div', { className: 'accessory-item-label', textContent: item.label }));
    card.appendChild(el('div', { className: 'accessory-item-desc', textContent: item.desc }));
    accGrid.appendChild(card);
  });
  accContainer.append(accHeader, accGrid);
  accSection.appendChild(accContainer);

  // 6. Process
  const procSection = el('section', { className: 'section', id: 'our-process' });
  const procContainer = el('div', { className: 'container' });
  const procHeader = buildSectionHeader('Our Process', 'From Vision to Reality', 'A seamless four-step journey to your perfect shower.');
  const procTimeline = el('div', { className: 'process-timeline' });
  images.process.forEach((item, i) => {
    const step = el('div', { className: 'process-step fade-in-up' });
    const num = el('div', { className: 'process-step-number', textContent: String(i + 1) });
    const img = el('img', { className: 'process-step-image', src: item.src, alt: item.label, loading: 'lazy' });
    const label = el('h4', { className: 'process-step-label', textContent: item.label });
    const desc = el('p', { className: 'process-step-desc', textContent: item.desc });
    step.append(num, img, label, desc);
    procTimeline.appendChild(step);
  });
  procContainer.append(procHeader, procTimeline);
  procSection.appendChild(procContainer);

  wrapper.append(hero, gallerySection, encSection, glassSection, hwSection, accSection, procSection);
  return wrapper;
}

function buildSectionHeader(label: string, title: string, desc: string): HTMLElement {
  const header = el('div', { className: 'section-header' });
  header.appendChild(el('div', { className: 'section-label fade-in-up', textContent: label }));
  header.appendChild(el('h3', { className: 'section-title fade-in-up', textContent: title }));
  header.appendChild(el('p', { className: 'section-desc fade-in-up', textContent: desc }));
  return header;
}

function buildGridItem(id: string, src: string, label: string, desc: string): HTMLElement {
  const item = el('div', { className: 'grid-item fade-in-up', id });
  item.appendChild(el('img', { className: 'grid-item-image', src, alt: label, loading: 'lazy' }));
  const info = el('div', { className: 'grid-item-info' });
  info.appendChild(el('h4', { className: 'grid-item-label', textContent: label }));
  info.appendChild(el('p', { className: 'grid-item-desc', textContent: desc }));
  item.appendChild(info);
  return item;
}
