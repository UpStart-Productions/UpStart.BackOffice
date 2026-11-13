import { formatCurrency, type HelpAgentReport, type HelpAgentReportBlock, type HelpAgentReportCell } from '@upstart/back-office/shared';
import { downloadPdfDocument, pdfBaseDocument, pdfDataTable, pdfMetaLines, pdfSectionTitle } from '../../core/pdfmake-browser.util';

type TableBlock = Extract<HelpAgentReportBlock, { type: 'table' }>;

/** A table cell as shown in the viewer and the PDF: money as $1,234.00, numbers as is, empty as nothing. */
export function reportCellText(block: TableBlock, col: number, value: HelpAgentReportCell): string {
  if (value === null || value === undefined) return '';
  return block.columns[col]?.kind === 'money' ? formatCurrency(value) : String(value);
}

/** The total row's text per column ("Total" in the first non-numeric column), or null when nothing sums. */
export function reportTotalsRow(block: TableBlock): string[] | null {
  if (!block.rows.length || !block.totals.some((t) => t !== null)) return null;
  const labelAt = block.columns.findIndex((c) => c.kind !== 'money' && c.kind !== 'number');
  return block.columns.map((c, i) => {
    if (i === labelAt) return `Total (${block.rows.length})`;
    const t = block.totals[i];
    return t === null ? '' : c.kind === 'money' ? formatCurrency(t) : String(t);
  });
}

const fileName = (title: string) =>
  title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'report';

/** The report as a PDF, from exactly what the viewer shows. Wide tables switch the page to landscape. */
export async function exportHelpAgentReportPdf(report: HelpAgentReport): Promise<void> {
  const content: Record<string, unknown>[] = [{ text: report.title, style: 'title', margin: [0, 0, 0, 8] }, ...pdfMetaLines(report.meta)];
  for (const b of report.blocks) {
    if (b.type === 'heading') content.push(pdfSectionTitle(b.text, 16));
    else if (b.type === 'text') content.push({ text: b.text, style: 'body', margin: [0, 8, 0, 8] });
    else if (b.type === 'table') {
      if (b.title) content.push(pdfSectionTitle(b.title, 12));
      const numeric = b.columns.map((c, i) => (c.kind === 'money' || c.kind === 'number' ? i : -1)).filter((i) => i >= 0);
      const totals = reportTotalsRow(b);
      content.push(
        pdfDataTable(
          b.columns.map((c) => c.label),
          b.rows.map((r) => r.map((v, i) => reportCellText(b, i, v))),
          { numericColumns: numeric, ...(totals ? { foot: [totals] } : {}) },
        ),
      );
    } else {
      if (b.title) content.push(pdfSectionTitle(b.title, 12));
      for (const e of b.entries) {
        const head = [e.date, e.who, e.kind].filter(Boolean).join('  ·  ');
        content.push({
          stack: [
            { text: head, style: 'bodyBold' },
            ...(e.subject ? [{ text: e.subject, style: 'body', italics: true }] : []),
            ...(e.text ? [{ text: e.text, style: 'bodySm', margin: [0, 2, 0, 0] }] : []),
          ],
          margin: [0, 8, 0, 4],
          unbreakable: e.text.length < 1200,
        });
      }
    }
  }
  if (report.sources.length) {
    content.push({ text: `Built by the Back Office guide from: ${report.sources.join(', ')}. ${new Date(report.createdAt).toLocaleString()}`, style: 'bodySm', color: '#6b7280', margin: [0, 16, 0, 0] });
  }
  const wide = report.blocks.some((b) => b.type === 'table' && b.columns.length > 5);
  await downloadPdfDocument(pdfBaseDocument(content, { pageOrientation: wide ? 'landscape' : 'portrait' }), fileName(report.title));
}
