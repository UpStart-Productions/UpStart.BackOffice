import { describe, expect, it } from 'vitest';
import { describeRecurrence, nextDueDate, normalizeRecurrence } from './task-recurrence.util';
import { orderBetween, renumber } from './task-order.util';
import { extractMentionedUserIds, htmlToPlainText } from './task-mentions.util';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('normalizeRecurrence', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeRecurrence(null)).toBeNull();
    expect(normalizeRecurrence(undefined)).toBeNull();
  });
  it('defaults interval and mode', () => {
    expect(normalizeRecurrence({ freq: 'DAILY' })).toEqual({ freq: 'DAILY', interval: 1, mode: 'ON_COMPLETE' });
  });
  it('rejects bad input', () => {
    expect(() => normalizeRecurrence({ freq: 'HOURLY' })).toThrow();
    expect(() => normalizeRecurrence({ freq: 'DAILY', interval: 0 })).toThrow();
    expect(() => normalizeRecurrence('weekly')).toThrow();
  });
  it('sorts and dedupes weekdays, ignores out-of-range', () => {
    expect(normalizeRecurrence({ freq: 'WEEKLY', weekdays: [5, 1, 1, 9] })?.weekdays).toEqual([1, 5]);
  });
});

describe('nextDueDate', () => {
  it('daily on schedule counts from due date', () => {
    const r = normalizeRecurrence({ freq: 'DAILY', interval: 2, mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(r, d('2026-10-01'), d('2026-10-06')))).toBe('2026-10-03');
  });
  it('daily on complete counts from completion', () => {
    const r = normalizeRecurrence({ freq: 'DAILY' })!;
    expect(iso(nextDueDate(r, d('2026-10-01'), d('2026-10-06')))).toBe('2026-10-07');
  });
  it('on schedule without due date falls back to completion date', () => {
    const r = normalizeRecurrence({ freq: 'WEEKLY', mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(r, null, d('2026-10-06')))).toBe('2026-10-13');
  });
  it('weekly with weekdays picks the next listed day in the same week', () => {
    // 2026-10-06 is a Tuesday (2). Mon/Wed/Fri → Wednesday.
    const r = normalizeRecurrence({ freq: 'WEEKLY', weekdays: [1, 3, 5], mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(r, d('2026-10-06'), d('2026-10-06')))).toBe('2026-10-07');
  });
  it('weekly with weekdays wraps to next week (interval aware)', () => {
    // Friday 2026-10-09, Mon only, every 2 weeks → Monday 2026-10-19
    const r = normalizeRecurrence({ freq: 'WEEKLY', interval: 2, weekdays: [1], mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(r, d('2026-10-09'), d('2026-10-09')))).toBe('2026-10-19');
    const weekly = normalizeRecurrence({ freq: 'WEEKLY', weekdays: [1], mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(weekly, d('2026-10-09'), d('2026-10-09')))).toBe('2026-10-12');
  });
  it('monthly clamps to end of month', () => {
    const r = normalizeRecurrence({ freq: 'MONTHLY', mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(r, d('2026-01-31'), d('2026-01-31')))).toBe('2026-02-28');
  });
  it('yearly', () => {
    const r = normalizeRecurrence({ freq: 'YEARLY', mode: 'ON_SCHEDULE' })!;
    expect(iso(nextDueDate(r, d('2028-02-29'), d('2028-02-29')))).toBe('2029-02-28');
  });
  it('describes rules', () => {
    expect(describeRecurrence(null)).toBe('Does not repeat');
    expect(describeRecurrence(normalizeRecurrence({ freq: 'WEEKLY', weekdays: [1, 3] }))).toBe('Every week on Mon, Wed after completion');
    expect(describeRecurrence(normalizeRecurrence({ freq: 'MONTHLY', interval: 3, mode: 'ON_SCHEDULE' }))).toBe('Every 3 months');
  });
});

describe('orderBetween', () => {
  it('handles edges', () => {
    expect(orderBetween(null, null)).toBe(1024);
    expect(orderBetween(null, 1024)).toBe(0);
    expect(orderBetween(2048, null)).toBe(3072);
  });
  it('returns midpoint', () => {
    expect(orderBetween(1024, 2048)).toBe(1536);
  });
  it('returns null when gap exhausted', () => {
    expect(orderBetween(1, 1)).toBeNull();
    expect(orderBetween(1, 1 + 1e-9)).toBeNull();
  });
  it('renumbers', () => {
    expect(renumber([{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a', sortOrder: 1024 },
      { id: 'b', sortOrder: 2048 },
    ]);
  });
});

describe('mentions', () => {
  it('extracts unique user ids from quill-mention spans', () => {
    const html =
      '<p>Hi <span class="mention" data-index="0" data-denotation-char="@" data-id="u1" data-value="Jeff">@Jeff</span> and ' +
      '<span class="mention" data-id="u2" data-value="Brynne">@Brynne</span> ' +
      '<span class="mention" data-id="u1" data-value="Jeff">@Jeff</span></p>';
    expect(extractMentionedUserIds(html)).toEqual(['u1', 'u2']);
  });
  it('ignores non-user mention types', () => {
    expect(extractMentionedUserIds('<span class="mention" data-mention-type="task" data-id="t1">x</span>')).toEqual([]);
  });
  it('converts html to text', () => {
    expect(htmlToPlainText('<p>Hello&nbsp;<b>world</b></p><p>Next</p>')).toBe('Hello world\nNext');
    expect(htmlToPlainText('<p>abcdefghij</p>', 5)).toBe('abcd…');
  });
});

import { coerceFieldValue, normalizeOptions } from './task-fields.util';

describe('custom fields', () => {
  const opts = normalizeOptions([{ id: 'a', label: ' High ' }, { label: 'Low', color: 'green' }, { label: '  ' }]);
  it('normalizes options', () => {
    expect(opts).toHaveLength(2);
    expect(opts[0]).toMatchObject({ id: 'a', label: 'High', color: 'blue' });
    expect(opts[1].id).toBeTruthy();
    expect(opts[1].color).toBe('green');
  });
  it('coerces values by type', () => {
    expect(coerceFieldValue('TEXT', [], 'hi')).toBe('hi');
    expect(coerceFieldValue('NUMBER', [], '3.5')).toBe(3.5);
    expect(() => coerceFieldValue('NUMBER', [], 'x')).toThrow();
    expect(coerceFieldValue('DATE', [], '2026-10-06T12:00:00Z')).toBe('2026-10-06');
    expect(() => coerceFieldValue('DATE', [], 'tomorrow')).toThrow();
    expect(coerceFieldValue('CHECKBOX', [], false)).toBeNull();
    expect(coerceFieldValue('SINGLE_SELECT', opts, 'a')).toBe('a');
    expect(() => coerceFieldValue('SINGLE_SELECT', opts, 'zzz')).toThrow();
    expect(coerceFieldValue('MULTI_SELECT', opts, ['a', 'a'])).toEqual(['a']);
    expect(coerceFieldValue('MULTI_SELECT', opts, [])).toBeNull();
    expect(coerceFieldValue('TEXT', [], '')).toBeNull();
  });
});
