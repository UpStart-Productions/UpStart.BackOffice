/**
 * Reports the Back Office guide (JD) builds from records it looked up: shown in a large modal from a link in the
 * chat, and exported to PDF from the same data. The model sends the content through its make_report tool; the
 * API checks it with normalizeHelpAgentReport (sizes, kinds) and computes every total here, never the model.
 */

export const HELP_AGENT_REPORT_LIMITS = { blocks: 20, rows: 1000, columns: 10, entries: 1000, cell: 500, text: 20000, meta: 12 } as const;

export type HelpAgentReportColumnKind = 'text' | 'money' | 'number' | 'date';
export type HelpAgentReportCell = string | number | null;

export type HelpAgentReportBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | {
      type: 'table';
      title: string | null;
      columns: Array<{ label: string; kind: HelpAgentReportColumnKind }>;
      rows: HelpAgentReportCell[][];
      /** Per column: the sum for money and number columns, else null. Computed, never sent by the model. */
      totals: Array<number | null>;
    }
  | {
      type: 'conversation';
      title: string | null;
      entries: Array<{ date: string; who: string; kind: string | null; subject: string | null; text: string }>;
    };

export interface HelpAgentReport {
  id: string;
  title: string;
  /** Short lines under the title: who it is about, the period, filters. */
  meta: string[];
  /** What the guide looked up to build it, e.g. ["invoices"]. Shown on the report. */
  sources: string[];
  createdAt: string;
  blocks: HelpAgentReportBlock[];
}

const str = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, max);

/** A money or number cell as a number ("$1,250.00" -> 1250), or null when it isn't one. */
export function reportNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const neg = /^\s*\(.*\)\s*$/.test(v) || /^\s*-/.test(v);
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && /\d/.test(v) ? (neg ? -n : n) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The model's make_report input as a safe report: plain text only (tags dropped), sizes capped, unknown block
 * types dropped, money/number cells parsed to numbers, and totals computed. Throws when nothing usable is left.
 */
export function normalizeHelpAgentReport(input: unknown, opts: { id: string; sources: string[]; createdAt: string }): HelpAgentReport {
  const L = HELP_AGENT_REPORT_LIMITS;
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const title = str(src['title'], 200);
  if (!title) throw new Error('The report needs a title.');
  const meta = (Array.isArray(src['meta']) ? src['meta'] : []).map((m) => str(m, 300)).filter(Boolean).slice(0, L.meta);
  const blocks: HelpAgentReportBlock[] = [];
  for (const raw of (Array.isArray(src['blocks']) ? src['blocks'] : []).slice(0, L.blocks)) {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const type = b['type'];
    if (type === 'heading' || type === 'text') {
      const text = str(b['text'], type === 'heading' ? 200 : L.text);
      if (text) blocks.push({ type, text });
    } else if (type === 'table') {
      const columns = (Array.isArray(b['columns']) ? b['columns'] : []).slice(0, L.columns).map((c) => {
        const col = (c && typeof c === 'object' ? c : { label: c }) as Record<string, unknown>;
        const kind = ['text', 'money', 'number', 'date'].includes(String(col['kind'])) ? (col['kind'] as HelpAgentReportColumnKind) : 'text';
        return { label: str(col['label'], 80) || 'Column', kind };
      });
      if (!columns.length) continue;
      const rows = (Array.isArray(b['rows']) ? b['rows'] : []).slice(0, L.rows).map((r) => {
        const cells = Array.isArray(r) ? r : [];
        return columns.map((c, i): HelpAgentReportCell => {
          const v = cells[i];
          if (c.kind === 'money' || c.kind === 'number') return reportNumber(v);
          const s = str(v, L.cell);
          return s || null;
        });
      });
      const totals = columns.map((c, i) =>
        c.kind === 'money' || c.kind === 'number' ? round2(rows.reduce((n, r) => n + ((r[i] as number | null) ?? 0), 0)) : null,
      );
      blocks.push({ type: 'table', title: str(b['title'], 200) || null, columns, rows, totals });
    } else if (type === 'conversation') {
      const entries = (Array.isArray(b['entries']) ? b['entries'] : []).slice(0, L.entries).map((e) => {
        const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          date: str(x['date'], 40),
          who: str(x['who'], 200),
          kind: str(x['kind'], 40) || null,
          subject: str(x['subject'], 300) || null,
          text: str(x['text'], 5000),
        };
      }).filter((e) => e.text || e.subject);
      blocks.push({ type: 'conversation', title: str(b['title'], 200) || null, entries });
    }
  }
  if (!blocks.length) throw new Error('The report has no content. Add a table, conversation or text block.');
  return { id: opts.id, title, meta, sources: opts.sources, createdAt: opts.createdAt, blocks };
}

/** make_report's input schema (JSON Schema), given to the model as a tool. */
export const HELP_AGENT_REPORT_TOOL = {
  name: 'make_report',
  description:
    'Builds a report the person opens from a link in the chat (a large view with Export PDF). Use it only when they ask for a ' +
    'report, a PDF, or a printable/exportable list. First look up the records with your other tools, then call this once with ' +
    'the content. Use only values from those tool results; never estimate or invent rows. Do not compute totals: money and ' +
    'number columns are totaled automatically. Use a table for lists of records (invoices, time, submissions) and a ' +
    'conversation block for messages or activity (one entry per message, oldest first). No record IDs. After it returns, ' +
    'reply with one short line introducing the report; do not repeat its contents.',
  inputSchema: {
    type: 'object',
    required: ['title', 'blocks'],
    properties: {
      title: { type: 'string', description: 'e.g. "Invoices for Hope Center, Nov 2025 to Nov 2026"' },
      meta: { type: 'array', items: { type: 'string' }, description: 'Short lines under the title: client, period, filters' },
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['heading', 'text', 'table', 'conversation'] },
            text: { type: 'string', description: 'heading / text blocks (plain text)' },
            title: { type: 'string', description: 'table / conversation blocks: optional title' },
            columns: {
              type: 'array',
              description: 'table: columns in order',
              items: {
                type: 'object',
                required: ['label'],
                properties: { label: { type: 'string' }, kind: { type: 'string', enum: ['text', 'money', 'number', 'date'] } },
              },
            },
            rows: {
              type: 'array',
              description: 'table: one array of cell values per row, in column order (money as plain numbers, dates as YYYY-MM-DD)',
              items: { type: 'array', items: { type: ['string', 'number', 'null'] } },
            },
            entries: {
              type: 'array',
              description: 'conversation: one entry per message, oldest first',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', description: 'YYYY-MM-DD or YYYY-MM-DD HH:mm' },
                  who: { type: 'string', description: 'Who wrote it, or "A to B"' },
                  kind: { type: 'string', description: 'email, call, meeting, note, comment' },
                  subject: { type: 'string' },
                  text: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
