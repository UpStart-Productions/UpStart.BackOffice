/** Date helpers for "last contact" and "next step due" on pipeline cards and lists. No stale timers: relationships can sit quietly. */
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days since the date, or null when there is none. Never negative. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS));
}

/** "Today", "1 day ago", "9 days ago", or "No contact yet". */
export function lastContactLabel(iso: string | null | undefined, now: Date = new Date()): string {
  const days = daysSince(iso, now);
  if (days === null) return 'No contact yet';
  if (days === 0) return 'Today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** True when the next-step date is before today. */
export function isOverdue(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  return !Number.isNaN(due.getTime()) && startOfDay(due) < startOfDay(now);
}
