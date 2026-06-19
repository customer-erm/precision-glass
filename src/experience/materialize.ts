/**
 * Materialize — the shared animation vocabulary of the cinematic experience.
 * Content doesn't slide in; it *assembles*: cards resolve from blur with
 * depth, headings settle cleanly, exits dissolve forward.
 * All entrances respect prefers-reduced-motion (simple fades).
 */
import { gsap } from '../animations/engine';
import { prefersReducedMotion } from './flag';

const CARD_SELECTOR = [
  '.ss-enc-card', '.ss-glass-card', '.ss-hw-card', '.ss-acc-card',
  '.ss-extra-card', '.ss-process-step', '.ss-info-bullet', '.ss-quote-step',
].join(',');

/* ------------------------------------------------------------------ */
/*  Text restore — headings always settle to their exact source copy     */
/* ------------------------------------------------------------------ */

const originalText = new WeakMap<HTMLElement, string>();
const decodeTweens = new WeakMap<HTMLElement, gsap.core.Tween>();

export function decodeText(el: HTMLElement, duration = 0.9): void {
  void duration;
  if (prefersReducedMotion()) return;
  const text = originalText.get(el) ?? el.dataset.cineText ?? el.textContent ?? '';
  if (!text.trim()) return;
  originalText.set(el, text);
  el.dataset.cineText = text;
  decodeTweens.get(el)?.kill();
  el.textContent = text;
  decodeTweens.delete(el);
}

/* ------------------------------------------------------------------ */
/*  Slide entrance / exit                                               */
/* ------------------------------------------------------------------ */

/**
 * Collect animation "units" inside a slide: each .slide-el, except that a
 * .slide-el wrapping a grid of cards explodes into its individual cards so
 * the grid assembles piece by piece.
 */
function collectUnits(slide: HTMLElement): HTMLElement[] {
  const units: HTMLElement[] = [];
  slide.querySelectorAll<HTMLElement>('.slide-el').forEach((el) => {
    const cards = Array.from(el.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    if (cards.length >= 2) units.push(el, ...cards);
    else units.push(el);
  });
  // Card grids that are NOT wrapped in a single .slide-el (each card is its
  // own .slide-el) are already covered by the loop above.
  return units;
}

export function materializeSlide(slide: HTMLElement, opts?: { stagger?: number }): gsap.core.Timeline {
  const stagger = opts?.stagger ?? 0.07;
  const tl = gsap.timeline();
  const units = collectUnits(slide);
  if (!units.length) return tl;

  if (prefersReducedMotion()) {
    tl.fromTo(units, { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.04 });
    return tl;
  }

  // Separate wrappers (set visible immediately) from cards (assemble)
  const wrappers = units.filter((u) => u.classList.contains('slide-el')
    && u.querySelectorAll(CARD_SELECTOR).length >= 2);
  const headings = Array.from(slide.querySelectorAll<HTMLElement>('.slide-heading, .slide-title, .slide-label'));
  const pieces = units.filter((u) => !wrappers.includes(u) && !headings.includes(u));

  if (wrappers.length) tl.set(wrappers, { opacity: 1, y: 0, clearProps: 'filter' }, 0);

  if (headings.length) {
    tl.fromTo(
      headings,
      {
        opacity: 0,
        y: 18,
        scale: 0.985,
        clipPath: 'inset(0 100% 0 0)',
        filter: 'blur(8px) brightness(1.45)',
        textShadow: '0 0 28px rgba(125, 211, 252, 0.7)',
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        clipPath: 'inset(0 0% 0 0)',
        filter: 'blur(0px) brightness(1)',
        textShadow: '0 2px 28px rgba(8, 20, 40, 0.85)',
        duration: 0.72,
        ease: 'power3.out',
        stagger: 0.08,
        clearProps: 'clipPath,filter,textShadow,transform',
      },
      0,
    );
  }

  tl.fromTo(
    pieces,
    {
      opacity: 0,
      y: 36,
      scale: 0.96,
      rotationX: -8,
      transformPerspective: 900,
      filter: 'blur(14px) brightness(1.6)',
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      rotationX: 0,
      filter: 'blur(0px) brightness(1)',
      duration: 0.85,
      ease: 'power3.out',
      stagger: { each: stagger, from: 'start' },
      clearProps: 'filter,transform',
    },
    0.05,
  );

  tl.set(pieces, { opacity: 1, y: 0, scale: 1, rotationX: 0, clearProps: 'filter,transform' }, '>');

  const settleMs = Math.ceil((0.95 + pieces.length * stagger) * 1000) + 250;
  window.setTimeout(() => {
    if (!slide.classList.contains('active')) return;
    gsap.set(pieces, { opacity: 1, y: 0, scale: 1, rotationX: 0, clearProps: 'filter,transform' });
  }, settleMs);

  // Restore the headline text as it lands. This used to scramble characters,
  // but reliability matters more here than a decorative decode effect.
  slide.querySelectorAll<HTMLElement>('.slide-heading, .slide-title, .slide-label').forEach((el, i) => {
    tl.add(() => decodeText(el, el.classList.contains('slide-label') ? 0.5 : 0.9), 0.1 + i * 0.08);
  });

  return tl;
}

export function dematerializeSlide(slide: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const units = collectUnits(slide).filter((u) =>
      !(u.classList.contains('slide-el') && u.querySelectorAll(CARD_SELECTOR).length >= 2));
    if (!units.length || prefersReducedMotion()) {
      gsap.to(slide, { opacity: 0, duration: 0.25, onComplete: () => { gsap.set(slide, { clearProps: 'opacity' }); resolve(); } });
      return;
    }
    gsap.to(units, {
      opacity: 0,
      y: -22,
      scale: 1.02,
      filter: 'blur(10px)',
      duration: 0.38,
      ease: 'power2.in',
      stagger: { each: 0.025, from: 'end' },
      onComplete: () => {
        gsap.set(units, { clearProps: 'filter' });
        resolve();
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Render reveal flourish (finale)                                     */
/* ------------------------------------------------------------------ */

export function revealRender(imgWrap: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const flash = document.createElement('div');
  flash.className = 'cine-reveal-flash';
  imgWrap.appendChild(flash);
  const tl = gsap.timeline({ onComplete: () => flash.remove() });
  tl.fromTo(flash, { opacity: 0 }, { opacity: 0.9, duration: 0.18, ease: 'power1.in' })
    .to(flash, { opacity: 0, duration: 0.9, ease: 'power2.out' })
    .fromTo(imgWrap, { scale: 0.965 }, { scale: 1, duration: 1.1, ease: 'power3.out', clearProps: 'transform' }, 0.1);
}
