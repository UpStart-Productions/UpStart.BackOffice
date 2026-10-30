import type { CorsOptions, CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Public form addresses that any website may call from a browser (embeds and sites that draw forms themselves).
 * They need no sign-in and no cookies: the link or result token is the key, and each link can limit which
 * websites may show it (FormLink.allowedOrigins, checked by FormPublicService). Everything else keeps the app's CORS rules.
 */
const PUBLIC_FORM_PATHS = ['/api/form-links/', '/api/care-links/', '/api/form-results/', '/api/form-embed.js'];

const PUBLIC_FORM_CORS: CorsOptions = {
  origin: true,
  credentials: false,
  allowedHeaders: ['content-type', 'accept', 'x-form-access', 'x-care-access'],
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600,
};

export function isPublicFormPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0];
  return PUBLIC_FORM_PATHS.some((p) => path.startsWith(p));
}

/** The app's CORS options, except on public form addresses. */
export function publicFormsCors(options: CorsOptions): CorsOptionsDelegate<{ url?: string; originalUrl?: string }> {
  return (req, callback) => callback(null, isPublicFormPath(req.originalUrl ?? req.url) ? PUBLIC_FORM_CORS : options);
}
