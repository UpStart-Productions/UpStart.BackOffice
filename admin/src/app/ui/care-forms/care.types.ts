import type { CareFormKind } from '@upstart/back-office/shared';

/** Route and labels per form kind. */
export const CARE_KIND_ROUTE: Record<CareFormKind, string> = {
  INTAKE: '/care/intake',
  CARE_PROFILE: '/care/profiles',
};

export const CARE_KIND_LIST_TITLE: Record<CareFormKind, string> = {
  INTAKE: 'Intake',
  CARE_PROFILE: 'Care profiles',
};

/** True when a form value counts as empty (for dirty checks and display). */
export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

/** Values with empty ones dropped, for comparing snapshots. */
export function normalizeValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (!isEmptyValue(v)) out[k] = v;
  return out;
}
