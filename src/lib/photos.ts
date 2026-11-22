// Recipe photos: shrunk to phone-screen size and kept as JPEG text, so they live in the plan and its backups.

const MAX_SIDE = 1024;
const QUALITY = 0.75;

/** A picture file (or blob) → a JPEG data URL no bigger than 1024 px on its longest side. */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/** Roughly how many KB a data URL takes up. */
export const photoKb = (dataUrl: string) => Math.round((dataUrl.length * 3) / 4 / 1024);
