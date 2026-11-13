import htmlToPdfmake from 'html-to-pdfmake';
import { JSDOM } from 'jsdom';
import PdfPrinter from 'pdfmake';

/** pdfmake ships without published TypeScript definitions */
type Content = Record<string, unknown>;
type StyleDictionary = Record<string, Record<string, unknown>>;
type TDocumentDefinitions = {
  pageSize?: string;
  pageMargins?: number[];
  defaultStyle?: Record<string, unknown>;
  styles?: StyleDictionary;
  content: Content[];
};

const BRAND_PURPLE = '#7c3aed';
const BRAND_PURPLE_DARK = '#5b21b6';
const MUTED = '#6b6b6b';
const TEXT = '#2d2d2d';
const TABLE_HEAD_BG = '#f5f3ff';
const TABLE_BORDER = '#eaeaea';

const pdfStyles: StyleDictionary = {
  invoiceLabel: { fontSize: 22, color: MUTED },
  invoiceNumber: { fontSize: 14, bold: true, color: BRAND_PURPLE },
  metaLabel: { fontSize: 9, color: MUTED, bold: true },
  metaValue: { fontSize: 11, color: TEXT },
  companyName: { fontSize: 16, bold: true, color: TEXT },
  fromDetails: { fontSize: 10, color: MUTED },
  projectHeading: { fontSize: 12, bold: true, color: BRAND_PURPLE_DARK, margin: [0, 12, 0, 6] },
  tableHeader: { fontSize: 9, bold: true, color: BRAND_PURPLE_DARK },
  tableCell: { fontSize: 10, color: TEXT },
  notesLabel: { fontSize: 9, color: MUTED, bold: true, margin: [0, 16, 0, 4] },
  payNote: { fontSize: 9, color: MUTED, alignment: 'center', margin: [0, 6, 0, 0] },
};

const pdfFonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

export type InvoicePdfLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  projectId?: string | null;
  projectName?: string | null;
};

export type InvoicePdfInput = {
  displayNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  subtotal: number;
  taxRate?: number | null;
  taxAmount?: number | null;
  total: number;
  billToLines: string[];
  fromDisplayName: string;
  fromDetailsLines: string[];
  logoImage?: string | null;
  lineItems: InvoicePdfLineItem[];
  payUrl?: string | null;
};

export function renderInvoicePdfBuffer(input: InvoicePdfInput): Promise<Buffer> {
  const doc = buildDocument(input);
  const printer = new PdfPrinter(pdfFonts);
  const pdfDoc = printer.createPdfKitDocument(doc);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

function buildDocument(input: InvoicePdfInput): TDocumentDefinitions {
  const headerLeft: Content[] = [];
  if (input.logoImage) {
    headerLeft.push({ image: input.logoImage, width: 140, margin: [0, 0, 0, 6] });
  } else {
    headerLeft.push({ text: input.fromDisplayName, style: 'companyName', margin: [0, 0, 0, 4] });
  }
  if (input.fromDetailsLines.length) {
    headerLeft.push({ text: input.fromDetailsLines.join('\n'), style: 'fromDetails' });
  }

  const metaBlocks: Content[] = [
    {
      stack: [
        { text: 'Bill To', style: 'metaLabel' },
        { text: input.billToLines.join('\n'), style: 'metaValue', margin: [0, 2, 0, 0] },
      ],
    },
    {
      stack: [
        { text: 'Issue Date', style: 'metaLabel' },
        { text: fmtDate(input.issueDate), style: 'metaValue', margin: [0, 2, 0, 0] },
      ],
    },
  ];
  if (input.dueDate) {
    metaBlocks.push({
      stack: [
        { text: 'Due Date', style: 'metaLabel' },
        { text: fmtDate(input.dueDate), style: 'metaValue', margin: [0, 2, 0, 0] },
      ],
    });
  }

  const content: Content[] = [
    {
      columns: [
        { width: '*', stack: headerLeft },
        {
          width: 'auto',
          alignment: 'right',
          stack: [
            { text: 'Invoice', style: 'invoiceLabel' },
            { text: input.displayNumber, style: 'invoiceNumber', margin: [0, 4, 0, 0] },
          ],
        },
      ],
      margin: [0, 0, 0, 24],
    },
    { columns: metaBlocks, columnGap: 24, margin: [0, 0, 0, 20] },
    ...buildLineItemSections(input.lineItems),
    buildTotalsTable(input),
  ];

  if (hasNotes(input.notes)) {
    content.push({ text: 'Notes', style: 'notesLabel' });
    content.push(...notesToContent(input.notes!));
  }

  if (input.payUrl) {
    content.push({
      margin: [0, 20, 0, 0],
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: 'Securely Pay Invoice',
              link: input.payUrl,
              color: '#ffffff',
              bold: true,
              fontSize: 11,
              alignment: 'center',
            },
          ],
        ],
      },
      layout: payButtonLayout(),
    });
    content.push({
      text: 'This opens a secure payment page. Stripe handles the transaction. UpStart Productions does not see or store your card or bank information.',
      style: 'payNote',
    });
  }

  return {
    pageSize: 'LETTER',
    pageMargins: [54, 54, 54, 54],
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: TEXT },
    styles: pdfStyles,
    content,
  };
}

