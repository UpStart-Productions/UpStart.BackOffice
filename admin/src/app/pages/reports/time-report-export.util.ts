import * as XLSX from 'xlsx';
import { formatDurationMin } from '../time-entry/timesheet.utils';
import {
  downloadPdfDocument,
  pdfBaseDocument,
  pdfChartRow,
  pdfDataTable,
  pdfMetaLines,
  pdfSectionTitle,
} from '../../core/pdfmake-browser.util';

export type TimeReportRow = {
  clientName: string;
  projectName: string;
  totalMin: number;
  billableMin: number;
  nonBillableMin: number;
  entryCount: number;
};

export type TimeReportEntryRow = {
  date: string;
  dateIso: string;
  clientName: string;
  projectName: string;
  taskName: string;
  description: string;
  durationMin: number;
  billable: boolean;
};

export type TimeReportChartImage = {
  title: string;
  imageDataUrl: string;
};

export type TimeReportExportData = {
  periodLabel: string;
  filterSummary?: string;
  summary: {
    totalMin: number;
    billableMin: number;
    nonBillableMin: number;
    entryCount: number;
  };
  rows: TimeReportRow[];
  entries: TimeReportEntryRow[];
  charts: {
    total?: TimeReportChartImage;
    billable?: TimeReportChartImage;
    nonBillable?: TimeReportChartImage;
  };
  filenameBase: string;
};

export async function exportTimeReportPdf(data: TimeReportExportData): Promise<void> {
  const summaryLine = `Total: ${formatDurationMin(data.summary.totalMin)} | Billable: ${formatDurationMin(data.summary.billableMin)} | Non-billable: ${formatDurationMin(data.summary.nonBillableMin)}`;
  const meta = [`Period: ${data.periodLabel}`, ...(data.filterSummary ? [data.filterSummary] : []), summaryLine];

  const chartEntries = [data.charts.total, data.charts.billable, data.charts.nonBillable].filter(
    (c): c is TimeReportChartImage => Boolean(c),
  );
  const chartBlock = pdfChartRow(chartEntries, { pageOrientation: 'landscape' });

  const doc = pdfBaseDocument(
    [
      { text: 'Time Report', style: 'title', margin: [0, 0, 0, 8] },
      ...pdfMetaLines(meta),
      ...(chartBlock ? [chartBlock] : []),
      pdfSectionTitle('Hours by project', chartBlock ? 0 : 16),
      pdfDataTable(
        ['Client', 'Project', 'Total', 'Billable', 'Non-billable', 'Entries'],
        data.rows.map((row) => [
          row.clientName,
          row.projectName,
          formatDurationMin(row.totalMin),
          formatDurationMin(row.billableMin),
          formatDurationMin(row.nonBillableMin),
          String(row.entryCount),
        ]),
        {
          foot: [
            [
              'Total',
              '',
              formatDurationMin(data.summary.totalMin),
              formatDurationMin(data.summary.billableMin),
              formatDurationMin(data.summary.nonBillableMin),
              String(data.summary.entryCount),
            ],
          ],
          numericColumns: [2, 3, 4, 5],
        },
      ),
      pdfSectionTitle('Time entries', 8),
      pdfDataTable(
        ['Date', 'Client', 'Project', 'Task', 'Description', 'Duration', 'Billable'],
        data.entries.map((entry) => [
          entry.date,
          entry.clientName,
          entry.projectName,
          entry.taskName,
          entry.description,
          formatDurationMin(entry.durationMin),
          entry.billable ? 'Yes' : 'No',
        ]),
        {
          foot: [['Total', '', '', '', '', formatDurationMin(data.summary.totalMin), '']],
          widths: ['auto', '*', '*', 90, 150, 'auto', 'auto'],
          fontSize: 8,
          numericColumns: [5],
        },
      ),
    ],
    { pageOrientation: 'landscape' },
  );

  await downloadPdfDocument(doc, `${data.filenameBase}.pdf`);
}

export function exportTimeReportExcel(data: TimeReportExportData): void {
  const summaryLines: (string | number)[][] = [
    ['Time Report'],
    ['Period', data.periodLabel],
  ];

  if (data.filterSummary) {
    summaryLines.push(['Filters', data.filterSummary]);
  }

  summaryLines.push(
    ['Total hours', formatDurationMin(data.summary.totalMin)],
    ['Billable hours', formatDurationMin(data.summary.billableMin)],
    ['Non-billable hours', formatDurationMin(data.summary.nonBillableMin)],
    ['Entries', data.summary.entryCount],
    [],
    ['Hours by project'],
    ['Client', 'Project', 'Total', 'Billable', 'Non-billable', 'Entries'],
    ...data.rows.map((row) => [
      row.clientName,
      row.projectName,
      formatDurationMin(row.totalMin),
      formatDurationMin(row.billableMin),
      formatDurationMin(row.nonBillableMin),
      row.entryCount,
    ]),
    [
      'Total',
      '',
      formatDurationMin(data.summary.totalMin),
      formatDurationMin(data.summary.billableMin),
      formatDurationMin(data.summary.nonBillableMin),
      data.summary.entryCount,
    ],
  );

  const entryRows: (string | number)[][] = [
    ['Date', 'Client', 'Project', 'Task', 'Description', 'Duration', 'Billable'],
    ...data.entries.map((entry) => [
      entry.dateIso,
      entry.clientName,
      entry.projectName,
      entry.taskName,
      entry.description,
      formatDurationMin(entry.durationMin),
      entry.billable ? 'Yes' : 'No',
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryLines);
  const entriesSheet = XLSX.utils.aoa_to_sheet(entryRows);
  entriesSheet['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 28 },
    { wch: 24 },
    { wch: 40 },
    { wch: 10 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, entriesSheet, 'Entries');
  XLSX.writeFile(workbook, `${data.filenameBase}.xlsx`);
}
