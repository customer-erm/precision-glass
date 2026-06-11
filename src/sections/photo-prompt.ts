/**
 * Shared "upload your bathroom" prompt — shown at the START of the shower
 * flow in every mode (voice / chat / browse) so the customer can drop in a
 * photo of their real bathroom. The photo then (a) personalizes the guidance
 * and (b) becomes the base image for the final AI render.
 *
 * Usage:
 *   buildPhotoPrompt()  // once, appended to the DOM at app init
 *   wirePhotoPrompt()   // once, wires the buttons
 *   await openPhotoPrompt()  // returns true if a photo was provided, false if skipped
 */

import { el } from '../utils/dom';
import { setBathroomPhoto, readFileAsDataUrl, getBathroomPhoto, clearBathroomPhoto } from '../utils/bathroom-photo';
import { emitPhoto } from '../experience/events';

let resolver: ((uploaded: boolean) => void) | null = null;

export function buildPhotoPrompt(): HTMLElement {
  const modal = el('div', { className: 'photo-prompt', id: 'photo-prompt' });
  const card = el('div', { className: 'photo-prompt-card' });
  card.innerHTML = `
    <button class="photo-prompt-close" id="photo-prompt-close" type="button" aria-label="Close">✕</button>
    <div class="photo-prompt-spark" aria-hidden="true">✨</div>
    <h3 class="photo-prompt-title">See it in <em>your</em> bathroom</h3>
    <p class="photo-prompt-desc">Drop in a photo of your bathroom and we'll render your new glass shower right into your real space — and tailor every recommendation to your layout. Totally optional.</p>
    <label class="photo-prompt-dropzone" for="photo-prompt-input" id="photo-prompt-dropzone">
      <span class="photo-prompt-dz-icon" aria-hidden="true">\u{1F4F7}</span>
      <span class="photo-prompt-dz-main">Tap to add a photo</span>
      <span class="photo-prompt-dz-sub">JPG, PNG, or HEIC · or drag &amp; drop</span>
    </label>
    <input type="file" id="photo-prompt-input" accept="image/*" capture="environment" hidden>
    <div class="photo-prompt-actions">
      <button class="photo-prompt-btn primary" id="photo-prompt-continue" type="button" hidden>Use this photo →</button>
      <button class="photo-prompt-btn ghost" id="photo-prompt-skip" type="button">Skip — use a showcase bathroom</button>
    </div>
  `;
  modal.appendChild(card);
  return modal;
}

/** Open the prompt. Resolves true if a photo is in place, false if skipped. */
export function openPhotoPrompt(): Promise<boolean> {
  return new Promise((resolve) => {
    resolver = resolve;
    const modal = document.getElementById('photo-prompt');
    if (!modal) { resolve(false); return; }
    renderState();
    modal.classList.add('visible');
  });
}

function renderState(): void {
  const dz = document.getElementById('photo-prompt-dropzone');
  const cont = document.getElementById('photo-prompt-continue');
  const existing = getBathroomPhoto();
  if (dz) {
    if (existing) {
      dz.classList.add('has-photo');
      dz.style.backgroundImage = `url("${existing.dataUrl}")`;
      dz.innerHTML = '<span class="photo-prompt-dz-badge">✓ Photo added — tap to change</span>';
    } else {
      dz.classList.remove('has-photo');
      dz.style.backgroundImage = '';
      dz.innerHTML = `
        <span class="photo-prompt-dz-icon" aria-hidden="true">\u{1F4F7}</span>
        <span class="photo-prompt-dz-main">Tap to add a photo</span>
        <span class="photo-prompt-dz-sub">JPG, PNG, or HEIC · or drag &amp; drop</span>`;
    }
  }
  if (cont) {
    if (existing) { (cont as HTMLElement).hidden = false; cont.textContent = 'Use this photo →'; }
    else { (cont as HTMLElement).hidden = true; }
  }
}

function done(uploaded: boolean): void {
  const modal = document.getElementById('photo-prompt');
  modal?.classList.remove('visible');
  const r = resolver;
  resolver = null;
  emitPhoto(uploaded);
  r?.(uploaded);
}

export function wirePhotoPrompt(): void {
  const input = document.getElementById('photo-prompt-input') as HTMLInputElement | null;
  input?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBathroomPhoto(dataUrl);
      renderState();
    } catch (err) {
      console.warn('[PhotoPrompt] upload failed:', err);
    }
  });

  document.getElementById('photo-prompt-continue')?.addEventListener('click', () => {
    done(!!getBathroomPhoto());
  });
  document.getElementById('photo-prompt-skip')?.addEventListener('click', () => {
    clearBathroomPhoto();
    done(false);
  });
  document.getElementById('photo-prompt-close')?.addEventListener('click', () => {
    done(!!getBathroomPhoto());
  });
  // Click outside the card closes (keeps whatever photo state exists)
  document.getElementById('photo-prompt')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'photo-prompt') done(!!getBathroomPhoto());
  });
}
