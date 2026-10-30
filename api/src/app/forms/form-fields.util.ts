import type { FormFieldOption, FormFieldType } from '@upstart/back-office/shared';
import { isSelectFieldType } from '@upstart/back-office/shared';
import { coerceFieldValue, normalizeOptions } from '../task-manager/task-fields.util';

type FieldDef = { id: string; name: string; type: FormFieldType; options: unknown; required?: boolean };

/**
 * Select options as stored: [{ id, label, points? }] (ids kept on rename, so values survive). Empty for other types.
 * `withPoints` keeps each option's points (scored forms); otherwise points are dropped.
 */
export function formFieldOptions(type: FormFieldType, input: unknown, withPoints = false): FormFieldOption[] {
  if (!isSelectFieldType(type)) return [];
  const raw = Array.isArray(input) ? input.filter((o) => o && typeof o === 'object' && typeof o.label === 'string' && o.label.trim()) : [];
  return normalizeOptions(raw).map(({ id, label }, i) => {
    const p = Number((raw[i] as { points?: unknown }).points);
    return withPoints && (raw[i] as { points?: unknown }).points !== undefined && (raw[i] as { points?: unknown }).points !== null && Number.isFinite(p)
      ? { id, label, points: Math.max(-1000, Math.min(1000, p)) }
      : { id, label };
  });
}

/**
 * Validate one value for its field. Returns the value to store, or null to clear it.
 * Same rules as Task custom fields; long text allows more characters.
 */
export function coerceFormFieldValue(type: FormFieldType, options: FormFieldOption[], value: unknown): unknown {
  if (type === 'LONG_TEXT') {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new Error('Text field expects a string');
    return value.trim() ? value.slice(0, 20000) : null;
  }
  if (type === 'TEXT' && typeof value === 'string' && !value.trim()) return null;
  return coerceFieldValue(type, options, value);
}

/**
 * Merge submitted values into stored ones for the given fields. Unknown field ids are rejected;
 * fields not submitted keep their value. With `requireAll`, required fields must end up filled.
 * Throws Error with "Field name: problem" for the first bad value.
 */
export function mergeFormValues(
  fields: FieldDef[],
  stored: Record<string, unknown>,
  submitted: Record<string, unknown>,
  opts: { requireAll?: boolean } = {},
): Record<string, unknown> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, unknown> = {};
  // Keep only values of fields that still exist.
  for (const f of fields) if (stored[f.id] !== undefined && stored[f.id] !== null) out[f.id] = stored[f.id];
  for (const [id, raw] of Object.entries(submitted ?? {})) {
    const f = byId.get(id);
    if (!f) throw new Error('Unknown field');
    let v: unknown;
    try {
      v = coerceFormFieldValue(f.type, (f.options as FormFieldOption[] | null) ?? [], raw);
    } catch (err) {
      throw new Error(`${f.name}: ${err instanceof Error ? err.message : 'Invalid value'}`);
    }
    if (v === null) delete out[id];
    else out[id] = v;
  }
  if (opts.requireAll) {
    const missing = fields.find((f) => f.required && (out[f.id] === undefined || out[f.id] === null));
    if (missing) throw new Error(`${missing.name}: required`);
  }
  return out;
}

/** Stored values limited to fields that still exist (deleted fields' values are dropped). */
export function liveValues(fields: { id: string }[], stored: unknown): Record<string, unknown> {
  const src = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (src[f.id] !== undefined && src[f.id] !== null) out[f.id] = src[f.id];
  return out;
}
