import { describe, expect, it } from 'vitest';
import { formatReceiptDate, resolveReceiptPayer } from './pay-receipt.util';

describe('pay-receipt.util', () => {
  it('prefers the checkout email over the client record', () => {
    expect(
      resolveReceiptPayer(
        { customer_details: { email: ' payer@example.com ', name: 'Pat' }, customer_email: 'old@example.com' },
        { email: 'client@example.com', name: 'Client Co' },
      ),
    ).toEqual({ email: 'payer@example.com', name: 'Pat' });
  });

  it('falls back to the invoice client when checkout has no email', () => {
    expect(resolveReceiptPayer({}, { email: 'client@example.com', name: 'Client Co' })).toEqual({
      email: 'client@example.com',
      name: 'Client Co',
    });
  });

  it('returns null when no email is available', () => {
    expect(resolveReceiptPayer({}, { name: 'Client Co' })).toBeNull();
  });

  it('formats the paid date for the receipt', () => {
    expect(formatReceiptDate(new Date(2026, 8, 3))).toBe('September 3, 2026');
  });
});
