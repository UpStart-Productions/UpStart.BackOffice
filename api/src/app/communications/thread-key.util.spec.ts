import { describe, expect, it } from 'vitest';
import { computeThreadKey, normalizeSubject } from './thread-key.util';

describe('normalizeSubject', () => {
  it('strips stacked Re:/Fwd: prefixes', () => {
    expect(normalizeSubject('RE: Fwd: re:  Schedule   for next week ')).toBe('schedule for next week');
  });
});

describe('computeThreadKey', () => {
  it('uses the root of the References chain first', () => {
    expect(computeThreadKey({ messageId: 'c', inReplyTo: 'b', references: ['a', 'b'] })).toBe('mid:a');
  });
  it('then In-Reply-To, then the message id', () => {
    expect(computeThreadKey({ messageId: 'c', inReplyTo: 'b', references: [] })).toBe('mid:b');
    expect(computeThreadKey({ messageId: 'c' })).toBe('mid:c');
  });
  it('falls back to the normalized subject, then null', () => {
    expect(computeThreadKey({ subject: 'Re: Hello' })).toBe('subj:hello');
    expect(computeThreadKey({})).toBeNull();
  });
});
