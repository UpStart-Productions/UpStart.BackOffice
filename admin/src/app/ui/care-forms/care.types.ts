/** Local "HH:mm" of a date. */
export function timeKey(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A local Date from "YYYY-MM-DD" + "HH:mm". */
export function atLocal(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** The browser's IANA time zone (sent with shifts so repeating ones keep their local time). */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
}

/** "2h 15m" */
export function formatDuration(min: number | null | undefined): string {
  if (min === null || min === undefined) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export { isEmptyValue, normalizeValues } from '../../core/form-values.util';
