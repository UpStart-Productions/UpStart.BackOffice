import { describe, expect, it } from 'vitest';
import { hasInvoiceNotes, renderInvoicePdfBuffer } from './invoice-pdfmake.util';

describe('invoice-pdfmake.util', () => {
  it('renders a minimal invoice PDF buffer', async () => {
    const buffer = await renderInvoicePdfBuffer({
      displayNumber: 'INV-0001',
      issueDate: new Date('2026-09-01T12:00:00.000Z'),
      dueDate: new Date('2026-09-15T12:00:00.000Z'),
      subtotal: 100,
      taxRate: 0.1,
      taxAmount: 10,
      total: 110,
      billToLines: ['Pat Example', '123 Main St'],
      fromDisplayName: 'UpStart Productions',
      fromDetailsLines: ['hello@heyupstart.com'],
      lineItems: [
        {
          description: 'Design work',
          quantity: 2,
          unitPrice: 50,
          amount: 100,
          projectId: 'p1',
          projectName: 'Website',
        },
      ],
    });
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('includes Quill notes when present', async () => {
    const buffer = await renderInvoicePdfBuffer({
      displayNumber: 'INV-0002',
      issueDate: new Date('2026-09-01T12:00:00.000Z'),
      subtotal: 50,
      total: 50,
      billToLines: ['Client'],
      fromDisplayName: 'UpStart Productions',
      fromDetailsLines: [],
      notes: '<p>Thank you for your <strong>business</strong>.</p>',
      lineItems: [
        { description: 'Hours', quantity: 1, unitPrice: 50, amount: 50, projectId: null, projectName: null },
      ],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(hasInvoiceNotes('<p>Hi</p>')).toBe(true);
    expect(hasInvoiceNotes('<p><br></p>')).toBe(false);
  });
});
