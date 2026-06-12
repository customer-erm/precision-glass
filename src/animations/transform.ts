import { gsap, EASE } from './engine';

/**
 * Single smooth transition: collapse landing hero → fade to black.
 * The slideshow overlay appears immediately after.
 * No intermediate "service content" step — goes directly to slideshow.
 */
export function playTransformAnimation(): Promise<void> {
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });

    // One fluid exit: copy and controls lift away together with a blur,
    // overlapping heavily so the whole hand-off reads as a single motion.
    tl.to('.hero-title, .hero-subtitle, .hero-trust, .mode-picker-welcome, .mode-prompt', {
      opacity: 0, y: -26, filter: 'blur(8px)', duration: 0.34, stagger: 0.03,
    })
      .to('.mode-option, .mode-caption', { opacity: 0, y: 18, scale: 0.92, duration: 0.3, stagger: 0.04 }, '-=0.3');

    // Fade the entire hero to dark while the content is still exiting
    tl.to('#hero', {
      opacity: 0,
      duration: 0.35,
      ease: EASE.smooth,
    }, '-=0.18');

    // Hide hero from layout
    tl.add(() => {
      const hero = document.getElementById('hero');
      if (hero) hero.style.display = 'none';
      window.scrollTo({ top: 0 });
    });
  });
}
