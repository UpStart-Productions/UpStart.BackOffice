import { randomUUID } from 'crypto';
import type { FormFieldOption, FormFieldType, FormFileRef, FormGroupRow, FormSubfieldDto, FormSubfieldType } from '@upstart/back-office/shared';
import {
  FORM_FILE_MAX_BYTES, FORM_FILE_MAX_COUNT, formatPhoneDigits, formatSsnDigits, FORM_GROUP_MAX_ROWS, FORM_GROUP_MAX_SUBFIELDS, FORM_SUBFIELD_TYPES, isAllowedFormFile, isSelectFieldType,
} from '@upstart/back-office/shared';
import { coerceFieldValue, normalizeOptions } from '../task-manager/task-fields.util';

type FieldDef = { id: string; name: string; type: FormFieldType; options: unknown; required?: boolean; subfields?: FormSubfieldDto[]; multiple?: boolean };

/**
 * A file upload's answer: the uploaded files' references, checked. With `prefix`, every file must have been uploaded
 * under it (this form, or this public link), so an answer can't point at someone else's file. Null when none.
 */
export function coerceFileValue(value: unknown, multiple: boolean, prefix?: string, known?: Set<string>): FormFileRef[] | null {
  if (value === null || value === undefined || value === '') return null;
  const list = Array.isArray(value) ? value : [value];
  const max = multiple ? FORM_FILE_MAX_COUNT : 1;
  if (list.length > max) throw new Error(multiple ? `${max} files at most` : 'One file only');
  const out: FormFileRef[] = [];
  for (const raw of list) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const key = typeof r['key'] === 'string' ? r['key'] : '';
    const name = typeof r['name'] === 'string' ? r['name'].slice(0, 255) : '';
    const size = Number(r['size']);
    const type = typeof r['type'] === 'string' ? r['type'].slice(0, 120) : '';
    if (!key.startsWith('forms/') || key.includes('..') || !name || !Number.isFinite(size)) throw new Error('Upload the file again');
    if (prefix && !key.startsWith(prefix) && !known?.has(key)) throw new Error('Upload the file again');
    if (size > FORM_FILE_MAX_BYTES || !isAllowedFormFile(name, type)) throw new Error('That file type or size is not allowed');
    out.push({ key, name, size, type });
  }
  return out.length ? out : null;
}

/** Every file referenced by an answer set (file fields and nothing else). */
export function fileRefsIn(values: unknown): FormFileRef[] {
  const src = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const out: FormFileRef[] = [];
  for (const v of Object.values(src)) {
    if (!Array.isArray(v)) continue;
    for (const f of v) {
      if (f && typeof f === 'object' && typeof (f as FormFileRef).key === 'string' && (f as FormFileRef).key.startsWith('forms/')) out.push(f as FormFileRef);
    }
  }
  return out;
}

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
export function coerceFormFieldValue(
  type: FormFieldType,
  options: FormFieldOption[],
  value: unknown,
  subfields: FormSubfieldDto[] = [],
  file: { multiple?: boolean; prefix?: string; known?: Set<string> } = {},
): unknown {
  // A text block takes no answer: anything sent for it is dropped.
  if (type === 'CONTENT') return null;
  if (type === 'GROUP') return coerceGroupValue(subfields, value);
  if (type === 'FILE') return coerceFileValue(value, !!file.multiple, file.prefix, file.known);
  if (type === 'LONG_TEXT') {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new Error('Text field expects a string');
    return value.trim() ? value.slice(0, 20000) : null;
  }
  if (type === 'TEXT' && typeof value === 'string' && !value.trim()) return null;
  if (type === 'CURRENCY') {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new Error('Enter an amount');
    return Math.round(n * 100) / 100;
  }
  if (type === 'PHONE' || type === 'SSN') {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Enter a number');
    let d = String(value).replace(/\D/g, '');
    if (!d) return null;
    if (type === 'PHONE') {
      if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
      if (d.length !== 10) throw new Error('Enter a 10-digit phone number');
      return formatPhoneDigits(d);
    }
    if (d.length !== 9) throw new Error('Enter all 9 digits');
    return formatSsnDigits(d);
  }
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
  /** filePrefix: uploaded files must be under it (e.g. forms/{formId}/ or a public link's folder). */
  opts: { requireAll?: boolean; filePrefix?: string } = {},
): Record<string, unknown> {
  const allIds = new Set(fields.map((f) => f.id));
  // Text blocks are never answered: they don't take or require values.
  fields = fields.filter((f) => f.type !== 'CONTENT');
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, unknown> = {};
  // Keep only values of fields that still exist.
  for (const f of fields) if (stored[f.id] !== undefined && stored[f.id] !== null) out[f.id] = stored[f.id];
  // Files already on the answer stay valid wherever they were uploaded (e.g. by staff, then a family link sends them back).
  const known = new Set(fileRefsIn(stored).map((f) => f.key));
  for (const [id, raw] of Object.entries(submitted ?? {})) {
    const f = byId.get(id);
    if (!f) {
      if (allIds.has(id)) continue; // a text block
      throw new Error('Unknown field');
    }
    let v: unknown;
    try {
      v = coerceFormFieldValue(f.type, (f.options as FormFieldOption[] | null) ?? [], raw, f.subfields ?? [], {
        multiple: f.multiple,
        prefix: opts.filePrefix,
        known,
      });
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
