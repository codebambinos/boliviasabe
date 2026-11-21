// Photo preparation for uploads (wiki #34, #142): the browser compresses to 1280 px on the longest
// side (JPEG 0.8) and makes a 480 px thumbnail for the grid. The original can be up to 10 MB.
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const PHOTO_SIDE = 1280;
const THUMB_SIDE = 480;
const QUALITY = 0.8;

export class PhotoError extends Error {
  constructor(readonly reason: 'too-big' | 'not-image') {
    super(reason === 'too-big' ? 'Photo over 10 MB' : 'Not an image');
    this.name = 'PhotoError';
  }
}

type Source = { image: CanvasImageSource; width: number; height: number; release: () => void };

/** Decodes the file with its EXIF orientation applied. */
async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older Safari: fall back to <img>, which applies EXIF orientation by default
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError('not-image');
  }
}

function resize(source: CanvasImageSource, width: number, height: number, side: number): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new PhotoError('not-image'));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, canvas }) : reject(new PhotoError('not-image'))), 'image/jpeg', QUALITY),
  );
}

/** Rejects with PhotoError('too-big' | 'not-image'). */
export async function preparePhoto(file: File): Promise<{ photo: Blob; thumb: Blob }> {
  if (file.type && !file.type.startsWith('image/')) throw new PhotoError('not-image');
  if (file.size > MAX_ORIGINAL_BYTES) throw new PhotoError('too-big');
  const source = await decode(file);
  try {
    const big = await resize(source.image, source.width, source.height, PHOTO_SIDE);
    // The thumbnail comes from the 1280 px result, not the original: less memory on cheap phones
    const small = await resize(big.canvas, big.canvas.width, big.canvas.height, THUMB_SIDE);
    return { photo: big.blob, thumb: small.blob };
  } finally {
    source.release();
  }
}
