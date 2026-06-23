import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

const tableHeadStyles = { fillColor: [124, 58, 237] as [number, number, number], textColor: 255 };
const tableFootStyles = {
  fillColor: [245, 245, 245] as [number, number, number],
  textColor: 0,
  fontStyle: 'bold' as const,
};

export async function exportInvoiceReportPdf(data: InvoiceReportExportData): Promise<void> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Invoice Report', margin, y);
  y += 22;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`Period: ${data.periodLabel}`, margin, y);
  y += 16;

  if (data.filterSummary) {
    pdf.text(data.filterSummary, margin, y);
    y += 16;
  }

  pdf.text(
    `Total invoiced: ${formatAmount(data.summary.total)} | Invoices: ${data.summary.count} | Paid: ${data.summary.paidCount} | Draft / Sent: ${data.summary.draftCount} / ${data.summary.sentCount}`,
    margin,
    y,
  );
  y += 24;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Totals by client', margin, y);
  y += 14;

  autoTable(pdf, {
    startY: y,
    head: [['Client', 'Invoices', 'Total', 'Paid', 'Sent', 'Draft']],
    body: data.byClient.map((row) => [
      row.clientName,
      String(row.invoiceCount),
      formatAmount(row.total),
      formatAmount(row.paid),
      formatAmount(row.sent),
      formatAmount(row.draft),
    ]),
    foot: [
      [
        'Total',
        String(data.summary.count),
        formatAmount(data.summary.total),
        '',
        '',
        '',
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: tableHeadStyles,
    footStyles: tableFootStyles,
  });

  const afterClientTable = getAutoTableFinalY(pdf) + 24;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Invoices in period', margin, afterClientTable - 10);

  autoTable(pdf, {
    startY: afterClientTable,
    head: [['Number', 'Client', 'Issue date', 'Total', 'Status']],
    body: data.invoices.map((inv) => [
      inv.displayNumber,
      inv.clientName,
      inv.issueDate,
      formatAmount(inv.total),
      inv.status,
    ]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: tableHeadStyles,
  });

  pdf.save(`${data.filenameBase}.pdf`);
}

export function exportInvoiceReportExcel(data: InvoiceReportExportData): void {
  const summaryLines: string[][] = [
    ['Invoice Report'],
    ['Period', data.periodLabel],
  ];

  if (data.filterSummary) {
    summaryLines.push(['Filters', data.filterSummary]);
  }

  summaryLines.push(
    ['Total invoiced', formatAmount(data.summary.total)],
    ['Invoices', String(data.summary.count)],
    ['Paid (count)', String(data.summary.paidCount)],
    ['Draft (count)', String(data.summary.draftCount)],
    ['Sent (count)', String(data.summary.sentCount)],
    [],
    ['Totals by client'],
    ['Client', 'Invoices', 'Total', 'Paid', 'Sent', 'Draft'],
  );

  const clientRows = data.byClient.map((row) => [
    row.clientName,
    row.invoiceCount,
    row.total,
    row.paid,
    row.sent,
    row.draft,
  ]);

  const clientFooter = ['Total', data.summary.count, data.summary.total, '', '', ''];

  const invoiceSection: string[][] = [
    [],
    ['Invoices in period'],
    ['Number', 'Client', 'Issue date', 'Total', 'Status'],
  ];

  const invoiceRows = data.invoices.map((inv) => [
    inv.displayNumber,
    inv.clientName,
    inv.issueDate,
    inv.total,
    inv.status,
  ]);

  const sheetData = [
    ...summaryLines,
    ...clientRows,
    clientFooter,
    ...invoiceSection,
    ...invoiceRows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice report');
  XLSX.writeFile(workbook, `${data.filenameBase}.xlsx`);
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function getAutoTableFinalY(pdf: jsPDF): number {
  return (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
}
