// Photos in the public `photos` bucket (SPEC 11): one folder per profile, so the bucket policy lets each
// person write only their own files. The screen already compressed them (1280 px and the 480 px thumbnail).
import { supabase } from './client';
import { toDataError } from './rpc';

const BUCKET = 'photos';
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

async function upload(path: string, file: Blob): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false });
  if (error) throw toDataError(error);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads the photo and, when given, its thumbnail. Returns their public URLs and the paths to undo them. */
export async function uploadPhotos(profileId: number, photo: Blob, thumb?: Blob): Promise<{ photoUrl: string; thumbUrl: string; paths: string[] }> {
  const base = `${profileId}/${crypto.randomUUID()}`;
  const photoUrl = await upload(`${base}.jpg`, photo);
  if (!(thumb instanceof Blob)) return { photoUrl, thumbUrl: photoUrl, paths: [`${base}.jpg`] };
  try {
    const thumbUrl = await upload(`${base}-480.jpg`, thumb);
    return { photoUrl, thumbUrl, paths: [`${base}.jpg`, `${base}-480.jpg`] };
  } catch (error) {
    await removePaths([`${base}.jpg`]);
    throw error;
  }
}

/** Best effort: an orphan file is harmless and invisible. */
export async function removePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    /* left behind */
  }
}

/** The bucket path of one of our public URLs, or null for any other URL (seed photos, for example). */
export function pathOf(url: string | null): string | null {
  if (!url) return null;
  const at = url.indexOf(PUBLIC_PREFIX);
  return at < 0 ? null : decodeURIComponent(url.slice(at + PUBLIC_PREFIX.length));
}
