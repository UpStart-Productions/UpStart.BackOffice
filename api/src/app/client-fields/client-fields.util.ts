import { coerceFieldValue, normalizeOptions, type FieldOption } from '../task-manager/task-fields.util';

export const CLIENT_FIELD_TYPES = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX'] as const;
export type ClientFieldTypeValue = (typeof CLIENT_FIELD_TYPES)[number];

export function isSelectType(type: ClientFieldTypeValue): boolean {
  return type === 'SINGLE_SELECT' || type === 'MULTI_SELECT';
}

/** Select options as stored: [{ id, label }] (ids kept on rename, so values survive). Empty for other types. */
export function clientFieldOptions(type: ClientFieldTypeValue, input: unknown): FieldOption[] {
  if (!isSelectType(type)) return [];
  return normalizeOptions(input).map(({ id, label }) => ({ id, label }));
}

/**
 * Validate a value for a client field. Returns the value to store, or null to clear it.
 * Same rules as Task custom fields; long text allows more characters.
 */
export function coerceClientFieldValue(type: ClientFieldTypeValue, options: FieldOption[], value: unknown): unknown {
  if (type === 'LONG_TEXT') {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new Error('Text field expects a string');
    return value.trim() ? value.slice(0, 20000) : null;
  }
  if (type === 'TEXT' && typeof value === 'string' && !value.trim()) return null;
  return coerceFieldValue(type, options, value);
}
