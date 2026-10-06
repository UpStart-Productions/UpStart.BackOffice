import { randomUUID } from 'crypto';

export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX';
export type FieldOption = { id: string; label: string; color?: string };

export const OPTION_COLORS = ['blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'teal', 'gray'];

/** Normalize select options: trim labels, drop blanks, assign ids/colors to new options. */
export function normalizeOptions(input: unknown): FieldOption[] {
  if (!Array.isArray(input)) return [];
  const out: FieldOption[] = [];
  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const label = typeof r['label'] === 'string' ? r['label'].trim() : '';
    if (!label) return;
    const id = typeof r['id'] === 'string' && r['id'].trim() ? r['id'].trim() : randomUUID();
    const color =
      typeof r['color'] === 'string' && r['color'].trim() ? r['color'].trim() : OPTION_COLORS[index % OPTION_COLORS.length];
    out.push({ id, label, color });
  });
  return out;
}

/**
 * Validate a custom field value for its type. Returns the value to store, or null to clear.
 * Throws Error with a user-facing message when invalid.
 */
export function coerceFieldValue(type: FieldType, options: FieldOption[], value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  switch (type) {
    case 'TEXT':
      if (typeof value !== 'string') throw new Error('Text field expects a string');
      return value.slice(0, 5000);
    case 'NUMBER': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error('Number field expects a number');
      return n;
    }
    case 'DATE': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error('Date field expects YYYY-MM-DD');
      }
      return value.slice(0, 10);
    }
    case 'CHECKBOX':
      if (typeof value !== 'boolean') throw new Error('Checkbox field expects true/false');
      return value ? true : null;
    case 'SINGLE_SELECT':
      if (typeof value !== 'string' || !options.some((o) => o.id === value)) {
        throw new Error('Unknown option for this field');
      }
      return value;
    case 'MULTI_SELECT': {
      const ids = Array.isArray(value) ? value : [value];
      const valid = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
      if (valid.some((id) => !options.some((o) => o.id === id))) throw new Error('Unknown option for this field');
      return valid.length ? valid : null;
    }
  }
}
