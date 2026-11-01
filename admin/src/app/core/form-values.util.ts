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
