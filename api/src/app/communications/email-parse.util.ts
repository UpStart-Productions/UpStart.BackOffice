import { convert } from 'html-to-text';
import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from 'mailparser';
import { normalizeEmail } from './email-address.util';

export interface ParsedAddress {
  email: string;
  name?: string;
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
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
  /**
   * Plain-text body. Uses the text/plain part when it has content; otherwise it is built from the
   * HTML part (Apple Mail, iPhone replies with images and many senders send HTML only).
   * Quoted history is rendered as "> " lines so stripQuotedText can separate it.
   */
  text: string | null;
  hasHtml: boolean;
  attachmentCount: number;
  /**
   * Real attachments plus inline images that belong to the new message (pasted screenshots,
   * photos). Inline images that only appear in quoted history or a marked signature, and tiny
   * inline images (logos, social icons), are left out.
   */
  attachments: ParsedAttachment[];
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

/** Inline images smaller than this are treated as logos/icons, not content. */
const MIN_INLINE_IMAGE_BYTES = 10 * 1024;

/** Turn an HTML body into readable text; quoted history becomes "> " lines. */
export function htmlToPlainText(html: string): string | null {
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'style', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'head', format: 'skip' },
      // Gmail wraps quoted history in div.gmail_quote rather than (only) a blockquote.
      { selector: 'div.gmail_quote', format: 'blockquote', options: { trimEmptyLines: true } },
    ],
  });
  const clean = text.replace(/\u00a0/g, ' ').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return clean || null;
}

/** The HTML with quoted history and marked signatures removed: what the sender actually wrote. */
function newPartOfHtml(html: string): string {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i, '')
    .replace(/<div[^>]*class="[^"]*gmail_signature[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi, '');
}

function keepAttachment(a: Attachment, newHtml: string): boolean {
  if (!a.content?.length) return false;
  if (!a.related) return true;
  // Inline part: keep it only if the new text shows it and it is big enough to be content.
  if ((a.size ?? a.content.length) < MIN_INLINE_IMAGE_BYTES) return false;
  if (!a.cid) return true; // inline but unreferenced: better to keep than lose it
  const cid = a.cid.replace(/^<|>$/g, '').toLowerCase();
  return newHtml.toLowerCase().includes(`cid:${cid}`);
}

export async function parseRawEmail(raw: Buffer): Promise<ParsedEmail> {
  // keepCidLinks: leave cid: references in the HTML so inline images can be matched to the text.
  const parsed = await simpleParser(raw, { keepCidLinks: true });

  const refs = parsed.references;
  const references = (Array.isArray(refs) ? refs : refs ? [refs] : [])
    .flatMap((r) => r.split(/\s+/))
    .map(stripBrackets)
    .filter(Boolean);

  const html = typeof parsed.html === 'string' ? parsed.html : '';
  const text = parsed.text?.trim() || (html ? htmlToPlainText(html) : null);
  const newHtml = newPartOfHtml(html);

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
    text,
    hasHtml: !!html,
    attachmentCount: parsed.attachments?.length ?? 0,
    attachments: (parsed.attachments ?? [])
      .filter((a) => keepAttachment(a, newHtml))
      .map((a, i) => ({
        filename: a.filename?.trim() || `attachment-${i + 1}`,
        contentType: a.contentType || 'application/octet-stream',
        size: a.size ?? a.content.length,
        content: a.content,
      })),
    forwardedFor,
  };
}
