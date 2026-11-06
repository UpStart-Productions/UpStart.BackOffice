import { environment } from '../../environments/environment';

const UPLOADS_URL_PREFIX = '/api/uploads/';

/** API-relative upload paths for use in `<img src>` (admin and API are different origins in prod). */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  let path = trimmed;
  if (!path.startsWith('/api/')) {
    const key = path.startsWith('/') ? path.slice(1) : path;
    if (key && !key.includes('://')) {
      path = `${UPLOADS_URL_PREFIX}${key.replace(/\\/g, '/')}`;
    }
  }
  if (path.startsWith('/api/')) {
    const origin = environment.apiBaseUrl.replace(/\/api\/?$/, '');
    return `${origin}${path}`;
  }
  return path;
}
