/**
 * Tiny event bus connecting the existing flows (voice tools, chat driver,
 * browse clicks) to the cinematic 3D experience. Dependency-free so the
 * classic modules can emit without pulling in any WebGL code — in classic
 * mode the events simply have no listeners.
 */

export interface ChoiceDetail {
  /** 'enclosure' | 'glass' | 'hardware' | 'handle' | 'accessories' | 'extras' | rail/com keys */
  category: string;
  value: string;
}

export function emitChoice(category: string, value: string): void {
  if (!category || !value) return;
  window.dispatchEvent(new CustomEvent<ChoiceDetail>('pg:choice', { detail: { category, value } }));
}

export function onChoice(fn: (detail: ChoiceDetail) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<ChoiceDetail>).detail);
  window.addEventListener('pg:choice', handler);
  return () => window.removeEventListener('pg:choice', handler);
}
