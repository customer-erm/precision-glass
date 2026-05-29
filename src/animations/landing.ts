import { gsap, EASE, DURATION } from './engine';

/**
 * Hero entrance. Targets the CURRENT hero DOM (title, subtitle, the framing
 * prompt, the three mode options, and the payoff caption). Honors
 * prefers-reduced-motion by skipping the motion entirely.
 */
export function playLandingAnimation(): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const targets = '.hero-title, .hero-subtitle, .mode-picker-welcome, .mode-prompt, .mode-option, .mode-caption';

  if (reduce) {
    gsap.set(targets, { clearProps: 'opacity,transform' });
    return;
  }

  // Clear any transient inline state, then run the entrance.
  gsap.set(targets, { clearProps: 'opacity,transform' });

  const tl = gsap.timeline({ defaults: { ease: EASE.gentle } });

  tl.fromTo('.hero-title',
    { opacity: 0, y: 34, filter: 'blur(6px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.85, ease: EASE.letterReveal },
  )
    .fromTo('.hero-subtitle',
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: DURATION.medium },
      '-=0.45',
    )
    .fromTo('.mode-picker-welcome',
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.4 },
      '-=0.3',
    )
    .fromTo('.mode-prompt',
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45 },
      '-=0.2',
    )
    .fromTo('.mode-option',
      { opacity: 0, y: 40, scale: 0.85 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.12, ease: EASE.snap },
      '-=0.15',
    )
    .fromTo('.mode-caption',
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5 },
      '-=0.3',
    );
}
