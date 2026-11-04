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

/** Absolute href for emails and embeds (upload paths are stored as `/api/uploads/…`). */
export function absolutePublicAssetUrl(stored: string | null | undefined): string | null {
  const url = toPublicAssetUrl(stored);
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('mailto:') || url.startsWith('tel:')) return url;
  if (!url.startsWith('/')) return url;
  const apiBase = process.env.API_BASE_URL?.trim().replace(/\/$/, '') ?? '';
  const origin = apiBase.replace(/\/api\/?$/, '') || `http://localhost:${process.env.PORT?.trim() || '3001'}`;
  return `${origin}${url}`;
}
