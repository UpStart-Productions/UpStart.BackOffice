/** Per-user list view search, sort, and filter prefs (localStorage). */

import { defaultPeriod, type PeriodValue } from './period.util';

const STORAGE_KEY_PREFIX = 'ubo-list-view:v1';

export const LIST_VIEW_KEYS = {
  projects: 'projects',
  clients: 'clients',
  organizations: 'organizations',
  people: 'people',
  invoices: 'invoices',
  expenses: 'expenses',
  users: 'users',
  activity: 'activity',
  timeEntries: 'time-entries',
  bookings: 'bookings',
  bookingTypes: 'booking-types',
  forms: 'forms',
  pipeline: 'pipeline',
  careSchedule: 'care-schedule',
} as const;

export type ListViewKey = (typeof LIST_VIEW_KEYS)[keyof typeof LIST_VIEW_KEYS] | `form-submissions:${string}` | `activity-feed:${string}`;

export type ListViewSortOrder = 1 | -1;

export type ListViewPrefs = {
  search?: string;
  sortField?: string;
  sortOrder?: ListViewSortOrder;
  filters?: Record<string, string | boolean>;
};

function storageKey(userId: string, listKey: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${listKey}`;
}

export function readListViewPrefs(userId: string | null | undefined, listKey: string): ListViewPrefs {
  if (!userId || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(userId, listKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ListViewPrefs;
    const out: ListViewPrefs = {};
    if (typeof parsed.search === 'string') out.search = parsed.search;
    if (typeof parsed.sortField === 'string' && parsed.sortField.length > 0) out.sortField = parsed.sortField;
    if (parsed.sortOrder === 1 || parsed.sortOrder === -1) out.sortOrder = parsed.sortOrder;
    if (parsed.filters && typeof parsed.filters === 'object') {
      const filters: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(parsed.filters)) {
        if (typeof v === 'string' || typeof v === 'boolean') filters[k] = v;
      }
      if (Object.keys(filters).length) out.filters = filters;
    }
    return out;
  } catch {
    return {};
  }
}

export function patchListViewPrefs(userId: string | null | undefined, listKey: string, patch: Partial<ListViewPrefs>): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    const prev = readListViewPrefs(userId, listKey);
    const next: ListViewPrefs = { ...prev, ...patch };
    if (patch.filters !== undefined) {
      next.filters = patch.filters;
    }
    if (!next.search) delete next.search;
    if (!next.sortField) delete next.sortField;
    if (next.sortOrder === undefined) delete next.sortOrder;
    if (!next.filters || !Object.keys(next.filters).length) delete next.filters;
    if (!Object.keys(next).length) {
      localStorage.removeItem(storageKey(userId, listKey));
      return;
    }
    localStorage.setItem(storageKey(userId, listKey), JSON.stringify(next));
  } catch {
    // Prefs won't persist.
  }
}

export function setListViewFilter(
  userId: string | null | undefined,
  listKey: string,
  filterKey: string,
  value: string | boolean | null | undefined,
): void {
  const prev = readListViewPrefs(userId, listKey);
  const filters = { ...(prev.filters ?? {}) };
  if (value === undefined || value === null || value === '') {
    delete filters[filterKey];
  } else {
    filters[filterKey] = value;
  }
  patchListViewPrefs(userId, listKey, {
    filters: Object.keys(filters).length ? filters : undefined,
  });
}

export function listViewFilterString(
  prefs: ListViewPrefs,
  filterKey: string,
): string | null {
  const v = prefs.filters?.[filterKey];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function listViewFilterBool(prefs: ListViewPrefs, filterKey: string): boolean | null {
  const v = prefs.filters?.[filterKey];
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

export function periodFromListPrefs(prefs: ListViewPrefs): PeriodValue | null {
  const raw = listViewFilterString(prefs, 'period');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PeriodValue>;
    if (!parsed?.periodType) return null;
    return { ...defaultPeriod(), ...parsed };
  } catch {
    return null;
  }
}

export function periodToListFilter(period: PeriodValue): string {
  return JSON.stringify(period);
}

export function activityFeedListKey(contextKey: string): ListViewKey {
  return `activity-feed:${contextKey}`;
}

export function formSubmissionsListKey(formId: string): ListViewKey {
  return `form-submissions:${formId}`;
}
