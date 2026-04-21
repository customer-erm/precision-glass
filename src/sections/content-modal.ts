/**
 * Spontaneous content modal — the agent can surface arbitrary educational/
 * inspirational content on demand via the show_topic tool. Pulls relevant
 * images from the project image library based on the topic/tags the agent
 * provides, and renders them alongside agent-authored copy.
 */

import { el } from '../utils/dom';
import { images } from '../data/image-map';

interface TopicImage {
  src: string;
  label: string;
  desc?: string;
}

export interface ShowTopicArgs {
  title: string;
  body: string;
  /** Optional: image tags to pull from the library. e.g. ["matte-black", "frosted-glass"]. */
  image_tags?: string[];
  /** Optional: explicit image URLs to show instead of searching the library. */
  image_urls?: string[];
  /** Optional: captions to pair with image_urls in the same order. */
  captions?: string[];
  /** Optional: primary CTA label + action. */
  primary_cta?: { label: string; action: 'open_contact' | 'launch_voice' | 'launch_chat' | 'close' };
}

/* ------------------------------------------------------------------ */
/*  Image library search                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a flat searchable list of every image we have, with plain-text tags.
 * This is what the agent effectively "sees" when picking imagery.
 */
function buildImageIndex(): Array<TopicImage & { tags: string }> {
  const out: Array<TopicImage & { tags: string }> = [];

  // Showers
  images.showers.gallery.forEach((src, i) => {
    out.push({ src, label: `Frameless shower install ${i + 1}`, tags: 'showers frameless gallery portfolio install project' });
  });
  out.push({ src: images.showers.hero, label: 'Frameless shower hero', tags: 'showers frameless hero main' });
  images.showers.enclosures.forEach((item) => {
    out.push({ src: item.src, label: item.label, desc: item.desc, tags: `showers enclosure ${item.id} ${item.label} ${item.desc || ''}`.toLowerCase() });
  });
  images.showers.glass.forEach((item) => {
    out.push({ src: item.src, label: item.label, desc: item.desc, tags: `showers glass ${item.id} ${item.label} ${item.desc || ''}`.toLowerCase() });
  });
  images.showers.hardware.forEach((item) => {
    out.push({ src: item.src, label: item.label, desc: item.desc, tags: `showers hardware finish ${item.id} ${item.label} ${item.desc || ''}`.toLowerCase() });
  });
  images.showers.accessories.forEach((item) => {
    out.push({ src: item.src, label: item.label, desc: item.desc, tags: `showers accessory handle ${item.id} ${item.label} ${item.desc || ''}`.toLowerCase() });
  });

  // Railings
  images.railings.gallery.forEach((src, i) => {
    out.push({ src, label: `Glass railing ${i + 1}`, tags: 'railings glass rail balcony stair pool deck' });
  });
  out.push({ src: images.railings.hero, label: 'Glass railing hero', tags: 'railings rail hero' });

  // Commercial
  images.commercial.gallery.forEach((src, i) => {
    out.push({ src, label: `Commercial project ${i + 1}`, tags: 'commercial storefront curtain wall office project' });
  });
  out.push({ src: images.commercial.hero, label: 'Commercial glass hero', tags: 'commercial storefront hero' });

  // Process
  images.process.forEach((item) => {
    out.push({ src: item.src, label: item.label, desc: item.desc, tags: `process install ${item.label} ${item.desc || ''}`.toLowerCase() });
  });

  return out;
}

let imageIndex: Array<TopicImage & { tags: string }> | null = null;

function searchImages(tags: string[], limit = 6): TopicImage[] {
  if (!imageIndex) imageIndex = buildImageIndex();
  const needles = tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
  if (!needles.length) return imageIndex.slice(0, limit);

  // Score each image by how many needles its tag string contains
  const scored = imageIndex.map((img) => {
    let score = 0;
    for (const n of needles) {
      if (img.tags.includes(n)) score += 2;
      else if (n.split(/\s+/).some((word) => word.length > 2 && img.tags.includes(word))) score += 1;
    }
    return { img, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.img);
  if (relevant.length) return relevant;
  // Fallback: show first N from the library so the modal never looks empty
  return imageIndex.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  DOM                                                                */
/* ------------------------------------------------------------------ */

export function buildContentModal(): HTMLElement {
  const modal = el('div', { className: 'content-modal', id: 'content-modal' });
  const card = el('div', { className: 'content-modal-card', id: 'content-modal-card' });
  modal.appendChild(card);

  // Click outside card closes modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeContentModal();
  });

  return modal;
}

export function showTopic(args: ShowTopicArgs): void {
  const card = document.getElementById('content-modal-card');
  const modal = document.getElementById('content-modal');
  if (!card || !modal) return;

  // Resolve images
  let pics: TopicImage[] = [];
  if (args.image_urls && args.image_urls.length) {
    pics = args.image_urls.map((src, i) => ({
      src,
      label: (args.captions && args.captions[i]) || '',
    }));
  } else if (args.image_tags && args.image_tags.length) {
    pics = searchImages(args.image_tags, 6);
  } else {
    pics = searchImages([args.title], 6);
  }

  const ctaLabel = args.primary_cta?.label || 'Start a quote';
  const ctaAction = args.primary_cta?.action || 'open_contact';

  card.innerHTML = `
    <div class="content-modal-eyebrow">Alex \u2192 Just for you</div>
    <h2 class="content-modal-title">${escapeHtml(args.title)}</h2>
    <div class="content-modal-body">${escapeBody(args.body)}</div>
    ${
      pics.length
        ? `<div class="content-modal-grid">${pics
            .map(
              (p) => `
              <div class="content-modal-item">
                <img src="${escapeAttr(p.src)}" alt="${escapeAttr(p.label)}" loading="lazy">
                ${p.label ? `<div class="content-modal-caption"><strong>${escapeHtml(p.label)}</strong>${p.desc ? ` \u00B7 ${escapeHtml(p.desc)}` : ''}</div>` : ''}
              </div>`,
            )
            .join('')}</div>`
        : ''
    }
    <div class="content-modal-actions">
      <button type="button" class="content-modal-btn" data-content-action="close">Close</button>
      <button type="button" class="content-modal-btn primary" data-content-action="${ctaAction}">${escapeHtml(ctaLabel)}</button>
    </div>
  `;

  modal.classList.add('visible');
}

export function closeContentModal(): void {
  document.getElementById('content-modal')?.classList.remove('visible');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Minimal formatting: paragraph breaks and simple bold/italic. */
function escapeBody(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
