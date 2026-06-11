import { addDays, addMinutes, isBefore, isAfter } from 'date-fns';

export type AvailabilityRule = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type SlotWindow = {
  startAt: Date;
  endAt: Date;
};

/** Offer slots on the hour and half-hour only. */
const SLOT_INTERVAL_MIN = 30;

/** YYYY-MM-DD in a given IANA timezone. */
export function dateKeyInTimezone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Day of week (0=Sun … 6=Sat) for a calendar date in a timezone. */
export function dayOfWeekInTimezone(dateKey: string, timeZone: string): number {
  const noonUtc = zonedLocalToUtc(dateKey, 12 * 60, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(noonUtc);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekday] ?? 0;
}

/**
 * Convert a local calendar date + minutes-from-midnight in `timeZone` to UTC.
 */
export function zonedLocalToUtc(dateKey: string, minutesFromMidnight: number, timeZone: string): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const [year, month, day] = dateKey.split('-').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, h, m, 0));

  const parts = getZonedParts(guess, timeZone);
  const desiredMinutes = h * 60 + m;
  const actualMinutes = parts.hour * 60 + parts.minute;
  const dayDelta =
    parts.year * 10000 + parts.month * 100 + parts.day -
    (year * 10000 + month * 100 + day);
  const diffMin = dayDelta * 24 * 60 + (actualMinutes - desiredMinutes);
  return addMinutes(guess, -diffMin);
}

function getZonedParts(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function generateSlotsForRange(params: {
  from: Date;
  to: Date;
  timeZone: string;
  rules: AvailabilityRule[];
  durationMin: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  booked: SlotWindow[];
}): SlotWindow[] {
  const {
    from,
    to,
    timeZone,
    rules,
    durationMin,
    minNoticeHours,
    maxDaysAhead,
    booked,
  } = params;

  const now = new Date();
  const minStart = addMinutes(now, minNoticeHours * 60);
  const maxEnd = addDays(now, maxDaysAhead);
  const rangeStart = isBefore(from, now) ? now : from;
  const rangeEnd = isAfter(to, maxEnd) ? maxEnd : to;

  const slots: SlotWindow[] = [];
  let cursorKey = dateKeyInTimezone(rangeStart, timeZone);
  const endKey = dateKeyInTimezone(rangeEnd, timeZone);
  let dayCursor = zonedLocalToUtc(cursorKey, 12 * 60, timeZone);

  while (cursorKey <= endKey) {
    const dow = dayOfWeekInTimezone(cursorKey, timeZone);
    const dayRules = rules.filter((r) => r.dayOfWeek === dow);

    for (const rule of dayRules) {
      let minute = snapMinuteToGrid(rule.startMinute);
      while (minute + durationMin <= rule.endMinute) {
        const startAt = zonedLocalToUtc(cursorKey, minute, timeZone);
        const endAt = addMinutes(startAt, durationMin);

        if (
          !isBefore(startAt, rangeStart) &&
          !isAfter(startAt, rangeEnd) &&
          !isBefore(startAt, minStart) &&
          !isAfter(startAt, maxEnd) &&
          !overlapsBooked(startAt, endAt, booked)
        ) {
          slots.push({ startAt, endAt });
        }

        minute += SLOT_INTERVAL_MIN;
      }
    }

    dayCursor = addDays(dayCursor, 1);
    const nextKey = dateKeyInTimezone(dayCursor, timeZone);
    if (nextKey <= cursorKey) break;
    cursorKey = nextKey;
    if (slots.length > 500) break;
  }

  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function snapMinuteToGrid(minutesFromMidnight: number): number {
  const remainder = minutesFromMidnight % SLOT_INTERVAL_MIN;
  if (remainder === 0) return minutesFromMidnight;
  return minutesFromMidnight + (SLOT_INTERVAL_MIN - remainder);
}

function overlapsBooked(startAt: Date, endAt: Date, booked: SlotWindow[]): boolean {
  return booked.some((b) => startAt < b.endAt && endAt > b.startAt);
}

export function formatSlotLabel(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
