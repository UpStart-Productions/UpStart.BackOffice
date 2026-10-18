import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRawEmail } from './email-parse.util';
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
