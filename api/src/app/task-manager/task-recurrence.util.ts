/**
 * Recurrence rules for Task Manager tasks (stored as JSON on Task.recurrence).
 *
 * - ON_COMPLETE: next due date is counted from the day the task was completed.
 * - ON_SCHEDULE: next due date is counted from the previous due date (keeps a fixed cadence).
 */
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurrenceMode = 'ON_COMPLETE' | 'ON_SCHEDULE';

export type TaskRecurrence = {
  freq: RecurrenceFreq;
  interval: number;
  /** WEEKLY only: days of week, 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  mode: RecurrenceMode;
};

const FREQS: RecurrenceFreq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const MODES: RecurrenceMode[] = ['ON_COMPLETE', 'ON_SCHEDULE'];

/** Validate/normalize untrusted input. Returns null for "no recurrence". Throws on invalid shape. */
export function normalizeRecurrence(input: unknown): TaskRecurrence | null {
  if (input == null) return null;
  if (typeof input !== 'object') throw new Error('recurrence must be an object or null');
  const raw = input as Record<string, unknown>;
  const freq = raw['freq'];
  if (typeof freq !== 'string' || !FREQS.includes(freq as RecurrenceFreq)) {
    throw new Error('recurrence.freq must be DAILY, WEEKLY, MONTHLY or YEARLY');
  }
  const intervalRaw = raw['interval'] ?? 1;
  const interval = Number(intervalRaw);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new Error('recurrence.interval must be an integer between 1 and 365');
  }
  const modeRaw = raw['mode'] ?? 'ON_COMPLETE';
  if (typeof modeRaw !== 'string' || !MODES.includes(modeRaw as RecurrenceMode)) {
    throw new Error('recurrence.mode must be ON_COMPLETE or ON_SCHEDULE');
  }
  const result: TaskRecurrence = { freq: freq as RecurrenceFreq, interval, mode: modeRaw as RecurrenceMode };
  if (freq === 'WEEKLY' && Array.isArray(raw['weekdays']) && raw['weekdays'].length > 0) {
    const days = [...new Set(raw['weekdays'].map(Number))].filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6,
    );
    if (days.length > 0) result.weekdays = days.sort((a, b) => a - b);
  }
  return result;
}

/** UTC date-only helpers (Task.dueOn is a @db.Date, so we work in UTC midnight). */
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsClamped(d: Date, months: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/**
 * Compute the next due date for a recurring task.
 * @param rule       normalized recurrence
 * @param dueOn      the completed task's due date (may be null)
 * @param completedOn the date the task was completed
 */
export function nextDueDate(rule: TaskRecurrence, dueOn: Date | null, completedOn: Date): Date {
  const base = toDateOnly(rule.mode === 'ON_SCHEDULE' && dueOn ? dueOn : completedOn);
  switch (rule.freq) {
    case 'DAILY':
      return addDays(base, rule.interval);
    case 'WEEKLY': {
      if (!rule.weekdays || rule.weekdays.length === 0) return addDays(base, 7 * rule.interval);
      // Next matching weekday after base. Within the same week, take the next listed day;
      // otherwise jump `interval` weeks ahead to the first listed day.
      const dow = base.getUTCDay();
      const later = rule.weekdays.find((d) => d > dow);
      if (later !== undefined) return addDays(base, later - dow);
      const first = rule.weekdays[0];
      return addDays(base, 7 * (rule.interval - 1) + (7 - dow) + first);
    }
    case 'MONTHLY':
      return addMonthsClamped(base, rule.interval);
    case 'YEARLY':
      return addMonthsClamped(base, 12 * rule.interval);
  }
}

export function describeRecurrence(rule: TaskRecurrence | null): string {
  if (!rule) return 'Does not repeat';
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[rule.freq];
  const every = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = rule.freq === 'WEEKLY' && rule.weekdays?.length ? ` on ${rule.weekdays.map((d) => names[d]).join(', ')}` : '';
  const mode = rule.mode === 'ON_COMPLETE' ? ' after completion' : '';
  return `${every}${days}${mode}`;
}
