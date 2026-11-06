export const UPLOADS_URL_PREFIX = '/api/uploads/';

/** URL stored in DB and returned to clients (served by the API, not direct S3). */
export function publicUrlForKey(key: string): string {
  return `${UPLOADS_URL_PREFIX}${key.replace(/\\/g, '/')}`;
}

/** Normalize storage keys, legacy S3 URLs, or absolute URLs to the API proxy path. */
export function toPublicAssetUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(UPLOADS_URL_PREFIX)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.includes('.amazonaws.com/')) {
      try {
        const key = new URL(trimmed).pathname.replace(/^\//, '');
        if (key) return publicUrlForKey(key);
      } catch {
        /* fall through */
      }
    }
    return trimmed;
  }
  if (trimmed.startsWith('data:')) return trimmed;
  // Bare storage key (e.g. expenses/…/file.png) stored before public URL normalization.
  const key = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  if (key && !key.includes('://')) {
    return publicUrlForKey(key);
  }
  return trimmed;
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
