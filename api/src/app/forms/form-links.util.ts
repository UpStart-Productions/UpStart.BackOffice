import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'crypto';
import type { FormLinkDto, FormLinkKind, FormLinkVerify } from '@upstart/back-office/shared';
import { adminAppBaseUrl } from '../notifications/notification-delivery.service';

export const newLinkToken = () => randomBytes(24).toString('base64url');
export const newAccessToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Six-digit emailed code. */
export const newEmailCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(passcode, salt, 32).toString('hex')}`;
}

export function checkPasscode(passcode: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(passcode, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** j•••@example.com */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return null;
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** Public page for a link. Care's forms keep their /care-form/ address (links already sent out still work). */
export function formLinkUrl(module: string, token: string): string {
  return module === 'care' ? `${adminAppBaseUrl()}/care-form/${token}` : `${adminAppBaseUrl()}/form/${token}`;
}

type LinkRow = {
  id: string; formId: string; kind: FormLinkKind; label: string | null; clientId: string | null;
  verify: FormLinkVerify; email: string | null; expiresAt: Date | null; revokedAt: Date | null;
  lastUsedAt: Date | null; createdAt: Date; token: string; client?: { name: string } | null; form: { module: string };
  allowedOrigins: string[];
};

export function linkView(l: LinkRow): FormLinkDto {
  return {
    id: l.id,
    formId: l.formId,
    kind: l.kind,
    label: l.label,
    clientId: l.clientId,
    clientName: l.client?.name ?? null,
    verify: l.verify,
    email: l.email,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    revokedAt: l.revokedAt?.toISOString() ?? null,
    lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    url: formLinkUrl(l.form.module, l.token),
    allowedOrigins: l.allowedOrigins ?? [],
  };
}

export const LINK_INCLUDE = { client: { select: { name: true } }, form: { select: { module: true } } } as const;
