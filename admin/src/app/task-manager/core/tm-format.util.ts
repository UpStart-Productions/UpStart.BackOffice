import { dateKey, parseDateKey } from '../../core/date.util';
import { Person, Recurrence } from './tm.types';

export const PROJECT_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c', '#dc2626', '#db2777', '#64748b'];

export const OPTION_COLOR_HEX: Record<string, { bg: string; fg: string }> = {
  blue: { bg: '#dbeafe', fg: '#1d4ed8' },
  green: { bg: '#dcfce7', fg: '#15803d' },
  yellow: { bg: '#fef9c3', fg: '#a16207' },
  orange: { bg: '#ffedd5', fg: '#c2410c' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
  purple: { bg: '#ede9fe', fg: '#6d28d9' },
  pink: { bg: '#fce7f3', fg: '#be185d' },
  teal: { bg: '#ccfbf1', fg: '#0f766e' },
  gray: { bg: '#f1f5f9', fg: '#475569' },
};

export function todayKey(): string {
  return dateKey(new Date());
}

export function addDaysKey(key: string, days: number): string {
  const d = parseDateKey(key)!;
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Asana-style due label: Today, Tomorrow, Yesterday, weekday within a week, else "Oct 12" (+ year if not this year). */
export function dueLabel(dueOn: string | null): string {
  if (!dueOn) return '';
  const today = todayKey();
  if (dueOn === today) return 'Today';
  if (dueOn === addDaysKey(today, 1)) return 'Tomorrow';
  if (dueOn === addDaysKey(today, -1)) return 'Yesterday';
  const d = parseDateKey(dueOn);
  if (!d) return dueOn;
  const diff = Math.round((d.getTime() - parseDateKey(today)!.getTime()) / 86400000);
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

export function dueTone(dueOn: string | null, isCompleted = false): DueTone {
  if (!dueOn || isCompleted) return dueOn ? 'normal' : 'none';
  const today = todayKey();
  if (dueOn < today) return 'overdue';
  if (dueOn === today) return 'today';
  if (dueOn <= addDaysKey(today, 1)) return 'soon';
  return 'normal';
}

export function initials(p: Pick<Person, 'firstName' | 'lastName' | 'name' | 'email'>): string {
  const first = p.firstName?.trim()?.[0] ?? '';
  const last = p.lastName?.trim()?.[0] ?? '';
  if (first || last) return (first + last).toUpperCase();
  const parts = (p.name || p.email).trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const AVATAR_PALETTE = [
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fef3c7', fg: '#b45309' },
] as const;

export function avatarPalette(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash]!;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function recurrenceLabel(rule: Recurrence | null): string {
  if (!rule) return 'Does not repeat';
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[rule.freq];
  const every = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  const days = rule.freq === 'WEEKLY' && rule.weekdays?.length ? ` on ${rule.weekdays.map((d) => WEEKDAYS[d]).join(', ')}` : '';
  return `${every}${days}${rule.mode === 'ON_COMPLETE' ? ' after completion' : ''}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fileSizeLabel(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
