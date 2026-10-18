import type { ParsedEmail } from './email-parse.util';

export type ParticipantRoleName = 'FROM' | 'TO' | 'CC';

export interface Participant {
  email: string;
  name?: string;
  role: ParticipantRoleName;
}

/** Everyone on the visible headers (From/To/Cc), de-duplicated per address+role. */
export function collectParticipants(parsed: ParsedEmail): Participant[] {
  const out: Participant[] = [];
  const seen = new Set<string>();
  const add = (role: ParticipantRoleName, a?: { email: string; name?: string } | null) => {
    if (!a) return;
    const key = `${role}:${a.email}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ email: a.email, name: a.name, role });
  };
  add('FROM', parsed.from);
  parsed.to.forEach((a) => add('TO', a));
  parsed.cc.forEach((a) => add('CC', a));
  return out;
}

export interface ExternalSplit {
  internal: Participant[];
  external: Participant[];
}

/**
 * Split participants into our team and outsiders. `ignore` holds addresses that are neither
 * (the tenant's own capture alias, which appears in To/Cc when someone CCs it).
 */
export function splitParticipants(
  participants: Participant[],
  isInternal: (email: string) => boolean,
  ignore: Set<string>,
): ExternalSplit {
  const internal: Participant[] = [];
  const external: Participant[] = [];
  for (const p of participants) {
    if (ignore.has(p.email)) continue;
    (isInternal(p.email) ? internal : external).push(p);
  }
  return { internal, external };
}

export function directionOf(
  fromIsInternal: boolean,
  hasExternal: boolean,
): 'INBOUND' | 'OUTBOUND' | 'INTERNAL' {
  if (!hasExternal) return 'INTERNAL';
  return fromIsInternal ? 'OUTBOUND' : 'INBOUND';
}

/**
 * Who put this message into the system?
 *  1. Gmail auto-forward: the X-Forwarded-For mailbox.
 *  2. BCC/CC to the alias by a team member: the From address, if it is a team address.
 * Returns null when neither applies.
 */
export function detectCapturer(
  parsed: ParsedEmail,
  ignore: Set<string>,
  isInternal: (email: string) => boolean,
): string | null {
  if (parsed.forwardedFor && !ignore.has(parsed.forwardedFor)) return parsed.forwardedFor;
  const from = parsed.from?.email;
  if (from && isInternal(from)) return from;
  return null;
}
