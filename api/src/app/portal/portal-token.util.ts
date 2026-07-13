import { randomBytes } from 'crypto';

export function generatePortalToken(): string {
  return randomBytes(32).toString('base64url');
}

export function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL ?? 'http://localhost:4321/clients').replace(/\/$/, '');
}

export function buildPortalUrl(token: string): string {
  const base = portalBaseUrl();
  const params = new URLSearchParams({ token });
  return `${base}?${params.toString()}`;
}

export function readRequestCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
