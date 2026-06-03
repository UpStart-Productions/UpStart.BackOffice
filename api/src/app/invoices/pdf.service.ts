import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { getUpstartLogoDataUri } from './brand-logo';

type Numeric = { toString(): string } | number;

type LineItem = {
  description: string;
  quantity: Numeric;
  unitPrice: Numeric;
  amount: Numeric;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
};

type InvoiceData = {
  displayNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  subtotal: Numeric;
  taxRate?: Numeric | null;
  taxAmount?: Numeric | null;
  total: Numeric;
  client: { name: string; email?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null };
  lineItems: LineItem[];
};

function fmt(val: Numeric | null | undefined): string {
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
    const logoUri = getUpstartLogoDataUri();
    const logoHtml = logoUri
      ? `<img src="${logoUri}" alt="UpStart" style="height:48px;width:auto;display:block;margin-bottom:8px;" />`
      : `<div class="company">${fromName}</div>`;

    const projectSections = buildProjectSections(invoice.lineItems);

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
  body { font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #2d2d2d; background: #ffffff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .company { font-size: 22px; font-weight: 600; color: #2d2d2d; }
  .invoice-label { font-size: 28px; font-weight: 500; color: #6b6b6b; }
  .invoice-number { font-size: 18px; font-weight: 600; color: #7c3aed; }
  .meta { display: flex; gap: 48px; margin-bottom: 40px; }
  .meta-block label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b6b6b; display: block; margin-bottom: 4px; }
  .meta-block p { font-size: 14px; color: #2d2d2d; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #f5f3ff; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #5b21b6; border-bottom: 2px solid #ddd6fe; }
  td { padding: 10px 12px; border-bottom: 1px solid #eaeaea; vertical-align: top; }
  td.desc { white-space: pre-line; }
  .num { text-align: right; }
  .project-section { margin-bottom: 28px; }
  .project-heading { font-size: 15px; font-weight: 600; color: #5b21b6; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #ddd6fe; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-table { min-width: 280px; }
  .totals-table td { border: none; padding: 4px 12px; }
  .totals-table .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #7c3aed; padding-top: 10px; margin-top: 6px; color: #2d2d2d; }
  .notes { margin-top: 32px; padding: 16px; background: #ffffff; border-radius: 6px; font-size: 13px; color: #6b6b6b; border: 1px solid #eaeaea; }
  .notes label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b6b6b; display: block; margin-bottom: 6px; }
</style>
</head>
<body>
<div class="header">
  <div>
    ${logoHtml}
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

${projectSections}

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildProjectSections(lineItems: LineItem[]): string {
  const tableHead = `
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty / Hrs</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr>
    </thead>`;

  const groupMap = new Map<string, { projectId: string | null; projectName: string; items: LineItem[] }>();
  for (const item of lineItems) {
    const projectId = item.projectId ?? item.project?.id ?? null;
    const key = projectId ?? '__none__';
    let group = groupMap.get(key);
    if (!group) {
      group = {
        projectId,
        projectName: item.project?.name ?? 'Other',
        items: [],
      };
      groupMap.set(key, group);
    }
    group.items.push(item);
  }

  const groups = [...groupMap.values()].sort((a, b) =>
    a.projectName.localeCompare(b.projectName),
  );

  return groups.map((group) => {
    const rows = group.items.map((item) => `
      <tr>
        <td class="desc">${escapeHtml(item.description)}</td>
        <td class="num">${Number(item.quantity).toFixed(2)}</td>
        <td class="num">${fmt(item.unitPrice)}</td>
        <td class="num">${fmt(item.amount)}</td>
      </tr>`).join('');

    const heading = group.projectId
      ? `<div class="project-heading">${escapeHtml(group.projectName)}</div>`
      : '';

    return `
      <div class="project-section">
        ${heading}
        <table>
          ${tableHead}
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');
}
