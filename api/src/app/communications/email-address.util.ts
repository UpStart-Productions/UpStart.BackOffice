const EMAIL_RE = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** Lowercase, trim, strip angle brackets. Returns null if the value isn't an email address. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^<|>$/g, '').trim().toLowerCase();
  return EMAIL_RE.test(value) ? value : null;
}

/** Best-effort first/last name from a header display name, falling back to the address local part. */
export function splitName(
  displayName: string | null | undefined,
  email: string,
): { firstName: string; lastName?: string } {
  const name = (displayName ?? '').replace(/["']/g, '').trim();
  if (name && !name.includes('@')) {
    const parts = name.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
  const local = email.split('@')[0] ?? email;
  const words = local.split(/[._+-]+/).filter(Boolean);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  if (words.length === 0) return { firstName: email };
  if (words.length === 1) return { firstName: cap(words[0]) };
  return { firstName: cap(words[0]), lastName: words.slice(1).map(cap).join(' ') };
}

/**
 * Extract the tenant alias (local part) from the SES envelope recipients.
 * When `domain` is set only that domain matches; when empty (local dev) any domain does.
 */
export function extractAliasFromRecipients(
  recipients: string[],
  domain?: string | null,
): string | null {
  const wanted = domain?.trim().toLowerCase();
  for (const recipient of recipients) {
    const email = normalizeEmail(recipient);
    if (!email) continue;
    const at = email.lastIndexOf('@');
    const local = email.slice(0, at);
    const dom = email.slice(at + 1);
    if (local && (!wanted || dom === wanted)) return local;
  }
  return null;
}
