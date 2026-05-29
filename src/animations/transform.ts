import { gsap, EASE } from './engine';

/**
 * Single smooth transition: collapse landing hero → fade to black.
 * The slideshow overlay appears immediately after.
 * No intermediate "service content" step — goes directly to slideshow.
 */
export function playTransformAnimation(): Promise<void> {
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });

    // Fade out hero content elements with a staggered exit
    tl.to('.hero-title', { opacity: 0, y: -30, duration: 0.3 })
      .to('.hero-subtitle', { opacity: 0, y: -20, duration: 0.25 }, '-=0.18')
      .to('.mode-picker-welcome', { opacity: 0, y: -14, duration: 0.2 }, '-=0.18')
      .to('.mode-prompt', { opacity: 0, y: -14, duration: 0.22 }, '-=0.16')
      .to('.mode-option', { opacity: 0, y: 24, scale: 0.8, duration: 0.32, stagger: 0.06 }, '-=0.12')
      .to('.mode-caption', { opacity: 0, y: 10, duration: 0.22 }, '-=0.26');

    // Fade the entire hero to dark
    tl.to('#hero', {
      opacity: 0,
      duration: 0.4,
      ease: EASE.smooth,
    });

    // Hide hero from layout
    tl.add(() => {
      const hero = document.getElementById('hero');
      if (hero) hero.style.display = 'none';
      window.scrollTo({ top: 0 });
    });
  });
}
