/**
 * Tour visual effects — highlights within the slideshow.
 * No scrolling — the slideshow handles slide transitions.
 * Highlights target elements by data-id in the slideshow, falling back to id on the regular page.
 */

let currentHighlightedEl: HTMLElement | null = null;
let currentDimmed: HTMLElement[] = [];
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function highlightElement(elementId: string): void {
  clearHighlight();

  // Look in slideshow first (data-id), then regular page (id)
  const slideshow = document.getElementById('tour-slideshow');
  let target: HTMLElement | null = null;

  if (slideshow) {
    target = slideshow.querySelector(`[data-id="${elementId}"]`) as HTMLElement;
  }
  if (!target) {
    target = document.getElementById(elementId);
  }
  if (!target) return;

  currentHighlightedEl = target;

  // Dim siblings in the same grid
  const parent = target.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((c) => c !== target) as HTMLElement[];
    siblings.forEach((s) => s.classList.add('dimmed'));
    currentDimmed = siblings;
  }

  target.classList.add('highlighted');

  // Auto-clear after 6s
  clearTimer = setTimeout(clearHighlight, 6000);
}

export function clearHighlight(): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  if (currentHighlightedEl) {
    currentHighlightedEl.classList.remove('highlighted');
    currentHighlightedEl = null;
  }

  // Belt-and-suspenders cleanup
  document.querySelectorAll('.highlighted').forEach((el) => el.classList.remove('highlighted'));

  currentDimmed.forEach((el) => el.classList.remove('dimmed'));
  currentDimmed = [];
}
