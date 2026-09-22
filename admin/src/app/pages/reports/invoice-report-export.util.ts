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

const tableLineColor: [number, number, number] = [243, 243, 243];
const tableHeadStyles = {
  fillColor: [124, 58, 237] as [number, number, number],
  textColor: 255,
  lineColor: tableLineColor,
};
const tableFootStyles = {
  fillColor: [245, 245, 245] as [number, number, number],
  textColor: 0,
  fontStyle: 'bold' as const,
  lineColor: tableLineColor,
};
const tableCellStyles = {
  lineColor: tableLineColor,
  lineWidth: 0.4,
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
    styles: { fontSize: 9, cellPadding: 4, ...tableCellStyles },
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
    styles: { fontSize: 9, cellPadding: 4, ...tableCellStyles },
    headStyles: tableHeadStyles,
  });

  pdf.save(`${data.filenameBase}.pdf`);
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

function getAutoTableFinalY(pdf: jsPDF): number {
  return (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
}
