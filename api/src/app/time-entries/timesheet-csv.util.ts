export type TimesheetCsvRow = {
  date: string;
  client: string;
  project: string;
  task: string;
  description: string;
  durationHours: number;
  isBillable: boolean;
};

/** Minimal RFC4180-style CSV parser (quoted fields, commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      if (ch === '\r') i++;
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }

  return rows;
}

function parseDurationHours(raw: string): number {
  const s = raw.trim();
  if (!s) throw new Error('duration is required');
  if (s.includes(':')) {
    const [h, m] = s.split(':');
    const hours = Number(h);
    const mins = Number(m ?? 0);
    if (Number.isNaN(hours) || Number.isNaN(mins)) {
      throw new Error(`Invalid duration "${raw}"`);
    }
    const total = hours + mins / 60;
    if (total <= 0) throw new Error(`Invalid duration "${raw}"`);
    return total;
  }
  const n = Number(s);
  if (Number.isNaN(n) || n <= 0) throw new Error(`Invalid duration "${raw}"`);
  return n;
}

function parseBillable(raw: string | undefined, defaultValue = true): boolean {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return defaultValue;
  if (['yes', 'true', '1', 'y'].includes(s)) return true;
  if (['no', 'false', '0', 'n'].includes(s)) return false;
  throw new Error(`Invalid billable value "${raw}"`);
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

function columnIndex(header: string[], ...names: string[]): number {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

export function parseTimesheetCsv(text: string): TimesheetCsvRow[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ''));
  if (table.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const header = table[0].map(normalizeHeader);
  const dateI = columnIndex(header, 'date');
  const durI = columnIndex(header, 'duration_hours', 'hours');
  const clientI = columnIndex(header, 'client');
  const projectI = columnIndex(header, 'project');
  const taskI = columnIndex(header, 'task');
  const descI = columnIndex(header, 'description');
  const billI = columnIndex(header, 'billable', 'isbillable');

  if (dateI < 0) throw new Error('Missing required column: date');
  if (durI < 0) throw new Error('Missing required column: duration_hours or hours');
  if (clientI < 0) throw new Error('Missing required column: client');
  if (projectI < 0) throw new Error('Missing required column: project');

  const rows: TimesheetCsvRow[] = [];
  for (let rowNum = 1; rowNum < table.length; rowNum++) {
    const cells = table[rowNum];
    if (cells.every((c) => c.trim() === '')) continue;
    try {
      rows.push({
        date: cells[dateI]?.trim() ?? '',
        client: cells[clientI]?.trim() ?? '',
        project: cells[projectI]?.trim() ?? '',
        task: taskI >= 0 ? (cells[taskI]?.trim() ?? '') : '',
        description: descI >= 0 ? (cells[descI]?.trim() ?? '') : '',
        durationHours: parseDurationHours(cells[durI] ?? ''),
        isBillable: parseBillable(billI >= 0 ? cells[billI] : undefined),
      });
    } catch (err) {
      throw new Error(
        `Row ${rowNum + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (rows.length === 0) {
    throw new Error('CSV has no data rows');
  }

  return rows;
}

export function parseDateKey(dateStr: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) throw new Error(`Invalid date "${dateStr}" (use YYYY-MM-DD)`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function startedStoppedAt(
  dateStr: string,
  durationHours: number,
): { startedAt: Date; stoppedAt: Date } {
  const { y, m, d } = parseDateKey(dateStr);
  const startedAt = new Date(y, m - 1, d, 9, 0, 0, 0);
  const stoppedAt = new Date(startedAt.getTime() + Math.round(durationHours * 60) * 60_000);
  return { startedAt, stoppedAt };
}

export function compareNames(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}
