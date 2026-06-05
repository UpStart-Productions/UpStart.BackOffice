import { environment } from '../../environments/environment';

/** API-relative upload paths for use in `<img src>` (admin and API are different origins in prod). */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/api/')) {
    const origin = environment.apiBaseUrl.replace(/\/api\/?$/, '');
    return `${origin}${url}`;
  }
  return url;
}
