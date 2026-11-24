import { personDisplayName } from './tm-format.util';
import type { TmBoardSortOrder } from './tm-board-prefs.storage';
import type { FieldOption, TaskSummary, TmField } from './tm.types';

export const TM_BOARD_BUILTIN_SORT_FIELDS = ['manual', 'name', 'assignee', 'dueOn'] as const;
export type TmBoardBuiltinSortField = (typeof TM_BOARD_BUILTIN_SORT_FIELDS)[number];

export function sortTasksForBoard(
  tasks: TaskSummary[],
  field: string,
  order: TmBoardSortOrder,
  customFields: TmField[] = [],
): TaskSummary[] {
  if (field === 'manual') {
    return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const custom = customFields.find((f) => f.id === field);
  const out = [...tasks];
  out.sort((a, b) => {
    const cmp = custom
      ? compareCustomField(a, b, custom)
      : compareTasksForBoard(a, b, field);
    return order === 1 ? cmp : -cmp;
  });
  return out;
}

function compareTasksForBoard(a: TaskSummary, b: TaskSummary, field: string): number {
  switch (field) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    case 'dueOn':
      return compareDue(a.dueOn, b.dueOn);
    case 'assignee':
      return compareAssignee(a, b);
    default:
      return a.sortOrder - b.sortOrder;
  }
}

function compareDue(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareAssignee(a: TaskSummary, b: TaskSummary): number {
  const an = a.assignee ? personDisplayName(a.assignee) : '';
  const bn = b.assignee ? personDisplayName(b.assignee) : '';
  if (!an && !bn) return a.sortOrder - b.sortOrder;
  if (!an) return 1;
  if (!bn) return -1;
  const byName = an.localeCompare(bn, undefined, { sensitivity: 'base' });
  return byName !== 0 ? byName : a.sortOrder - b.sortOrder;
}

function compareCustomField(a: TaskSummary, b: TaskSummary, field: TmField): number {
  const va = a.fields[field.id];
  const vb = b.fields[field.id];
  switch (field.type) {
    case 'NUMBER':
      return compareNumber(va, vb, a, b);
    case 'DATE':
      return compareDateString(va, vb, a, b);
    case 'CHECKBOX':
      return compareCheckbox(va, vb, a, b);
    case 'SINGLE_SELECT':
      return compareSelectLabel(va, vb, field.options, a, b);
    case 'MULTI_SELECT':
      return compareMultiSelectLabels(va, vb, field.options, a, b);
    default:
      return compareText(va, vb, a, b);
  }
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function compareText(va: unknown, vb: unknown, a: TaskSummary, b: TaskSummary): number {
  const ea = isEmptyValue(va);
  const eb = isEmptyValue(vb);
  if (ea && eb) return a.sortOrder - b.sortOrder;
  if (ea) return 1;
  if (eb) return -1;
  return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
}

function compareNumber(va: unknown, vb: unknown, a: TaskSummary, b: TaskSummary): number {
  const na = va === null || va === undefined || va === '' ? null : Number(va);
  const nb = vb === null || vb === undefined || vb === '' ? null : Number(vb);
  if (na === null && nb === null) return a.sortOrder - b.sortOrder;
  if (na === null || Number.isNaN(na)) return 1;
  if (nb === null || Number.isNaN(nb)) return -1;
  return na - nb;
}

function compareDateString(va: unknown, vb: unknown, a: TaskSummary, b: TaskSummary): number {
  const sa = typeof va === 'string' ? va : '';
  const sb = typeof vb === 'string' ? vb : '';
  if (!sa && !sb) return a.sortOrder - b.sortOrder;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb);
}

function compareCheckbox(va: unknown, vb: unknown, a: TaskSummary, b: TaskSummary): number {
  const ba = !!va;
  const bb = !!vb;
  if (ba === bb) return a.sortOrder - b.sortOrder;
  return ba ? -1 : 1;
}

function optionLabel(options: FieldOption[], id: unknown): string {
  if (id === null || id === undefined || id === '') return '';
  const found = options.find((o) => o.id === id);
  return found?.label ?? String(id);
}

function compareSelectLabel(
  va: unknown,
  vb: unknown,
  options: FieldOption[],
  a: TaskSummary,
  b: TaskSummary,
): number {
  const la = optionLabel(options, va);
  const lb = optionLabel(options, vb);
  if (!la && !lb) return a.sortOrder - b.sortOrder;
  if (!la) return 1;
  if (!lb) return -1;
  return la.localeCompare(lb, undefined, { sensitivity: 'base' });
}

function compareMultiSelectLabels(
  va: unknown,
  vb: unknown,
  options: FieldOption[],
  a: TaskSummary,
  b: TaskSummary,
): number {
  const la = labelsForMulti(va, options);
  const lb = labelsForMulti(vb, options);
  if (!la && !lb) return a.sortOrder - b.sortOrder;
  if (!la) return 1;
  if (!lb) return -1;
  return la.localeCompare(lb, undefined, { sensitivity: 'base' });
}

function labelsForMulti(value: unknown, options: FieldOption[]): string {
  const ids = Array.isArray(value) ? value : [];
  return ids
    .map((id) => optionLabel(options, id))
    .filter(Boolean)
    .sort((x, y) => x.localeCompare(y))
    .join(', ');
}

/** Map legacy persisted values from the first sort dropdown. */
export function migrateLegacyTaskSort(
  legacy: string | undefined,
): { field: string; order: TmBoardSortOrder } | null {
  switch (legacy) {
    case 'due-asc':
      return { field: 'dueOn', order: 1 };
    case 'due-desc':
      return { field: 'dueOn', order: -1 };
    case 'title-asc':
      return { field: 'name', order: 1 };
    case 'title-desc':
      return { field: 'name', order: -1 };
    case 'assignee-asc':
      return { field: 'assignee', order: 1 };
    case 'manual':
      return { field: 'manual', order: 1 };
    default:
      return null;
  }
}