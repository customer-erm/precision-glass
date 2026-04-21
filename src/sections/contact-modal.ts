/**
 * Contact modal — opened by the top-right "Get a quote" CTA or the help menu's
 * "Get a quote" option. Lightweight form that captures basic info and persists
 * it to localStorage so the agent can reference it on future visits.
 */

import { el } from '../utils/dom';
import { saveUser, loadUser } from '../utils/user-storage';

export function buildContactModal(): HTMLElement {
  const user = loadUser();

  const modal = el('div', { className: 'contact-modal', id: 'contact-modal' });
  const card = el('div', { className: 'contact-modal-card' });

  card.innerHTML = `
    <h3 class="contact-modal-title">Let's get your quote started</h3>
    <p class="contact-modal-desc">Drop your details and our team will reach out with a custom quote within 24 hours. Prefer to talk now? Call us at <strong>(800) 555-1234</strong>.</p>
    <form class="contact-modal-form" id="contact-modal-form">
      <label>Name<input type="text" name="name" required value="${escapeAttr(user?.name || '')}" placeholder="Your name"></label>
      <label>Email<input type="email" name="email" required value="${escapeAttr(user?.email || '')}" placeholder="you@example.com"></label>
      <label>Phone<input type="tel" name="phone" value="${escapeAttr(user?.phone || '')}" placeholder="(555) 123-4567"></label>
      <label>Service<select name="service">
        <option value="">Select a service</option>
        <option>Frameless Shower</option>
        <option>Glass Railing</option>
        <option>Commercial Glass</option>
        <option>Not sure yet</option>
      </select></label>
      <label>Tell us about your project<textarea name="notes" rows="3" placeholder="Size, timeline, design inspiration\u2026"></textarea></label>
      <div class="contact-modal-actions">
        <button type="button" class="contact-modal-cancel">Cancel</button>
        <button type="submit" class="primary">Send it</button>
      </div>
    </form>
    <div class="contact-modal-success" id="contact-modal-success">
      <h4>\u2705 Got it, thanks!</h4>
      <p>A specialist will be in touch within 24 hours.</p>
    </div>
  `;

  modal.appendChild(card);
  return modal;
}

export function openContactModal(): void {
  document.getElementById('contact-modal')?.classList.add('visible');
}
export function closeContactModal(): void {
  document.getElementById('contact-modal')?.classList.remove('visible');
  // Reset form state next open
  setTimeout(() => {
    const form = document.getElementById('contact-modal-form') as HTMLFormElement | null;
    const success = document.getElementById('contact-modal-success');
    if (form) form.style.display = '';
    if (success) success.classList.remove('visible');
  }, 400);
}

export function wireContactModal(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.contact-modal-cancel')) {
      closeContactModal();
      return;
    }
    // Click on backdrop (outside the card) closes modal
    const modal = target.closest('.contact-modal');
    if (modal && target === modal) {
      closeContactModal();
    }
  });

  const form = document.getElementById('contact-modal-form') as HTMLFormElement | null;
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const get = (k: string) => String(data.get(k) || '').trim();
      const payload = {
        name: get('name') || undefined,
        email: get('email') || undefined,
        phone: get('phone') || undefined,
      };
      saveUser(payload);
      console.log('[Contact] Submitted', { ...payload, service: get('service'), notes: get('notes') });

      form.style.display = 'none';
      document.getElementById('contact-modal-success')?.classList.add('visible');
      setTimeout(closeContactModal, 2500);
    });
  }
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
