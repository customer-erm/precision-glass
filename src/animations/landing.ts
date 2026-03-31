import { gsap, EASE, DURATION } from './engine';

export function playLandingAnimation(): void {
  const tl = gsap.timeline({ defaults: { ease: EASE.gentle } });

  // First, clear the CSS-set hidden state on all landing elements
  gsap.set('.hero-badge, .hero-title, .hero-subtitle, .service-card, #mic-container, .mic-label', {
    clearProps: 'opacity,transform',
  });

  tl.fromTo('.hero-badge',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: DURATION.medium }
  )
    .fromTo('.hero-title',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.8 },
      '-=0.3'
    )
    .fromTo('.hero-subtitle',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: DURATION.medium },
      '-=0.4'
    )
    .fromTo('.service-card',
      { opacity: 0, y: 60 },
      { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: EASE.snap },
      '-=0.3'
    )
    .fromTo('#mic-container',
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: DURATION.medium, ease: EASE.snap },
      '-=0.3'
    )
    .fromTo('.mic-label',
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4 },
      '-=0.2'
    );
}
