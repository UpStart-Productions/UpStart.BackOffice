import { randomBytes } from 'crypto';

export function generatePortalToken(): string {
  return randomBytes(32).toString('base64url');
}

export function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL ?? 'https://heyupstart.com/clients').replace(/\/$/, '');
}

export function buildPortalUrl(token: string): string {
  return `${portalBaseUrl()}/${token}`;
}

export function readRequestCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
