/**
 * Fire-and-forget POST of a successful AI visualization to the
 * /api/save-generation endpoint so it gets persisted to Vercel Blob
 * for use in our customer gallery later.
 */

export interface GenerationMeta {
  service?: 'showers' | 'railings' | 'commercial';
  enclosure?: string;
  glass?: string;
  hardware?: string;
  handle?: string;
  accessories?: string;
  extras?: string;
  customerName?: string;
  customerEmail?: string;
  mode?: 'voice' | 'chat' | 'browse';
}

export async function saveCustomerGeneration(
  dataUrl: string,
  meta: GenerationMeta = {},
): Promise<void> {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
    const res = await fetch('/api/save-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, meta }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      console.log('[SaveGen] Saved customer generation', json);
    } else {
      console.warn('[SaveGen] Save failed:', res.status);
    }
  } catch (err) {
    // Never throw — this is best-effort background telemetry
    console.warn('[SaveGen] Error:', err);
  }
}
