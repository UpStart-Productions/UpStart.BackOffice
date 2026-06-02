/** Local calendar date key (YYYY-MM-DD). */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sunday-start week containing `anchor`. */
export function startOfWeek(anchor: Date): Date {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

/** End of week day (Saturday 23:59:59.999) for API `to` query. */
export function endOfWeek(weekStart: Date): Date {
  const end = addDays(weekStart, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const y = end.getFullYear() !== weekStart.getFullYear()
    ? { year: 'numeric' as const }
    : {};
  return `${weekStart.toLocaleDateString('en-US', { ...opts, ...y })} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

/** Parse Harvest-style hour input: `2`, `2.5`, `2:30`. */
export function parseHoursInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const [h, m] = s.split(':');
    const hours = Number(h);
    const mins = Number(m ?? 0);
    if (Number.isNaN(hours) || Number.isNaN(mins)) return null;
    return hours + mins / 60;
  }
  const n = Number(s);
  return Number.isNaN(n) || n < 0 ? null : n;
}

/** Display hours in timesheet cells (decimal, trim trailing zeros). */
export function formatCellHours(hours: number): string {
  if (hours <= 0) return '';
  const rounded = Math.round(hours * 100) / 100;
  return String(rounded);
}

export function minutesToHours(min: number): number {
  return min / 60;
}

export function hoursToMinutes(h: number): number {
  return Math.round(h * 60);
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function dayLabel(d: Date): { short: string; dom: string } {
  return {
    short: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dom: String(d.getDate()),
  };
}
