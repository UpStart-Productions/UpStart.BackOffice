import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import { normalizeEmail } from './email-address.util';

export interface ParsedAddress {
  email: string;
  name?: string;
}

export interface ParsedEmail {
  /** Message-ID without angle brackets. */
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string | null;
  date: Date | null;
  from: ParsedAddress | null;
  to: ParsedAddress[];
  cc: ParsedAddress[];
  /** Plain-text body (mailparser derives it from HTML when there is no text part). */
  text: string | null;
  hasHtml: boolean;
  attachmentCount: number;
  /**
   * Mailbox that auto-forwarded this message to us, from Gmail's X-Forwarded-For header
   * (first address). ASSUMPTION: Gmail filter forwards set this; verify with a real sample.
   */
  forwardedFor: string | null;
}

function stripBrackets(id: string): string {
  return id.trim().replace(/^<|>$/g, '').trim();
}

function flattenAddresses(field: AddressObject | AddressObject[] | undefined): ParsedAddress[] {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];
  const out: ParsedAddress[] = [];
  for (const obj of objects) {
    for (const v of obj.value ?? []) {
      const email = normalizeEmail(v.address);
      if (email) out.push({ email, ...(v.name ? { name: v.name } : {}) });
    }
  }
  return out;
}

function headerString(parsed: ParsedMail, name: string): string | null {
  const value = parsed.headers.get(name);
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export async function parseRawEmail(raw: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(raw);

  const refs = parsed.references;
  const references = (Array.isArray(refs) ? refs : refs ? [refs] : [])
    .flatMap((r) => r.split(/\s+/))
    .map(stripBrackets)
    .filter(Boolean);

  const forwardedHeader = headerString(parsed, 'x-forwarded-for');
  const forwardedFor =
    forwardedHeader
      ?.split(/[\s,]+/)
      .map((p) => normalizeEmail(p))
      .find((p): p is string => !!p) ?? null;

  return {
    messageId: parsed.messageId ? stripBrackets(parsed.messageId) : null,
    inReplyTo: parsed.inReplyTo ? stripBrackets(parsed.inReplyTo) : null,
    references,
    subject: parsed.subject ?? null,
    date: parsed.date ?? null,
    from: flattenAddresses(parsed.from)[0] ?? null,
    to: flattenAddresses(parsed.to),
    cc: flattenAddresses(parsed.cc),
    text: parsed.text?.trim() || null,
    hasHtml: !!parsed.html,
    attachmentCount: parsed.attachments?.length ?? 0,
    forwardedFor,
  };
}
