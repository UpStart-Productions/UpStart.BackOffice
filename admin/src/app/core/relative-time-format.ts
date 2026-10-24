const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function epochMs(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 946684800000 ? value : value * 1000;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const t = Date.parse(trimmed);
  return Number.isNaN(t) ? null : t;
}

/** Relative time for notification timestamps in the bell feed. */
export function formatRelativeTime(value: unknown, nowMs?: number): string {
  const thenMs = epochMs(value);
  if (thenMs === null) return '—';

  const anchor = typeof nowMs === 'number' ? nowMs : Date.now();
  const diffMs = Math.max(0, anchor - thenMs);

  const diffMins = Math.floor(diffMs / MS_MINUTE);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMs / MS_HOUR);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDaysElapsed = Math.floor(diffMs / MS_DAY);
  if (diffDaysElapsed >= 7) {
    const d = new Date(thenMs);
    return `${MONTH_SHORT[d.getMonth()] ?? ''} ${d.getDate()}`;
  }
  if (diffDaysElapsed === 1) return 'Yesterday';
  return `${diffDaysElapsed} days ago`;
}
