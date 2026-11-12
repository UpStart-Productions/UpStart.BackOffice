/** Secondary line when a person has no email. */
export const NO_EMAIL_LABEL = 'No email on file';

/** "First Last" for every picker row; falls back to the display name, then the email. */
export function personPickName(p: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  const full = [p.firstName?.trim(), p.lastName?.trim()].filter(Boolean).join(' ');
  return full || p.name?.trim() || p.email?.trim() || '';
}

/** Email for the secondary line, or the no-email label. */
export function personPickSubtitle(email: string | null | undefined): string {
  return email?.trim() || NO_EMAIL_LABEL;
}
