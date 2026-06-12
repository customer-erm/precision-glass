/**
 * Upgrade compatibility rules — one source of truth shared by the 3D rig,
 * the UI (greying out cards), and the agent (explaining why something
 * isn't offered). Dependency-free so it can live in the main bundle.
 *
 * Real-world install logic:
 *  - STEAM needs a fully sealed enclosure with a gasketed hinged door.
 *    Open walk-ins have no door, bypass sliders can't seal their track,
 *    and radius-bent glass can't take steam transoms/seals reliably.
 *  - GRID patterns are applied muntin bars on FLAT glass — they can't
 *    follow radius-bent (curved) panels.
 */

export interface ExtrasCompat {
  steam: boolean;
  grid: boolean;
  steamReason: string;
  gridReason: string;
}

export function extrasCompat(enclosureLabel: string): ExtrasCompat {
  const v = (enclosureLabel || '').toLowerCase();
  const isWalkIn = v.includes('splash') || v.includes('walk');
  const isSlider = v.includes('slider') || v.includes('slide') || v.includes('bypass');
  const isCurved = v.includes('curv') || v.includes('round');

  return {
    steam: !(isWalkIn || isSlider || isCurved),
    grid: !isCurved,
    steamReason: isWalkIn
      ? 'an open walk-in panel has no door to seal, so it can’t hold steam'
      : isSlider
        ? 'a bypass slider can’t seal along its track, so it can’t hold steam'
        : isCurved
          ? 'curved glass can’t take the steam transom and seals'
          : '',
    gridReason: isCurved ? 'grid patterns are flat muntin bars and can’t follow curved glass' : '',
  };
}
