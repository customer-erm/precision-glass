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

/**
 * Previews are agent-conducted "show, don't tell" moments: the 3D model
 * morphs while Alex talks, WITHOUT recording a selection or advancing the
 * tour. category 'camera' moves the stage camera instead.
 */
export function emitPreview(category: string, value: string): void {
  if (!category || !value) return;
  window.dispatchEvent(new CustomEvent<ChoiceDetail>('pg:preview', { detail: { category, value } }));
}

export function onPreview(fn: (detail: ChoiceDetail) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<ChoiceDetail>).detail);
  window.addEventListener('pg:preview', handler);
  return () => window.removeEventListener('pg:preview', handler);
}

/** Fired when the bathroom-photo prompt closes (uploaded=true if a photo is set). */
export function emitPhoto(uploaded: boolean): void {
  window.dispatchEvent(new CustomEvent<{ uploaded: boolean }>('pg:photo', { detail: { uploaded } }));
}

export function onPhoto(fn: (uploaded: boolean) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<{ uploaded: boolean }>).detail.uploaded);
  window.addEventListener('pg:photo', handler);
  return () => window.removeEventListener('pg:photo', handler);
}
