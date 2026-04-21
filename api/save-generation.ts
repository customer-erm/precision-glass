/**
 * Save a customer's AI-generated shower visualization to Vercel Blob
 * so we can surface them in galleries later.
 *
 * POST /api/save-generation
 *   body: { image: "data:image/png;base64,...", meta: {...} }
 *
 * Requires BLOB_READ_WRITE_TOKEN env var. If missing, returns a soft
 * no-op so the client never breaks.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = req.body as { image?: string; meta?: Record<string, unknown> } | undefined;
  if (!body) {
    res.status(400).json({ error: 'missing_body' });
    return;
  }

  const dataUrl = body.image;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'invalid_image' });
    return;
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: 'invalid_data_url' });
    return;
  }
  const mimeType = match[1];
  const base64 = match[2];
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';

  const meta = body.meta || {};
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const service = String(meta.service || 'showers').replace(/[^a-zA-Z0-9]/g, '');
  const pathname = `customer-generations/${service}/${ts}.${ext}`;

  try {
    const buf = Buffer.from(base64, 'base64');

    const blob = await put(pathname, buf, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
    });

    const metaPayload = JSON.stringify({ ...meta, pathname, url: blob.url, savedAt: ts });
    await put(
      pathname.replace(/\.[^.]+$/, '.json'),
      Buffer.from(metaPayload, 'utf-8'),
      {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      },
    );

    res.status(200).json({ ok: true, url: blob.url, pathname });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('BLOB_READ_WRITE_TOKEN') || message.includes('No token')) {
      console.warn('[save-generation] Vercel Blob token missing — skipping save.');
      res.status(200).json({ ok: false, skipped: true, reason: 'blob_not_configured' });
      return;
    }
    console.error('[save-generation] error:', message);
    res.status(500).json({ ok: false, error: message });
  }
}
