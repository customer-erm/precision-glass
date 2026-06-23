import { gsap, EASE } from './engine';

/**
 * Single smooth transition: collapse landing hero → fade to black.
 * The slideshow overlay appears immediately after.
 * No intermediate "service content" step — goes directly to slideshow.
 */
export function playTransformAnimation(): Promise<void> {
  return new Promise((resolve) => {
    // Signal that the page is leaving the landing hero for the tour stage.
    // The shower-designer uses this to slide its bottom agent bar in.
    window.dispatchEvent(new CustomEvent('precision:transform'));

    // Jump to the top instantly BEFORE anything moves — and hide the hero
    // with visibility (not display) so the page never reflows and the
    // section below the hero can't flash into view mid-transition.
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

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

    // Hide the hero without collapsing the layout (no scroll jump)
    tl.add(() => {
      const hero = document.getElementById('hero');
      if (hero) {
        hero.style.visibility = 'hidden';
        hero.style.pointerEvents = 'none';
      }
    });
  });
}
