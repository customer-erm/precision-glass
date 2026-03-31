import { el } from '../utils/dom';

const BOOK_SVG = `<svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`;

export function buildBuyersGuide(): HTMLElement {
  const overlay = el('div', { className: 'buyers-guide-overlay', id: 'buyers-guide-overlay' });
  const card = el('div', { className: 'buyers-guide-card' });

  const icon = el('div', { className: 'buyers-guide-icon', innerHTML: BOOK_SVG });
  const title = el('h3', { className: 'buyers-guide-title', id: 'buyers-guide-title', textContent: "Free Buyer's Guide" });
  const desc = el('p', { className: 'buyers-guide-desc', id: 'buyers-guide-desc', textContent: "Get our comprehensive guide covering everything you need to know — pricing ranges, maintenance tips, and expert recommendations." });

  const emailRow = el('div', { className: 'buyers-guide-email' });
  const emailInput = el('input', {
    id: 'buyers-guide-email-input',
    type: 'email',
    placeholder: 'your@email.com',
  });
  emailRow.appendChild(emailInput);

  const check = el('div', { className: 'buyers-guide-check', id: 'buyers-guide-check' });
  check.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> <span>We'll send it right over!</span>`;

  card.append(icon, title, desc, emailRow, check);
  overlay.appendChild(card);
  return overlay;
}

export function showBuyersGuide(serviceName: string): void {
  const overlay = document.getElementById('buyers-guide-overlay');
  const title = document.getElementById('buyers-guide-title');
  const desc = document.getElementById('buyers-guide-desc');
  if (overlay) overlay.classList.add('active');
  if (title) title.textContent = `Free ${serviceName} Buyer's Guide`;
  if (desc) desc.textContent = `Get our comprehensive ${serviceName.toLowerCase()} guide covering everything we just discussed — plus pricing ranges, maintenance tips, and expert recommendations.`;
}

export function fillBuyersGuideEmail(email: string): void {
  const input = document.getElementById('buyers-guide-email-input') as HTMLInputElement | null;
  const check = document.getElementById('buyers-guide-check');
  if (input) {
    input.value = email;
    input.classList.add('filled');
  }
  if (check) check.classList.add('visible');

  // Auto-close after 3 seconds
  setTimeout(() => {
    const overlay = document.getElementById('buyers-guide-overlay');
    if (overlay) overlay.classList.remove('active');
  }, 3000);
}

export function hideBuyersGuide(): void {
  const overlay = document.getElementById('buyers-guide-overlay');
  if (overlay) overlay.classList.remove('active');
}
