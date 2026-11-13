/** Client-side PDF exports (Reports, form submissions) — same pdfmake stack as API invoices. */

type PdfCell = Record<string, unknown>;
type PdfContent = Record<string, unknown>;
export type PdfDocumentDefinition = {
  pageSize?: string;
  pageOrientation?: 'portrait' | 'landscape';
  pageMargins?: number[];
  defaultStyle?: Record<string, unknown>;
  styles?: Record<string, Record<string, unknown>>;
  content: PdfContent[];
};

const TABLE_BORDER = '#f3f3f3';
const TABLE_HEAD_BG = '#7c3aed';
const TABLE_FOOT_BG = '#f5f5f5';

export const exportPdfStyles: PdfDocumentDefinition['styles'] = {
  title: { fontSize: 18, bold: true },
  meta: { fontSize: 11, lineHeight: 1.35 },
  sectionTitle: { fontSize: 12, bold: true },
  subsection: { fontSize: 14, bold: true },
  body: { fontSize: 11, lineHeight: 1.35 },
  bodyBold: { fontSize: 11, bold: true, lineHeight: 1.35 },
  bodySm: { fontSize: 10, lineHeight: 1.35 },
};

type PdfMakeInstance = {
  vfs?: Record<string, string>;
  createPdf: (doc: PdfDocumentDefinition) => { download: (name: string) => void };
};

let pdfMakeReady: Promise<PdfMakeInstance> | null = null;

async function getPdfMake(): Promise<PdfMakeInstance> {
  if (!pdfMakeReady) {
    pdfMakeReady = (async () => {
      const pdfMakeModule = await import('pdfmake/build/pdfmake');
      const pdfMake = pdfMakeModule.default as PdfMakeInstance;
      const fontsModule = await import('pdfmake/build/vfs_fonts');
      const mod = fontsModule as {
        pdfMake?: { vfs: Record<string, string> };
        default?: { pdfMake?: { vfs: Record<string, string> } };
      };
      pdfMake.vfs = mod.pdfMake?.vfs ?? mod.default?.pdfMake?.vfs ?? pdfMake.vfs;
      return pdfMake;
    })();
  }
  return pdfMakeReady;
}

export async function downloadPdfDocument(doc: PdfDocumentDefinition, filename: string): Promise<void> {
  const pdfMake = await getPdfMake();
  pdfMake.createPdf(doc).download(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function pdfMetaLines(lines: string[]): PdfContent[] {
  return lines.filter(Boolean).map((text) => ({ text, style: 'meta' }));
}

export function pdfSectionTitle(text: string, marginTop = 12): PdfContent {
  return { text, style: 'sectionTitle', margin: [0, marginTop, 0, 6] };
}

const gridLayout = {
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => TABLE_BORDER,
  vLineColor: () => TABLE_BORDER,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

function numericCell(cell: PdfCell, col: number, rightCols: Set<number>): PdfCell {
  if (!rightCols.has(col)) return cell;
  return { ...cell, alignment: 'right', fontVariantNumeric: 'tabular-nums' };
}

function headCells(labels: string[], fontSize: number, rightCols: Set<number>): PdfCell[] {
  return labels.map((text, col) =>
    numericCell(
      {
        text,
        bold: true,
        color: '#ffffff',
        fillColor: TABLE_HEAD_BG,
        fontSize,
      },
      col,
      rightCols,
    ),
  );
}

function bodyCells(rows: (string | number)[][], fontSize: number, rightCols: Set<number>): PdfCell[][] {
  return rows.map((row) => row.map((cell, col) => numericCell({ text: String(cell ?? ''), fontSize }, col, rightCols)));
}

function footCells(rows: (string | number)[][], fontSize: number, rightCols: Set<number>): PdfCell[][] {
  return rows.map((row) =>
    row.map((cell, col) =>
      numericCell(
        {
          text: String(cell ?? ''),
          bold: true,
          fillColor: TABLE_FOOT_BG,
          fontSize,
        },
        col,
        rightCols,
      ),
    ),
  );
}

export function pdfDataTable(
  head: string[],
  body: (string | number)[][],
  options?: {
    foot?: (string | number)[][];
    widths?: (string | number)[];
    fontSize?: number;
    /** 0-based column indexes aligned right (counts, money, duration, etc.). */
    numericColumns?: number[];
  },
): PdfContent {
  const fontSize = options?.fontSize ?? 9;
  const rightCols = new Set(options?.numericColumns ?? []);
  return {
    table: {
      headerRows: 1,
      widths: options?.widths ?? head.map(() => '*'),
      body: [
        headCells(head, fontSize, rightCols),
        ...bodyCells(body, fontSize, rightCols),
        ...footCells(options?.foot ?? [], fontSize, rightCols),
      ],
    },
    layout: gridLayout,
    margin: [0, 0, 0, 16],
  };
}

export function pdfChartRow(
  charts: { title: string; imageDataUrl: string }[],
  options?: { pageOrientation?: 'portrait' | 'landscape'; marginPt?: number; imageHeight?: number },
): PdfContent | null {
  if (!charts.length) return null;
  const landscape = options?.pageOrientation === 'landscape';
  const pageWidth = landscape ? 842 : 595;
  const marginPt = options?.marginPt ?? 40;
  const contentWidth = pageWidth - marginPt * 2;
  const columnGap = 12;
  const slotWidth = (contentWidth - columnGap * (charts.length - 1)) / charts.length;
  const imageHeight = options?.imageHeight ?? 130;

  return {
    columns: charts.map((chart) => ({
      width: slotWidth,
      stack: [
        { text: chart.title, style: 'bodyBold', margin: [0, 0, 0, 6] },
        {
          image: chart.imageDataUrl,
          width: slotWidth,
          height: imageHeight,
          fit: [slotWidth, imageHeight],
          margin: [0, 0, 0, 0],
        },
      ],
    })),
    columnGap,
    margin: [0, 8, 0, 20],
  };
}

export function pdfBaseDocument(
  content: PdfContent[],
  options?: { pageSize?: string; pageOrientation?: 'portrait' | 'landscape'; margins?: number[] },
): PdfDocumentDefinition {
  return {
    pageSize: options?.pageSize ?? 'A4',
    pageOrientation: options?.pageOrientation ?? 'portrait',
    pageMargins: options?.margins ?? [40, 40, 40, 40],
    defaultStyle: { font: 'Roboto', fontSize: 11 },
    styles: exportPdfStyles,
    content,
  };
}
