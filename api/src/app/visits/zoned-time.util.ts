/**
 * Local wall-clock times in an IANA time zone <-> UTC, without a time zone library.
 * Used for weekly shift series: "Mon 09:00 in America/Los_Angeles" stays 9 AM across daylight saving.
 */

/** Offset (minutes) of `timeZone` from UTC at the given instant. */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant for local date "YYYY-MM-DD" and time "HH:mm" in `timeZone`. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - offsetMinutes(timeZone, new Date(guess)) * 60000;
  // Second pass settles times near a daylight-saving change.
  ts = guess - offsetMinutes(timeZone, new Date(ts)) * 60000;
  return new Date(ts);
}

/** Local "YYYY-MM-DD" of an instant in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** "YYYY-MM-DD" plus n days (calendar arithmetic, no time zone involved). */
export function addDaysToDate(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Start and end instants of a shift; an end at or before the start runs past midnight. */
export function shiftInstants(date: string, startTime: string, endTime: string, timeZone: string): { startAt: Date; endAt: Date } {
  const startAt = zonedToUtc(date, startTime, timeZone);
  const endDate = endTime <= startTime ? addDaysToDate(date, 1) : date;
  return { startAt, endAt: zonedToUtc(endDate, endTime, timeZone) };
}

/** "Tue, Nov 3, 9:00 AM" in the shift's time zone. */
export function formatShiftStart(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}
