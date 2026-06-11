/**
 * Slideshow facade — the single import point for every module that drives
 * the tour (voice tools, chat driver, browse manual-nav).
 *
 * Classic mode  → passthrough to the untouched original slideshow engine.
 * Cinematic mode → the same engine wrapped with the WebGL stage, camera
 * dollies, materialize transitions, and the parametric 3D shower.
 *
 * The DOM contract (slide ids, card classes, quote-sheet ids) is identical
 * in both modes, so manual-nav's click wiring and the agent tool handlers
 * work unchanged.
 */
import * as classic from '../animations/slideshow';
import * as cinematic from './cinematic';
import { isCinematic } from './flag';

export type { ServiceType } from '../animations/slideshow';

export function createSlideshow(service: classic.ServiceType = 'showers'): void {
  if (isCinematic()) cinematic.createSlideshow(service);
  else classic.createSlideshow(service);
}

export function showSlide(slideId: string): Promise<void> {
  return isCinematic() ? cinematic.showSlide(slideId) : classic.showSlide(slideId);
}

export function endSlideshow(): Promise<void> {
  return isCinematic() ? cinematic.endSlideshow() : classic.endSlideshow();
}

export function renderQuoteVisuals(choices: Record<string, string>): void {
  if (isCinematic()) cinematic.renderQuoteVisuals(choices);
  else classic.renderQuoteVisuals(choices);
}

export function markQuoteRenderReady(url: string): void {
  if (isCinematic()) cinematic.markQuoteRenderReady(url);
  else classic.markQuoteRenderReady(url);
}

export function showQuoteSent(): void {
  classic.showQuoteSent();
}

// These read/write shared state owned by the classic engine in both modes.
export const getActiveService = classic.getActiveService;
export const getCurrentSlideId = classic.getCurrentSlideId;
export const showBuyerGuidePopup = classic.showBuyerGuidePopup;
export const hideBuyerGuidePopup = classic.hideBuyerGuidePopup;
