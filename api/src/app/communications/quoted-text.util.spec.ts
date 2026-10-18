import { describe, expect, it } from 'vitest';
import { stripQuotedText } from './quoted-text.util';

describe('stripQuotedText', () => {
  it('cuts Gmail-style attribution and quote', () => {
    const t = 'Tuesday works.\n\nOn Tue, Oct 13, 2026 at 10:30 AM Lori <lori@x.test> wrote:\n> Here is the schedule.\n';
    expect(stripQuotedText(t)).toEqual({ body: 'Tuesday works.', quoted: true });
  });

  it('handles an attribution wrapped onto two lines', () => {
    const t = 'Yes.\nOn Tue, Oct 13, 2026 at 10:30 AM Lori Example <\nlori@x.test> wrote:\n> old';
    expect(stripQuotedText(t).body).toBe('Yes.');
  });

  it('cuts Outlook "Original Message" and From/Sent header blocks', () => {
    expect(stripQuotedText('Thanks!\n-----Original Message-----\nFrom: A\nSent: B\n\nold').body).toBe('Thanks!');
    expect(stripQuotedText('Got it.\n\nFrom: Lori <l@x.test>\nSent: Tuesday, October 13, 2026 10:30 AM\nTo: Sally\nSubject: Re: x\n\nold').body).toBe('Got it.');
    expect(stripQuotedText('Ok\n________________________________\nFrom: Lori\nSent: today\nold').body).toBe('Ok');
  });

  it('cuts a trailing block of > lines but keeps inline quotes', () => {
    expect(stripQuotedText('New text\n> old 1\n>\n> old 2').body).toBe('New text');
    const inline = 'You said:\n> can we move it?\nYes, Friday works.';
    expect(stripQuotedText(inline)).toEqual({ body: inline, quoted: false });
  });

  it('keeps forwarded messages and plain text untouched', () => {
    const fwd = 'FYI\n\n---------- Forwarded message ---------\nFrom: Sally <s@x.test>\nDate: Tue\nSubject: hi\n\nbody';
    // A forward's header block is real content the sender wants logged.
    expect(stripQuotedText('Just a note.').quoted).toBe(false);
    expect(stripQuotedText(fwd)).toEqual({ body: fwd, quoted: false });
    const apple = 'See below\n\nBegin forwarded message:\n\nFrom: Sally <s@x.test>\nDate: Tue\n\nbody';
    expect(stripQuotedText(apple)).toEqual({ body: apple, quoted: false });
  });

  it('never returns an empty body', () => {
    const allQuote = 'On Tue, Oct 13, 2026 at 10:30 AM Lori <l@x.test> wrote:\n> everything';
    expect(stripQuotedText(allQuote)).toEqual({ body: allQuote, quoted: false });
    expect(stripQuotedText(null)).toEqual({ body: null, quoted: false });
  });
});
