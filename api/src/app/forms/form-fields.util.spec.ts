import { describe, expect, it } from 'vitest';
import { coerceFormFieldValue, formFieldOptions, liveValues, mergeFormValues } from './form-fields.util';

const fields = [
  { id: 'a', name: 'Name', type: 'TEXT' as const, options: null, required: true },
  { id: 'b', name: 'Mobility', type: 'SINGLE_SELECT' as const, options: [{ id: 'w', label: 'Walker' }], required: false },
];

describe('form fields', () => {
  it('keeps option ids and drops blank labels', () => {
    const opts = formFieldOptions('SINGLE_SELECT', [{ id: 'a', label: ' Yes ' }, { label: '' }, { label: 'No' }]);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toEqual({ id: 'a', label: 'Yes' });
    expect(opts[1].id).toBeTruthy();
  });

  it('has no options for non-select types', () => {
    expect(formFieldOptions('TEXT', [{ id: 'a', label: 'x' }])).toEqual([]);
  });

  it('clears empty values', () => {
    expect(coerceFormFieldValue('TEXT', [], '   ')).toBeNull();
    expect(coerceFormFieldValue('LONG_TEXT', [], '')).toBeNull();
    expect(coerceFormFieldValue('CHECKBOX', [], false)).toBeNull();
  });

  it('merges, validates and enforces required fields', () => {
    expect(mergeFormValues(fields, { a: 'x', gone: 1 }, { b: 'w' })).toEqual({ a: 'x', b: 'w' });
    expect(() => mergeFormValues(fields, {}, { b: 'nope' })).toThrow(/Mobility/);
    expect(() => mergeFormValues(fields, {}, { zzz: 'x' })).toThrow();
    expect(() => mergeFormValues(fields, {}, { b: 'w' }, { requireAll: true })).toThrow(/Name: required/);
  });

  it('drops values of deleted fields', () => {
    expect(liveValues(fields, { a: 1, z: 2 })).toEqual({ a: 1 });
  });
});
