import { createHash } from 'crypto';

export type ParsedBankRow = {
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // signed: positive = money in, negative = money out
};

const DATE_COLUMNS = ['date', 'transaction date', 'posted date', 'posting date', 'post date', 'effective date'];
const DESCRIPTION_COLUMNS = ['description', 'memo', 'name', 'payee', 'transaction'];
const AMOUNT_COLUMNS = ['amount', 'transaction amount', 'net amount'];
const DEBIT_COLUMNS = ['debit', 'withdrawal', 'withdrawals'];
const CREDIT_COLUMNS = ['credit', 'deposit', 'deposits'];

// Fallback substrings, tried only if no exact header match is found above —
// covers the long tail of bank-specific header naming without a growing list.
const DATE_HINTS = ['date'];
const DESCRIPTION_HINTS = ['desc', 'memo', 'payee', 'narrative'];
const AMOUNT_HINTS = ['amount'];

/**
 * Minimal, dependency-free CSV parser for bank exports. Handles quoted
 * fields and commas inside quotes. Accepts either a single signed "amount"
 * column or separate debit/credit columns — covers the vast majority of
 * bank/credit-card CSV exports without needing a schema per bank.
 */
export function parseBankCsv(csvText: string): ParsedBankRow[] {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dateIdx = findColumn(header, DATE_COLUMNS, DATE_HINTS);
  const descIdx = findColumn(header, DESCRIPTION_COLUMNS, DESCRIPTION_HINTS);
  const amountIdx = findColumn(header, AMOUNT_COLUMNS, AMOUNT_HINTS);
  const debitIdx = findColumn(header, DEBIT_COLUMNS);
  const creditIdx = findColumn(header, CREDIT_COLUMNS);

  if (dateIdx === -1 || descIdx === -1) {
    throw new Error('CSV must include a date column and a description column');
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new Error('CSV must include an amount column, or separate debit/credit columns');
  }

  const out: ParsedBankRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every((c) => c.trim() === '')) continue;

    const dateRaw = row[dateIdx]?.trim();
    const description = row[descIdx]?.trim() ?? '(no description)';
    if (!dateRaw) continue;

    let amount: number;
    if (amountIdx !== -1) {
      amount = parseAmount(row[amountIdx]);
    } else {
      const debit = debitIdx !== -1 ? Math.abs(parseAmount(row[debitIdx] ?? '0')) : 0;
      const credit = creditIdx !== -1 ? Math.abs(parseAmount(row[creditIdx] ?? '0')) : 0;
      amount = credit - debit;
    }

    const date = normalizeDate(dateRaw);
    if (!date || amount === 0) continue;

    out.push({ date, description, amount: Math.round(amount * 100) / 100 });
  }
  return out;
}

/**
 * Normalizes a bank transaction description into a stable "merchant key" for
 * categorization matching. Strips the parts that vary between otherwise
 * identical recurring transactions — digits (transaction IDs, dates, store
 * numbers) and punctuation — and keeps only the first few words, so the key
 * stays stable even if the bank appends extra detail some months and not
 * others. Returns '' for descriptions with no stable alphabetic content
 * (e.g. an all-numeric wire reference) — callers should treat that as
 * "no key available" rather than a valid match target.
 */
export function normalizeDescription(description: string): string {
  const cleaned = description
    .toLowerCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').filter(Boolean).slice(0, 6).join(' ');
}

/** Stable dedupe key for a parsed row within one file, so re-uploading the same export is a no-op. */
export function bankRowExternalId(row: ParsedBankRow, indexInFile: number): string {
  return createHash('sha1')
    .update(`${row.date}|${row.description}|${row.amount}|${indexInFile}`)
    .digest('hex');
}

function findColumn(header: string[], candidates: string[], hints: string[] = []): number {
  for (const candidate of candidates) {
    const idx = header.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  for (const hint of hints) {
    const idx = header.findIndex((h) => h.includes(hint));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(raw: string): number {
  const cleaned = (raw ?? '').replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    const inner = parseFloat(cleaned.slice(1, -1));
    return Number.isNaN(inner) ? 0 : -inner;
  }
  const value = parseFloat(cleaned);
  return Number.isNaN(value) ? 0 : value;
}

function normalizeDate(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      // ignore — paired \n handles the row break
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}
