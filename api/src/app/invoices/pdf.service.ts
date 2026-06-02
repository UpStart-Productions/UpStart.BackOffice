import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { Decimal } from '@prisma/client/runtime/library';

type LineItem = {
  description: string;
  quantity: number | Decimal;
  unitPrice: number | Decimal;
  amount: number | Decimal;
  project?: { name: string } | null;
};

type InvoiceData = {
  displayNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  subtotal: number | Decimal;
  taxRate?: number | Decimal | null;
  taxAmount?: number | Decimal | null;
  total: number | Decimal;
  client: { name: string; email?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
  lineItems: LineItem[];
};

function fmt(val: number | Decimal | null | undefined): string {
  if (val == null) return '$0.00';
  return '$' + Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateInvoicePdf(invoice: InvoiceData, fromName: string): Promise<Buffer> {
    const html = this.buildInvoiceHtml(invoice, fromName);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private buildInvoiceHtml(invoice: InvoiceData, fromName: string): string {
    const rows = invoice.lineItems.map((item) => `
      <tr>
        <td>${item.description}${item.project ? ` <span class="project">${item.project.name}</span>` : ''}</td>
        <td class="num">${Number(item.quantity).toFixed(2)}</td>
        <td class="num">${fmt(item.unitPrice)}</td>
        <td class="num">${fmt(item.amount)}</td>
      </tr>`).join('');

    const clientAddr = [
      invoice.client.name,
      invoice.client.address,
      invoice.client.city && invoice.client.state
        ? `${invoice.client.city}, ${invoice.client.state} ${invoice.client.zip ?? ''}`.trim()
        : (invoice.client.city || invoice.client.state || ''),
    ].filter(Boolean).join('<br>');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .company { font-size: 22px; font-weight: 700; color: #111; }
  .invoice-label { font-size: 28px; font-weight: 300; color: #555; }
  .invoice-number { font-size: 18px; font-weight: 600; }
  .meta { display: flex; gap: 48px; margin-bottom: 40px; }
  .meta-block label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; display: block; margin-bottom: 4px; }
  .meta-block p { font-size: 14px; color: #222; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #f5f5f5; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; border-bottom: 2px solid #e0e0e0; }
  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .num { text-align: right; }
  .project { display: block; font-size: 11px; color: #888; margin-top: 2px; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-table { min-width: 280px; }
  .totals-table td { border: none; padding: 4px 12px; }
  .totals-table .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #222; padding-top: 10px; margin-top: 6px; }
  .notes { margin-top: 32px; padding: 16px; background: #f9f9f9; border-radius: 6px; font-size: 13px; color: #555; }
  .notes label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; display: block; margin-bottom: 6px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company">${fromName}</div>
  </div>
  <div style="text-align:right">
    <div class="invoice-label">Invoice</div>
    <div class="invoice-number">${invoice.displayNumber}</div>
  </div>
</div>

<div class="meta">
  <div class="meta-block">
    <label>Bill To</label>
    <p>${clientAddr}</p>
  </div>
  <div class="meta-block">
    <label>Issue Date</label>
    <p>${fmtDate(invoice.issueDate)}</p>
  </div>
  ${invoice.dueDate ? `<div class="meta-block"><label>Due Date</label><p>${fmtDate(invoice.dueDate)}</p></div>` : ''}
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th class="num">Qty / Hrs</th>
      <th class="num">Rate</th>
      <th class="num">Amount</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <table class="totals-table">
    <tr><td>Subtotal</td><td class="num">${fmt(invoice.subtotal)}</td></tr>
    ${invoice.taxRate ? `<tr><td>Tax (${(Number(invoice.taxRate) * 100).toFixed(2)}%)</td><td class="num">${fmt(invoice.taxAmount)}</td></tr>` : ''}
    <tr class="total-row"><td>Total</td><td class="num">${fmt(invoice.total)}</td></tr>
  </table>
</div>

${invoice.notes ? `<div class="notes"><label>Notes</label>${invoice.notes}</div>` : ''}
</body>
</html>`;
  }
}