function payButtonLayout() {
  return {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    paddingLeft: () => 20,
    paddingRight: () => 20,
    paddingTop: () => 10,
    paddingBottom: () => 10,
    fillColor: () => BRAND_PURPLE,
  };
}

function buildLineItemSections(items: InvoicePdfLineItem[]): Content[] {
  const groupMap = new Map<string, { projectId: string | null; projectName: string; items: InvoicePdfLineItem[] }>();
  for (const item of items) {
    const projectId = item.projectId ?? null;
    const key = projectId ?? '__none__';
    let group = groupMap.get(key);
    if (!group) {
      group = {
        projectId,
        projectName: item.projectName ?? 'Other',
        items: [],
      };
      groupMap.set(key, group);
    }
    group.items.push(item);
  }

  const sections: Content[] = [];
  for (const [key, group] of groupMap) {
    if (key !== '__none__') {
      sections.push({ text: group.projectName, style: 'projectHeading' });
    }
    sections.push({
      table: {
        headerRows: 1,
        widths: ['*', 56, 64, 72],
        body: [
          [
            { text: 'Description', style: 'tableHeader' },
            { text: 'Qty / Hrs', style: 'tableHeader', alignment: 'right' },
            { text: 'Rate', style: 'tableHeader', alignment: 'right' },
            { text: 'Amount', style: 'tableHeader', alignment: 'right' },
          ],
          ...group.items.map((item) => [
            { text: item.description, style: 'tableCell' },
            { text: item.quantity.toFixed(2), style: 'tableCell', alignment: 'right' },
            { text: fmtMoney(item.unitPrice), style: 'tableCell', alignment: 'right' },
            { text: fmtMoney(item.amount), style: 'tableCell', alignment: 'right' },
          ]),
        ],
      },
      layout: lineItemsTableLayout(),
      margin: [0, 0, 0, 8],
    });
  }
  return sections;
}

function lineItemsTableLayout() {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 || i === 1 || i === node.table.body.length ? 0.5 : 0.25,
    vLineWidth: () => 0,
    hLineColor: () => TABLE_BORDER,
    paddingLeft: () => 8,
    paddingRight: () => 8,
    paddingTop: () => 6,
    paddingBottom: () => 6,
    fillColor: (rowIndex: number) => (rowIndex === 0 ? TABLE_HEAD_BG : null),
  };
}

function buildTotalsTable(input: InvoicePdfInput): Content {
  const rows: Content[][] = [
    [
      { text: 'Subtotal', style: 'tableCell' },
      { text: fmtMoney(input.subtotal), style: 'tableCell', alignment: 'right' },
    ],
  ];
  if (input.taxRate) {
    rows.push([
      { text: `Tax (${(input.taxRate * 100).toFixed(2)}%)`, style: 'tableCell' },
      { text: fmtMoney(input.taxAmount ?? 0), style: 'tableCell', alignment: 'right' },
    ]);
  }
  rows.push([
    { text: 'Total', bold: true, style: 'tableCell' },
    { text: fmtMoney(input.total), bold: true, style: 'tableCell', alignment: 'right' },
  ]);

  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 220,
        table: { widths: ['*', 80], body: rows },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === node.table.body.length ? 2 : i === 0 ? 0 : 0.5,
          vLineWidth: () => 0,
          hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
            i === node.table.body.length ? BRAND_PURPLE : TABLE_BORDER,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      },
    ],
    margin: [0, 8, 0, 0],
  };
}

function notesToContent(html: string): Content[] {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const converted = htmlToPdfmake(html, {
    window: dom.window as unknown as Window,
    defaultStyles: {
      p: { margin: [0, 0, 0, 6], fontSize: 10, color: MUTED },
      a: { color: BRAND_PURPLE },
    },
  });
  if (Array.isArray(converted)) {
    return converted as Content[];
  }
  return [converted as Content];
}

export function hasInvoiceNotes(notes?: string | null): boolean {
  if (!notes?.trim()) return false;
  const text = notes
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  return text.length > 0;
}

function hasNotes(notes?: string | null): boolean {
  return hasInvoiceNotes(notes);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtMoney(n: number): string {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
