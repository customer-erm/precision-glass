/**
 * Stores the customer's uploaded bathroom photo (if any) in memory for the
 * duration of the session. Used as:
 *   1. Visual context the agent can reference when giving advice
 *   2. Base image for the final AI rendering (in-their-actual-bathroom)
 *
 * We keep this as a module-level singleton so both the chat driver and
 * the browse manual-nav can read/write it without plumbing through every
 * function. It's reset on "Start Over" via a full page reload.
 */

let currentPhoto: { dataUrl: string; mimeType: string } | null = null;

export function setBathroomPhoto(dataUrl: string): void {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = match ? match[1] : 'image/jpeg';
  currentPhoto = { dataUrl, mimeType };
  console.log('[BathroomPhoto] Stored:', mimeType, `${Math.round(dataUrl.length / 1024)}kb`);
}

export function getBathroomPhoto(): { dataUrl: string; mimeType: string } | null {
  return currentPhoto;
}

export function clearBathroomPhoto(): void {
  currentPhoto = null;
}

/**
 * Read a File object (from an <input type="file">) into a base64 data URL.
 * Resizes very large images to a reasonable max dimension to keep the API
 * request payload small.
 */
export function readFileAsDataUrl(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read_error'));
    reader.onload = () => {
      const src = String(reader.result);
      // If the image is small enough, use as-is
      if ((reader.result as string).length < 1_500_000) {
        resolve(src);
        return;
      }
      // Otherwise, downscale via canvas
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
