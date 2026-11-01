import { randomUUID } from 'crypto';
import type { FormFieldOption, FormFieldType, FormGroupRow, FormSubfieldDto, FormSubfieldType } from '@upstart/back-office/shared';
import { FORM_GROUP_MAX_ROWS, FORM_GROUP_MAX_SUBFIELDS, FORM_SUBFIELD_TYPES, isSelectFieldType } from '@upstart/back-office/shared';
import { coerceFieldValue, normalizeOptions } from '../task-manager/task-fields.util';

type FieldDef = { id: string; name: string; type: FormFieldType; options: unknown; required?: boolean; subfields?: FormSubfieldDto[] };

/**
 * A repeating group's sub-fields as stored (in the field's options column): [{ id, name, type, options }].
 * Ids are kept (matched by id, or by position when an edit leaves them out) so answers survive renames.
 * Throws an Error with what's wrong.
 */
export function formSubfields(input: unknown, existing: FormSubfieldDto[] = []): FormSubfieldDto[] {
  const raw = Array.isArray(input) ? input : [];
  if (raw.length > FORM_GROUP_MAX_SUBFIELDS) throw new Error(`A repeating group can have ${FORM_GROUP_MAX_SUBFIELDS} sub-fields at most`);
  const out: FormSubfieldDto[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o['name'] === 'string' ? o['name'].trim().slice(0, 200) : '';
    if (!name) throw new Error('Every sub-field needs a name');
    const id = typeof o['id'] === 'string' && o['id'].trim() ? o['id'].trim() : randomUUID();
    const before = existing.find((e) => e.id === id);
    // The type of an existing sub-field can't change (its answers would no longer fit).
    const type = (before?.type ?? o['type']) as FormSubfieldType;
    if (!FORM_SUBFIELD_TYPES.includes(type)) throw new Error(`"${name}" has a type a repeating group can't have`);
    const options = formFieldOptions(type, o['options']);
    if (isSelectFieldType(type) && !options.length) throw new Error(`"${name}" needs at least one choice`);
    out.push({ id, name, type, options });
  }
  if (!out.length) throw new Error('Add at least one sub-field');
  return out;
}

/** Sub-fields stored on a group field (its options column), cleaned up for reading. */
export function storedSubfields(stored: unknown): FormSubfieldDto[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string' && FORM_SUBFIELD_TYPES.includes(s.type))
    .map((s) => ({ id: s.id, name: s.name, type: s.type as FormSubfieldType, options: Array.isArray(s.options) ? (s.options as FormFieldOption[]) : [] }));
}

/** A repeating group's answer: rows with each sub-field's value checked; empty rows dropped. Null when no rows. */
function coerceGroupValue(subfields: FormSubfieldDto[], value: unknown): FormGroupRow[] | null {
  if (value === null || value === undefined || value === '') return null;
  if (!Array.isArray(value)) throw new Error('Expected a list of rows');
  if (value.length > FORM_GROUP_MAX_ROWS) throw new Error(`${FORM_GROUP_MAX_ROWS} rows at most`);
  const rows: FormGroupRow[] = [];
  for (const raw of value) {
    const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const row: FormGroupRow = {};
    for (const sf of subfields) {
      let v: unknown;
      try {
        v = coerceFormFieldValue(sf.type, sf.options, src[sf.id]);
      } catch (err) {
        throw new Error(`${sf.name}: ${err instanceof Error ? err.message : 'Invalid value'}`);
      }
      if (v !== null && v !== undefined) row[sf.id] = v;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows.length ? rows : null;
}

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
export function coerceFormFieldValue(type: FormFieldType, options: FormFieldOption[], value: unknown, subfields: FormSubfieldDto[] = []): unknown {
  // A text block takes no answer: anything sent for it is dropped.
  if (type === 'CONTENT') return null;
  if (type === 'GROUP') return coerceGroupValue(subfields, value);
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
  const allIds = new Set(fields.map((f) => f.id));
  // Text blocks are never answered: they don't take or require values.
  fields = fields.filter((f) => f.type !== 'CONTENT');
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, unknown> = {};
  // Keep only values of fields that still exist.
  for (const f of fields) if (stored[f.id] !== undefined && stored[f.id] !== null) out[f.id] = stored[f.id];
  for (const [id, raw] of Object.entries(submitted ?? {})) {
    const f = byId.get(id);
    if (!f) {
      if (allIds.has(id)) continue; // a text block
      throw new Error('Unknown field');
    }
    let v: unknown;
    try {
      v = coerceFormFieldValue(f.type, (f.options as FormFieldOption[] | null) ?? [], raw, f.subfields ?? []);
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
