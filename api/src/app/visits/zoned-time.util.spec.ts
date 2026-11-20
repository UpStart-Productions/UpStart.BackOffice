import { describe, expect, it } from 'vitest';
import { addDaysToDate, localDate, shiftInstants, weekdayOf, zonedToUtc } from './zoned-time.util';

describe('zoned time', () => {
  it('converts local wall time to UTC across daylight saving', () => {
    expect(zonedToUtc('2026-07-01', '09:00', 'America/Los_Angeles').toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'America/Los_Angeles').toISOString()).toBe('2026-12-01T17:00:00.000Z');
  });

  it('runs an overnight shift into the next day', () => {
    const { startAt, endAt } = shiftInstants('2026-12-01', '22:00', '06:00', 'America/Los_Angeles');
    expect((endAt.getTime() - startAt.getTime()) / 3600000).toBe(8);
  });

  it('does calendar math on plain dates', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(localDate(new Date('2026-12-02T05:00:00Z'), 'America/Los_Angeles')).toBe('2026-12-01');
  });
});
