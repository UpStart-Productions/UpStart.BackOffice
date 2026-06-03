export const UPLOADS_URL_PREFIX = '/api/uploads/';

/** URL stored in DB and returned to clients (served by the API, not direct S3). */
export function publicUrlForKey(key: string): string {
  return `${UPLOADS_URL_PREFIX}${key.replace(/\\/g, '/')}`;
}

/** Normalize legacy direct S3 URLs or absolute URLs to the API proxy path. */
export function toPublicAssetUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith(UPLOADS_URL_PREFIX)) return stored;
  if (stored.includes('.amazonaws.com/')) {
    try {
      const key = new URL(stored).pathname.replace(/^\//, '');
      if (key) return publicUrlForKey(key);
    } catch {
      /* fall through */
    }
  }
  return stored;
}
