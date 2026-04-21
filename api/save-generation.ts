/**
 * Save a customer's AI-generated shower visualization to persistent storage
 * so we can use them in galleries later.
 *
 * Uses Vercel Blob. If BLOB_READ_WRITE_TOKEN isn't set in Vercel env,
 * falls back to a no-op so the client doesn't fail.
 *
 * POST /api/save-generation
 *   body: { image: "data:image/png;base64,...", meta: {...} }
 *   returns: { ok: true, url: "...", pathname: "..." }
 */

import { put } from '@vercel/blob';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: { image?: string; meta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const dataUrl = body.image;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return json({ error: 'invalid_image' }, 400);
  }

  // Parse data URL: data:image/png;base64,XXXX
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    return json({ error: 'invalid_data_url' }, 400);
  }
  const mimeType = match[1];
  const base64 = match[2];
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';

  // Build a filename with a timestamp + short meta hint
  const meta = body.meta || {};
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const service = String(meta.service || 'showers').replace(/[^a-zA-Z0-9]/g, '');
  const pathname = `customer-generations/${service}/${ts}.${ext}`;

  try {
    // Decode base64 to bytes (edge runtime supports atob + Uint8Array)
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const blob = await put(pathname, bytes, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
    });

    // Also save a sidecar JSON with metadata for later gallery building
    const metaPayload = JSON.stringify({ ...meta, pathname, url: blob.url, savedAt: ts });
    await put(
      pathname.replace(/\.[^.]+$/, '.json'),
      new TextEncoder().encode(metaPayload),
      {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      },
    );

    return json({ ok: true, url: blob.url, pathname });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface BLOB_READ_WRITE_TOKEN missing as a soft no-op so the client
    // never errors during a user session
    if (message.includes('BLOB_READ_WRITE_TOKEN')) {
      console.warn('[save-generation] Vercel Blob token missing — skipping save.');
      return json({ ok: false, skipped: true, reason: 'blob_not_configured' }, 200);
    }
    console.error('[save-generation] error:', message);
    return json({ ok: false, error: message }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
