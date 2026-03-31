import { el } from '../utils/dom';

const QUOTE_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'enclosure_type', label: 'Enclosure Type' },
  { key: 'glass_type', label: 'Glass Preference' },
  { key: 'hardware_finish', label: 'Hardware Finish' },
  { key: 'timeline', label: 'Project Timeline' },
  { key: 'notes', label: 'Additional Notes' },
];

export function buildQuoteOverlay(): HTMLElement {
  const overlay = el('div', { className: 'quote-overlay', id: 'quote-overlay' });
  const card = el('div', { className: 'quote-card' });

  const title = el('h3', { className: 'quote-title', textContent: 'Your Project Details' });
  const fieldsContainer = el('div', { id: 'quote-fields' });

  QUOTE_FIELDS.forEach((f) => {
    const field = el('div', { className: 'quote-field', id: `quote-field-${f.key}` });
    field.appendChild(el('div', { className: 'quote-field-label', textContent: f.label }));
    field.appendChild(el('div', { className: 'quote-field-value', id: `quote-value-${f.key}` }));
    fieldsContainer.appendChild(field);
  });

  const submitted = el('div', { className: 'quote-submitted', id: 'quote-submitted' });
  submitted.innerHTML = `
    <div class="quote-submitted-icon">✓</div>
    <h3 class="quote-submitted-title">Quote Request Submitted!</h3>
    <p class="quote-submitted-desc">We'll prepare your custom quote and reach out within 24 hours.</p>
  `;

  card.append(title, fieldsContainer, submitted);
  overlay.appendChild(card);
  return overlay;
}

export function showQuoteOverlay(): void {
  const overlay = document.getElementById('quote-overlay');
  if (overlay) overlay.classList.add('active');
}

export function updateQuoteField(field: string, value: string): void {
  const fieldEl = document.getElementById(`quote-field-${field}`);
  const valueEl = document.getElementById(`quote-value-${field}`);
  if (fieldEl) fieldEl.classList.add('active');
  if (valueEl) {
    valueEl.textContent = value;
    valueEl.classList.add('filled');
  }
}

export function showQuoteSubmitted(): void {
  const fields = document.getElementById('quote-fields');
  const submitted = document.getElementById('quote-submitted');
  if (fields) fields.style.display = 'none';
  if (submitted) submitted.classList.add('visible');
}

export function hideQuoteOverlay(): void {
  const overlay = document.getElementById('quote-overlay');
  if (overlay) overlay.classList.remove('active');
}
