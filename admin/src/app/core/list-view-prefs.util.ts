import type { SessionService } from './session.service';
import {
  LIST_VIEW_KEYS,
  patchListViewPrefs,
  readListViewPrefs,
  setListViewFilter,
  type ListViewSortOrder,
} from './list-view-prefs.storage';

export function listPrefsUserId(session: SessionService): string | null {
  return session.me()?.id ?? null;
}

export function loadListSearch(session: SessionService, listKey: string): string {
  return readListViewPrefs(listPrefsUserId(session), listKey).search ?? '';
}

export function saveListSearch(session: SessionService, listKey: string, search: string): void {
  patchListViewPrefs(listPrefsUserId(session), listKey, {
    search: search.trim() ? search : undefined,
  });
}

export function loadTableSort(
  session: SessionService,
  listKey: string,
  defaults: { field: string; order: ListViewSortOrder },
): { field: string; order: ListViewSortOrder } {
  const prefs = readListViewPrefs(listPrefsUserId(session), listKey);
  const field = prefs.sortField?.length ? prefs.sortField : defaults.field;
  const order = prefs.sortOrder === -1 ? -1 : prefs.sortOrder === 1 ? 1 : defaults.order;
  return { field, order };
}

type TableSortEvent = { field?: string | string[] | null; order?: number | null };

export function onTableSortSave(
  session: SessionService,
  listKey: string,
  event: TableSortEvent,
): { field: string; order: ListViewSortOrder } | null {
  const rawField = event.field;
  const field =
    typeof rawField === 'string'
      ? rawField
      : Array.isArray(rawField)
        ? rawField[0]
        : null;
  if (!field) return null;
  const order: ListViewSortOrder = event.order === -1 ? -1 : 1;
  patchListViewPrefs(listPrefsUserId(session), listKey, { sortField: field, sortOrder: order });
  return { field, order };
}

export function saveListFilter(
  session: SessionService,
  listKey: string,
  filterKey: string,
  value: string | boolean | null | undefined,
): void {
  setListViewFilter(listPrefsUserId(session), listKey, filterKey, value);
}

export { LIST_VIEW_KEYS };
