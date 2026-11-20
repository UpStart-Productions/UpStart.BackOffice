import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToPlainText, parseRawEmail } from './email-parse.util';
import { stripQuotedText } from './quoted-text.util';
import { collectParticipants, detectCapturer, directionOf, splitParticipants } from './participants.util';
import { computeThreadKey } from './thread-key.util';

const fixture = (name: string) => readFileSync(path.join(__dirname, '__fixtures__', name));
const internal = new Set(['lori@example-tpn.test', 'judy@example-tpn.test']);
const isInternal = (e: string) => internal.has(e);
const ignore = new Set(['tpn@in.example.test']);

describe('parseRawEmail', () => {
  it('parses headers, addresses and the forwarding mailbox', async () => {
    const p = await parseRawEmail(fixture('client-reply-forwarded.eml'));
    expect(p.messageId).toBe('reply-1@familyclient.test');
    expect(p.inReplyTo).toBe('orig-1@example-tpn.test');
    expect(p.references).toEqual(['orig-1@example-tpn.test']);
    expect(p.from).toEqual({ email: 'sally@familyclient.test', name: 'Sally Marlow' });
    expect(p.to.map((a) => a.email)).toEqual(['lori@example-tpn.test']);
    expect(p.forwardedFor).toBe('lori@example-tpn.test');
    expect(p.text).toContain('Tuesday works');
    expect(p.date?.toISOString()).toBe('2026-10-13T22:04:00.000Z');
  });
  it('captures CC', async () => {
    const p = await parseRawEmail(fixture('outbound-bcc.eml'));
    expect(p.cc.map((a) => a.email)).toEqual(['judy@example-tpn.test']);
  });
});

describe('HTML-only email (Apple Mail / iPhone)', () => {
  it('builds the body from the HTML part when there is no text part', async () => {
    const p = await parseRawEmail(fixture('apple-html-only-inline-image.eml'));
    expect(p.hasHtml).toBe(true);
    expect(p.text).toContain('Department and Category lists are redundant');
    expect(p.text).not.toContain('<div');
  });
  it('separates the new text from the signature and quoted history', async () => {
    const p = await parseRawEmail(fixture('apple-html-only-inline-image.eml'));
    const { body, quoted } = stripQuotedText(p.text);
    expect(quoted).toBe(true);
    expect(body).toContain('we only need one');
    expect(body).not.toContain('Sent from');
    expect(body).not.toContain('Onboarding is ready to test');
  });
  it('keeps an inline screenshot from the new text and drops small/quoted inline images', async () => {
    const p = await parseRawEmail(fixture('apple-html-only-inline-image.eml'));
    expect(p.attachments.map((a) => a.filename)).toEqual(['image0.png']);
    expect(p.attachments[0].contentType).toBe('image/png');
  });
});

describe('threading across a conversation', () => {
  it('gives the outbound message and its reply the same thread key', async () => {
    const out = await parseRawEmail(fixture('outbound-bcc.eml'));
    const reply = await parseRawEmail(fixture('client-reply-forwarded.eml'));
    expect(computeThreadKey(out)).toBe('mid:orig-1@example-tpn.test');
    expect(computeThreadKey(reply)).toBe('mid:orig-1@example-tpn.test');
  });
});

describe('participants', () => {
  it('splits inbound mail into team and outsiders and detects the forwarder', async () => {
    const p = await parseRawEmail(fixture('client-reply-forwarded.eml'));
    const { internal: team, external } = splitParticipants(collectParticipants(p), isInternal, ignore);
    expect(team.map((x) => x.email)).toEqual(['lori@example-tpn.test']);
    expect(external.map((x) => x.email)).toEqual(['sally@familyclient.test']);
    expect(directionOf(isInternal(p.from!.email), external.length > 0)).toBe('INBOUND');
    expect(detectCapturer(p, ignore, isInternal)).toBe('lori@example-tpn.test');
  });
  it('treats a team-sent message with no forward header as a BCC capture by the sender', async () => {
    const p = await parseRawEmail(fixture('outbound-bcc.eml'));
    const { external } = splitParticipants(collectParticipants(p), isInternal, ignore);
    expect(external.map((x) => x.email)).toEqual(['sally@familyclient.test']);
    expect(directionOf(isInternal(p.from!.email), true)).toBe('OUTBOUND');
    expect(detectCapturer(p, ignore, isInternal)).toBe('lori@example-tpn.test');
  });
  it('finds no outsiders in partner-to-partner mail', async () => {
    const p = await parseRawEmail(fixture('internal-only.eml'));
    expect(splitParticipants(collectParticipants(p), isInternal, ignore).external).toEqual([]);
  });
});

describe('htmlToPlainText', () => {
  it('renders Gmail quoted history as "> " lines', () => {
    const t = htmlToPlainText(
      '<div dir="ltr">Looks good, ship it.</div><br><div class="gmail_quote"><div class="gmail_attr">On Tue, Nov 17, 2026 at 9:00 AM Jeff &lt;j@x.test&gt; wrote:<br></div><blockquote class="gmail_quote">Ready?</blockquote></div>',
    );
    expect(t?.startsWith('Looks good, ship it.')).toBe(true);
    expect(stripQuotedText(t).body).toBe('Looks good, ship it.');
  });
  it('returns null for HTML with no visible text', () => {
    expect(htmlToPlainText('<html><body><img src="cid:a"></body></html>')).toBeNull();
  });
});
