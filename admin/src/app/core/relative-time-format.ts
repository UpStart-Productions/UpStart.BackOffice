/**
 * Relative time for notifications (`formatRelativeTime`) and record attribution (`formatAttributionWhen`).
 */

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
const MS_WEEK = 7 * MS_DAY;
const MS_YEAR = 365 * MS_DAY;

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
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

function shortMonthDay(thenMs: number): string {
  const d = new Date(thenMs);
  const month = MONTH_SHORT[d.getMonth()] ?? '';
  return `${month} ${d.getDate()}`;
}

function clockLabel(thenMs: number): string {
  const d = new Date(thenMs);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

/** Notification bell: Just now · Nm ago · Yesterday · May 5 */
export function formatRelativeTime(value: unknown, nowMs?: number): string {
  const thenMs = epochMs(value);
  if (thenMs === null) return '—';
  const anchor = typeof nowMs === 'number' ? nowMs : Date.now();
  let diffMs = anchor - thenMs;
  if (diffMs < 0) diffMs = 0;

  const diffMins = Math.floor(diffMs / MS_MINUTE);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMs / MS_HOUR);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDaysElapsed = Math.floor(diffMs / MS_DAY);
  if (diffDaysElapsed >= 7) return shortMonthDay(thenMs);
  if (diffDaysElapsed === 1) return 'Yesterday';
  return `${diffDaysElapsed} days ago`;
}

/** Record history popover: "3 min ago", "on 9/13 at 4:31pm", etc. */
export function formatAttributionWhen(value: unknown, nowMs?: number): string | null {
  const thenMs = epochMs(value);
  if (thenMs === null) return null;
  const anchor = typeof nowMs === 'number' ? nowMs : Date.now();
  let diffMs = anchor - thenMs;
  if (diffMs < 0) diffMs = 0;

  if (diffMs >= MS_YEAR) {
    const d = new Date(thenMs);
    return `on ${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} at ${clockLabel(thenMs)}`;
  }
  if (diffMs >= MS_WEEK) {
    const d = new Date(thenMs);
    return `on ${d.getMonth() + 1}/${d.getDate()} at ${clockLabel(thenMs)}`;
  }

  const diffMins = Math.floor(diffMs / MS_MINUTE);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMs / MS_HOUR);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'} ago`;

  const diffDays = Math.floor(diffMs / MS_DAY);
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}
