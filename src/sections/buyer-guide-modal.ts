/**
 * Buyer's-guide info modal — the "i" learn-more popups used across the tour.
 *
 * Shared so info buttons can be injected from the slide builders (works in every
 * mode: browse, voice, chat) and from manual-nav's browse wiring. Content comes
 * from GUIDE_ENTRIES; imagery falls back to the matching card's own image.
 */
import { el } from '../utils/dom';
import { getGuideEntry } from '../data/buyer-guide';

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatBody(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

export function closeBuyerGuideModal(): void {
  const modal = document.getElementById('bg-modal');
  if (modal) modal.classList.remove('visible');
}

export function openBuyerGuideModal(label: string): void {
  const entry = getGuideEntry(label);
  if (!entry) return;

  let modal = document.getElementById('bg-modal');
  if (!modal) {
    modal = el('div', { className: 'bg-modal', id: 'bg-modal' });
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBuyerGuideModal();
    });
  }

  // Resolve image: prefer entry.image, else the matching card's own image.
  let img = entry.image;
  if (!img) {
    const wanted = label.toLowerCase();
    const matchingCard = Array.from(document.querySelectorAll<HTMLElement>('[data-label]')).find(
      (c) => (c.getAttribute('data-label') || '').toLowerCase() === wanted,
    );
    const cardImg = (matchingCard?.querySelector('img')
      || document.querySelector(`#slide-extras img[alt]`)) as HTMLImageElement | null;
    if (cardImg && matchingCard) img = (matchingCard.querySelector('img') as HTMLImageElement | null)?.src;
  }

  modal.innerHTML = `
    <div class="bg-modal-card">
      <button type="button" class="bg-modal-close" aria-label="Close">✕</button>
      <div class="bg-modal-body">
        ${img ? `<div class="bg-modal-image"><img src="${escapeAttr(img)}" alt="${escapeAttr(entry.title)}"></div>` : ''}
        <div class="bg-modal-content">
          <div class="bg-modal-eyebrow">Buyer’s guide</div>
          <h2 class="bg-modal-title">${escapeHtml(entry.title)}</h2>
          ${entry.subtitle ? `<p class="bg-modal-subtitle">${escapeHtml(entry.subtitle)}</p>` : ''}
          <div class="bg-modal-copy">${formatBody(entry.body)}</div>
          ${
            entry.specs && entry.specs.length
              ? `<div class="bg-modal-specs">${entry.specs
                  .map((s) => `<div class="bg-modal-spec"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.value)}</strong></div>`)
                  .join('')}</div>`
              : ''
          }
          ${
            entry.pros && entry.pros.length
              ? `<div class="bg-modal-prosCons"><div class="bg-modal-list pros"><h4>Pros</h4><ul>${entry.pros
                  .map((p) => `<li>${escapeHtml(p)}</li>`)
                  .join('')}</ul></div>${
                  entry.cons && entry.cons.length
                    ? `<div class="bg-modal-list cons"><h4>Trade-offs</h4><ul>${entry.cons
                        .map((c) => `<li>${escapeHtml(c)}</li>`)
                        .join('')}</ul></div>`
                    : ''
                }</div>`
              : ''
          }
          <div class="bg-modal-actions">
            <button type="button" class="bg-modal-btn primary" data-bg-pick="${escapeAttr(label)}">Choose ${escapeHtml(entry.title)}</button>
            <button type="button" class="bg-modal-btn" data-bg-dismiss>Keep browsing</button>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.querySelector('.bg-modal-close')?.addEventListener('click', closeBuyerGuideModal);
  modal.querySelector('[data-bg-dismiss]')?.addEventListener('click', closeBuyerGuideModal);
  modal.querySelector('[data-bg-pick]')?.addEventListener('click', (ev) => {
    const pickLabel = (ev.currentTarget as HTMLElement).getAttribute('data-bg-pick') || '';
    closeBuyerGuideModal();
    // Click the matching selectable card if one is on screen (browse mode).
    const matchCard = Array.from(document.querySelectorAll<HTMLElement>('.browse-option[data-label]')).find(
      (c) => (c.getAttribute('data-label') || '').toLowerCase() === pickLabel.toLowerCase(),
    );
    matchCard?.click();
  });

  requestAnimationFrame(() => modal!.classList.add('visible'));
}

/**
 * Inject a small round "i" learn-more button onto a card, opening the guide
 * modal for `label`. No-op if there's no guide entry or a button already exists.
 */
export function addInfoButton(card: HTMLElement, label: string): void {
  if (!label || !getGuideEntry(label) || card.querySelector('.card-info-btn')) return;
  if (!card.getAttribute('data-label')) card.setAttribute('data-label', label);
  const infoBtn = el('button', {
    className: 'card-info-btn',
    type: 'button',
    innerHTML: '<span aria-hidden="true">i</span><span class="sr-only">Learn more</span>',
    ariaLabel: `Learn more about ${label}`,
  });
  infoBtn.setAttribute('data-info-label', label);
  infoBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openBuyerGuideModal(label);
  });
  card.appendChild(infoBtn);
}
