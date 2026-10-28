import { parseMoneyDraft, sanitizeMoneyDraft } from './money-input.component';

describe('money-input draft parsing', () => {
  it('accepts sub-dollar amounts', () => {
    expect(parseMoneyDraft('0.53', { min: 0, maxFractionDigits: 4 })).toBe(0.53);
    expect(parseMoneyDraft('.53', { min: 0, maxFractionDigits: 4 })).toBe(0.53);
  });

  it('sanitizes extra decimals while typing', () => {
    expect(sanitizeMoneyDraft('.53', 4)).toBe('.53');
    expect(sanitizeMoneyDraft('0.53', 4)).toBe('0.53');
  });
});
