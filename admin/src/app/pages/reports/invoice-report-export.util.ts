import * as XLSX from 'xlsx';
import {
  downloadPdfDocument,
  pdfBaseDocument,
  pdfDataTable,
  pdfMetaLines,
  pdfSectionTitle,
} from '../../core/pdfmake-browser.util';

export type InvoiceClientExportRow = {
  clientName: string;
  invoiceCount: number;
  total: number;
  paid: number;
  sent: number;
  draft: number;
};

export type InvoiceExportRow = {
  displayNumber: string;
  clientName: string;
  issueDate: string;
  issueDateIso: string;
  total: number;
  status: string;
};

export type InvoiceReportExportData = {
  periodLabel: string;
  filterSummary?: string;
  summary: {
    total: number;
    count: number;
    paidCount: number;
    draftCount: number;
    sentCount: number;
  };
  byClient: InvoiceClientExportRow[];
  invoices: InvoiceExportRow[];
  filenameBase: string;
};

export async function exportInvoiceReportPdf(data: InvoiceReportExportData): Promise<void> {
  const summaryLine = `Total invoiced: ${formatAmount(data.summary.total)} | Invoices: ${data.summary.count} | Paid: ${data.summary.paidCount} | Draft / Sent: ${data.summary.draftCount} / ${data.summary.sentCount}`;
  const meta = [`Period: ${data.periodLabel}`, ...(data.filterSummary ? [data.filterSummary] : []), summaryLine];

  const doc = pdfBaseDocument(
    [
      { text: 'Invoice Report', style: 'title', margin: [0, 0, 0, 8] },
      ...pdfMetaLines(meta),
      pdfSectionTitle('Totals by client', 16),
      pdfDataTable(
        ['Client', 'Invoices', 'Total', 'Paid', 'Sent', 'Draft'],
        data.byClient.map((row) => [
          row.clientName,
          String(row.invoiceCount),
          formatAmount(row.total),
          formatAmount(row.paid),
          formatAmount(row.sent),
          formatAmount(row.draft),
        ]),
        {
          foot: [['Total', String(data.summary.count), formatAmount(data.summary.total), '', '', '']],
          numericColumns: [1, 2, 3, 4, 5],
        },
      ),
      pdfSectionTitle('Invoices in period', 8),
      pdfDataTable(
        ['Number', 'Client', 'Issue date', 'Total', 'Status'],
        data.invoices.map((inv) => [inv.displayNumber, inv.clientName, inv.issueDate, formatAmount(inv.total), inv.status]),
        { numericColumns: [3] },
      ),
    ],
    { pageOrientation: 'landscape' },
  );

  await downloadPdfDocument(doc, `${data.filenameBase}.pdf`);
}

export function exportInvoiceReportExcel(data: InvoiceReportExportData): void {
  const summaryLines: (string | number)[][] = [
    ['Invoice Report'],
    ['Period', data.periodLabel],
  ];

  if (data.filterSummary) {
    summaryLines.push(['Filters', data.filterSummary]);
  }

  summaryLines.push(
    ['Total invoiced', formatAmount(data.summary.total)],
    ['Invoices', data.summary.count],
    ['Paid (count)', data.summary.paidCount],
    ['Draft (count)', data.summary.draftCount],
    ['Sent (count)', data.summary.sentCount],
    [],
    ['Totals by client'],
    ['Client', 'Invoices', 'Total', 'Paid', 'Sent', 'Draft'],
    ...data.byClient.map((row) => [
      row.clientName,
      row.invoiceCount,
      row.total,
      row.paid,
      row.sent,
      row.draft,
    ]),
    ['Total', data.summary.count, data.summary.total, '', '', ''],
  );

  const entryRows: (string | number)[][] = [
    ['Number', 'Client', 'Issue date', 'Total', 'Status'],
    ...data.invoices.map((inv) => [
      inv.displayNumber,
      inv.clientName,
      inv.issueDateIso,
      inv.total,
      inv.status,
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryLines);
  const entriesSheet = XLSX.utils.aoa_to_sheet(entryRows);
  entriesSheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, entriesSheet, 'Entries');
  XLSX.writeFile(workbook, `${data.filenameBase}.xlsx`);
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
