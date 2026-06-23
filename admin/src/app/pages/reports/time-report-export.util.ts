import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDurationMin } from '../time-entry/timesheet.utils';

export type TimeReportRow = {
  clientName: string;
  projectName: string;
  totalMin: number;
  billableMin: number;
  nonBillableMin: number;
  entryCount: number;
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
  charts: {
    total?: TimeReportChartImage;
    billable?: TimeReportChartImage;
    nonBillable?: TimeReportChartImage;
  };
  filenameBase: string;
};

export async function exportTimeReportPdf(data: TimeReportExportData): Promise<void> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = margin;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Time Report', margin, y);
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
    `Total: ${formatDurationMin(data.summary.totalMin)} | Billable: ${formatDurationMin(data.summary.billableMin)} | Non-billable: ${formatDurationMin(data.summary.nonBillableMin)}`,
    margin,
    y,
  );
  y += 24;

  const chartEntries = [
    data.charts.total,
    data.charts.billable,
    data.charts.nonBillable,
  ].filter((c): c is TimeReportChartImage => Boolean(c));

  if (chartEntries.length > 0) {
    const gap = 12;
    const slotWidth = (pageWidth - margin * 2 - gap * (chartEntries.length - 1)) / chartEntries.length;
    const chartAreaHeight = 130;
    let x = margin;

    for (const chart of chartEntries) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(chart.title, x, y, { maxWidth: slotWidth });

      const img = await loadImage(chart.imageDataUrl);
      const maxImgHeight = chartAreaHeight - 16;
      const scale = Math.min(slotWidth / img.width, maxImgHeight / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      pdf.addImage(chart.imageDataUrl, 'PNG', x, y + 14, width, height);
      x += slotWidth + gap;
    }

    y += chartAreaHeight + 20;
  }

  autoTable(pdf, {
    startY: y,
    head: [['Client', 'Project', 'Total', 'Billable', 'Non-billable', 'Entries']],
    body: data.rows.map((row) => [
      row.clientName,
      row.projectName,
      formatDurationMin(row.totalMin),
      formatDurationMin(row.billableMin),
      formatDurationMin(row.nonBillableMin),
      String(row.entryCount),
    ]),
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
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255 },
    footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold' },
  });

  pdf.save(`${data.filenameBase}.pdf`);
}

export function exportTimeReportExcel(data: TimeReportExportData): void {
  const summaryLines: string[][] = [
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
    ['Entries', String(data.summary.entryCount)],
    [],
    ['Hours by project'],
    ['Client', 'Project', 'Total', 'Billable', 'Non-billable', 'Entries'],
  );

  const tableRows = data.rows.map((row) => [
    row.clientName,
    row.projectName,
    formatDurationMin(row.totalMin),
    formatDurationMin(row.billableMin),
    formatDurationMin(row.nonBillableMin),
    row.entryCount,
  ]);

  const footerRow = [
    'Total',
    '',
    formatDurationMin(data.summary.totalMin),
    formatDurationMin(data.summary.billableMin),
    formatDurationMin(data.summary.nonBillableMin),
    data.summary.entryCount,
  ];

  const sheetData = [...summaryLines, ...tableRows, footerRow];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Time report');
  XLSX.writeFile(workbook, `${data.filenameBase}.xlsx`);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load chart image'));
    img.src = dataUrl;
  });
}
