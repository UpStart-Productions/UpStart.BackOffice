import { clientFieldOptions, coerceClientFieldValue } from './client-fields.util';

describe('client fields', () => {
  it('keeps option ids and drops blank labels', () => {
    const opts = clientFieldOptions('SINGLE_SELECT', [{ id: 'a', label: ' Yes ' }, { label: '' }, { label: 'No' }]);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toEqual({ id: 'a', label: 'Yes' });
    expect(opts[1].id).toBeTruthy();
  });

  it('has no options for non-select types', () => {
    expect(clientFieldOptions('TEXT', [{ id: 'a', label: 'x' }])).toEqual([]);
  });

  it('clears empty values', () => {
    expect(coerceClientFieldValue('TEXT', [], '   ')).toBeNull();
    expect(coerceClientFieldValue('LONG_TEXT', [], '')).toBeNull();
    expect(coerceClientFieldValue('CHECKBOX', [], false)).toBeNull();
    expect(coerceClientFieldValue('MULTI_SELECT', [{ id: 'a', label: 'A' }], [])).toBeNull();
  });

  it('validates by type', () => {
    expect(coerceClientFieldValue('NUMBER', [], '4')).toBe(4);
    expect(coerceClientFieldValue('DATE', [], '2026-10-29T00:00')).toBe('2026-10-29');
    expect(() => coerceClientFieldValue('SINGLE_SELECT', [{ id: 'a', label: 'A' }], 'b')).toThrow();
    expect(coerceClientFieldValue('LONG_TEXT', [], 'line 1\nline 2')).toBe('line 1\nline 2');
  });
});
