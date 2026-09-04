import { describe, expect, it } from 'vitest';
import {
  EMAIL_BRAND,
  buildBookingEmailHtml,
  buildInvoiceEmailHtml,
  buildPaymentReceiptHtml,
  publicFromName,
} from './email-layout';

describe('email-layout', () => {
  it('never shows Back Office in the from-name', () => {
    expect(publicFromName('UpStart Back Office')).toBe(EMAIL_BRAND.name);
    expect(publicFromName('Back Office')).toBe(EMAIL_BRAND.name);
    expect(publicFromName('')).toBe(EMAIL_BRAND.name);
    expect(publicFromName('UpStart Productions')).toBe('UpStart Productions');
  });

  it('builds a receipt with amount, date, and Stripe number', () => {
    const html = buildPaymentReceiptHtml({
      toName: 'Pat',
      invoiceNumber: 'SMPL-0002',
      amountLabel: '$125.00',
      paidOn: 'September 3, 2026',
      receiptNumber: '2122-7741',
    });
    expect(html).toContain('Receipt from UpStart Productions');
    expect(html).toContain('Receipt #2122-7741');
    expect(html).toContain('$125.00');
    expect(html).toContain('cid:upstart-logo');
    expect(html).toContain('background:#7c3aed');
    expect(html).toContain('Technology that serves your mission.');
    expect(html).not.toMatch(/back office/i);
    expect(html).not.toContain('784-7046');
    expect(html).not.toMatch(/or call/i);
  });

  it('builds an invoice with pay button and no Back Office', () => {
    const html = buildInvoiceEmailHtml({
      toName: 'Pat',
      invoiceNumber: 'SMPL-0002',
      amountLabel: '$125.00',
      dueDate: 'September 17, 2026',
      payUrl: 'https://heyupstart.com/pay/token',
    });
    expect(html).toContain('Invoice from UpStart Productions');
    expect(html).toContain('Securely Pay Invoice');
    expect(html).toContain('cid:upstart-logo');
    expect(html).not.toMatch(/back office/i);
  });

  it('builds a booking confirmation', () => {
    const html = buildBookingEmailHtml({
      title: 'Booking confirmed',
      greeting: 'Hi Pat,',
      intro: 'Your Discovery Chat is confirmed.',
      facts: [{ label: 'When', value: 'Friday, Sep 4 at 10:00 AM' }],
    });
    expect(html).toContain('Booking confirmed');
    expect(html).toContain('Discovery Chat');
    expect(html).not.toMatch(/back office/i);
  });
});
