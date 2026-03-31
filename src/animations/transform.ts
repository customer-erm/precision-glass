import { gsap, EASE } from './engine';
// GSAP only used for the dramatic page transform timeline + letter reveal
// Tour scrolling and fade-in-up use native CSS/JS
import { splitTextToSpans } from '../utils/dom';
import type { ServiceType } from '../utils/state';

const SERVICE_TITLES: Record<string, string> = {
  showers: 'Frameless Shower Enclosures',
  railings: 'Glass Railing Systems',
  commercial: 'Commercial Glass Solutions',
};

export function playTransformAnimation(service: ServiceType): Promise<void> {
  if (!service) return Promise.resolve();

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        resolve();
      },
    });

    // Phase 1: Collapse landing content
    const cards = document.querySelectorAll('.service-card');
    const selectedCard = document.querySelector(`.service-card[data-service="${service}"]`);
    const otherCards = Array.from(cards).filter((c) => c !== selectedCard);

    tl.to('.hero-badge', { opacity: 0, y: -20, duration: 0.4 })
      .to('.hero-title', { opacity: 0, y: -30, duration: 0.4 }, '-=0.3')
      .to('.hero-subtitle', { opacity: 0, y: -20, duration: 0.3 }, '-=0.2')
      .to('#mic-container', { opacity: 0, scale: 0.8, duration: 0.3 }, '-=0.2')
      .to('.mic-label', { opacity: 0, duration: 0.2 }, '-=0.3');

    // Fade out non-selected cards
    tl.to(otherCards, {
      opacity: 0,
      scale: 0.9,
      x: (i: number) => (i === 0 ? -60 : 60),
      duration: 0.5,
      ease: EASE.smooth,
    }, '-=0.3');

    // Scale up selected card then fade
    if (selectedCard) {
      tl.to(selectedCard, {
        scale: 1.1,
        duration: 0.4,
        ease: EASE.smooth,
      }, '-=0.3')
        .to(selectedCard, {
          opacity: 0,
          scale: 1.3,
          duration: 0.5,
        });
    }

    // Phase 2: Hide hero, show service content
    tl.add(() => {
      window.scrollTo({ top: 0 });

      const hero = document.getElementById('hero');
      if (hero) hero.style.display = 'none';

      const serviceEl = document.getElementById(`service-${service}`);
      if (serviceEl) {
        serviceEl.classList.add('active');
        serviceEl.style.opacity = '0';
      }
    });

    // Phase 3: Fade in service content
    tl.to(`#service-${service}`, {
      opacity: 1,
      duration: 0.5,
    });

    // Letter-by-letter title reveal
    tl.add(() => {
      const titleEl = document.getElementById(`${service === 'showers' ? 'shower' : service}-hero-title`);
      if (titleEl) {
        const text = SERVICE_TITLES[service] || '';
        titleEl.innerHTML = '';
        const spans = splitTextToSpans(text);
        spans.forEach((s) => titleEl.appendChild(s));

        gsap.to(spans, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.03,
          ease: EASE.letterReveal,
        });
      }
    });

    // Fade in subtitle
    tl.from(`#service-${service} .service-hero-subtitle`, {
      opacity: 0,
      y: 20,
      duration: 0.6,
    }, '-=0.5');

    // Phase 4: Setup IntersectionObserver for fade-in animations
    tl.add(() => {
      setupFadeInObserver(service);
    }, '+=0.3');
  });
}

/**
 * Use IntersectionObserver instead of GSAP ScrollTrigger for fade-in-up elements.
 * Much simpler, no scroll conflicts.
 */
function setupFadeInObserver(service: string): void {
  const fadeEls = document.querySelectorAll(`#service-${service} .fade-in-up`);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        el.classList.add('visible');
        observer.unobserve(el);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -10% 0px',
  });

  fadeEls.forEach((el) => observer.observe(el));
}
