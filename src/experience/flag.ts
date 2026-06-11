/**
 * Cinematic-experience feature flag.
 *
 * The new WebGL "blueprint → reality" experience is ON by default.
 * Escape hatches (for demos, debugging, or rolling back):
 *   - URL:           ?classic=1   (or just ?classic)
 *   - localStorage:  pg-experience = 'classic'
 *   - No WebGL2:     automatically falls back to the classic flow
 *
 * The classic slideshow code is untouched — flipping this flag swaps the
 * entire experience back instantly.
 */

let cached: boolean | null = null;

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

export function isCinematic(): boolean {
  if (cached !== null) return cached;

  const params = new URLSearchParams(window.location.search);
  if (params.has('classic')) {
    cached = false;
    return cached;
  }
  if (params.has('cinematic')) {
    cached = true;
    return cached;
  }
  try {
    if (localStorage.getItem('pg-experience') === 'classic') {
      cached = false;
      return cached;
    }
  } catch { /* private mode — ignore */ }

  cached = supportsWebGL();
  if (!cached) console.warn('[Experience] WebGL2 unavailable — using classic flow');
  return cached;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Rough mobile / low-power heuristic used to tune WebGL quality. */
export function isLowPowerDevice(): boolean {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 768;
  const lowMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory !== undefined
    && (navigator as unknown as { deviceMemory?: number }).deviceMemory! <= 4;
  return (coarse && smallScreen) || lowMem;
}
