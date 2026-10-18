/** Strip leading Re:/Fwd:/Fw: prefixes and collapse whitespace, lowercase. */
export function normalizeSubject(subject: string | null | undefined): string {
  let s = (subject ?? '').trim();
  const prefix = /^(re|fwd?)\s*:\s*/i;
  while (prefix.test(s)) s = s.replace(prefix, '');
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Stable key shared by every message in a conversation.
 * Prefers the root of the References chain, then In-Reply-To, then the message's own id,
 * and only falls back to the normalized subject when there are no ids at all.
 */
export function computeThreadKey(input: {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
}): string | null {
  const root = input.references?.[0] || input.inReplyTo || input.messageId;
  if (root) return `mid:${root}`;
  const subject = normalizeSubject(input.subject);
  return subject ? `subj:${subject}` : null;
}
