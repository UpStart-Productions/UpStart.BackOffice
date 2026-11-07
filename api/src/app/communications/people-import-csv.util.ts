const FIRST_NAME_COLUMNS = ['first name', 'firstname', 'first', 'given name', 'fname'];
const LAST_NAME_COLUMNS = ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'];
const FULL_NAME_COLUMNS = ['name', 'full name', 'contact', 'contact name', 'person', 'display name'];
const EMAIL_COLUMNS = [
  'email',
  'e-mail',
  'email address',
  'emal adress',
  'e mail',
  'work email',
  'primary email',
  'mail',
];
const PHONE_COLUMNS = ['phone', 'mobile', 'cell', 'telephone', 'work phone', 'phone number', 'phoone', 'phonne'];
const TITLE_COLUMNS = ['title', 'job title', 'position'];
const ORG_COLUMNS = [
  'organization',
  'organisation',
  'company',
  'account',
  'employer',
  'org',
  'client',
  'organization name',
  'company name',
];
const ORG_ROLE_COLUMNS = ['organization role', 'org role', 'relationship', 'account role'];
const ROLE_COLUMNS = ['role'];
const TAGS_COLUMNS = ['tags', 'tag'];
const NOTES_COLUMNS = ['notes', 'note', 'comments', 'description'];

import * as XLSX from 'xlsx';

const TITLE_PREFIX = /^(mr|mrs|ms|miss|dr|prof)\.?$/i;
const ORG_NAME_SIGNALS =
  /\b(LLC|LLP|Inc\.?|Corp\.?|Corporation|Company|Foundation|Council|Union|Realty|Hardware|Design|Credit|Partners|Group|Associates)\b/i;

export const PEOPLE_IMPORT_MAX_ROWS = 500;

export type ParsedPeopleImportRow = {
  line: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  organization: string | null;
  organizationRole: string | null;
  tags: string[];
  notes: string | null;
};

/** CSV or Excel (.xlsx, .xls) to a table of string cells. */
export function spreadsheetToTable(buffer: Buffer): string[][] {
  return isExcelWorkbook(buffer) ? xlsxToTable(buffer) : splitCsvRows(buffer.toString('utf-8'));
}

/** CSV or Excel (.xlsx, .xls) from raw file bytes. */
export function parsePeopleImportFromBuffer(buffer: Buffer): ParsedPeopleImportRow[] {
  return parsePeopleImportTable(spreadsheetToTable(buffer));
}

export function parsePeopleImportCsv(csvText: string): ParsedPeopleImportRow[] {
  return parsePeopleImportTable(splitCsvRows(csvText));
}

function isExcelWorkbook(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // ZIP (xlsx) or OLE compound (xls)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return true;
  return false;
}

function xlsxToTable(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  return raw.map((row) => (Array.isArray(row) ? row.map(cellToString) : []));
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type ColumnMap = {
  firstIdx: number;
  lastIdx: number;
  fullIdx: number;
  emailIdx: number;
  phoneIdx: number;
  titleIdx: number;
  orgIdx: number;
  orgRoleIdx: number;
  roleIdx: number;
  tagsIdx: number;
  notesIdx: number;
};

const EMPTY_COLUMN_MAP: ColumnMap = {
  firstIdx: -1,
  lastIdx: -1,
  fullIdx: -1,
  emailIdx: -1,
  phoneIdx: -1,
  titleIdx: -1,
  orgIdx: -1,
  orgRoleIdx: -1,
  roleIdx: -1,
  tagsIdx: -1,
  notesIdx: -1,
};

function mapHasNameOrEmail(map: ColumnMap): boolean {
  return map.firstIdx >= 0 || map.lastIdx >= 0 || map.fullIdx >= 0 || map.emailIdx >= 0;
}

function headerColumnMatchCount(map: ColumnMap): number {
  return [
    map.firstIdx,
    map.lastIdx,
    map.fullIdx,
    map.emailIdx,
    map.phoneIdx,
    map.orgIdx,
    map.titleIdx,
  ].filter((i) => i >= 0).length;
}

/** Title rows and blanks often precede the real header — scan the first chunk of the sheet. */
function locateHeaderRow(rows: string[][]): { map: ColumnMap; headerRowIndex: number } | null {
  let best: { map: ColumnMap; headerRowIndex: number; score: number } | null = null;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    if (rows[i].every((c) => !c?.trim())) continue;
    const map = columnMapFromHeaderRow(rows[i]);
    if (!mapHasNameOrEmail(map)) continue;
    const score = headerColumnMatchCount(map);
    if (!best || score > best.score) {
      best = { map, headerRowIndex: i, score };
    }
  }
  return best ? { map: best.map, headerRowIndex: best.headerRowIndex } : null;
}

function parsePeopleImportTable(rows: string[][]): ParsedPeopleImportRow[] {
  if (!rows.some((r) => r.some((c) => c?.trim()))) return [];

  const located = locateHeaderRow(rows);
  let map = located?.map ?? columnMapFromHeaderRow(rows[0]);
  let dataStart = located ? located.headerRowIndex + 1 : 1;

  if (!located && !mapHasNameOrEmail(map)) {
    const headerCells = rows[0].map((h) => normalizeHeader(h));
    const firstRowIsData =
      !rowHasRecognizedHeader(headerCells) && rows[0].some((c) => looksLikeEmail(c) || looksLikePersonName(c));

    if (firstRowIsData) {
      map = inferColumnMapFromData(rows, 0);
      dataStart = 0;
    } else if (rows.length > 1) {
      map = inferColumnMapFromData(rows, 1);
      dataStart = 1;
    } else {
      map = inferColumnMapFromData(rows, 0);
      dataStart = 0;
    }
  }

  if (!mapHasNameOrEmail(map)) {
    throw new Error(
      'Could not tell which columns are names or emails. Add a header row, or put an email or person name in each row.',
    );
  }

  const out: ParsedPeopleImportRow[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const parsed = parsePeopleRow(rows[i], map, i + 1);
    if (parsed) out.push(parsed);
  }
  return out;
}

function columnMapFromHeaderRow(headerRow: string[]): ColumnMap {
  const header = headerRow.map((h) => normalizeHeader(h));
  return {
    ...EMPTY_COLUMN_MAP,
    firstIdx: findColumn(header, FIRST_NAME_COLUMNS),
    lastIdx: findColumn(header, LAST_NAME_COLUMNS),
    fullIdx: findColumn(header, FULL_NAME_COLUMNS),
    emailIdx: findColumn(header, EMAIL_COLUMNS, ['email', 'mail', 'adres', 'addr']),
    phoneIdx: findColumn(header, PHONE_COLUMNS, ['phone', 'mobile', 'cell', 'phon', 'fone']),
    titleIdx: findColumn(header, TITLE_COLUMNS, ['title', 'position', 'job']),
    orgIdx: findColumn(header, ORG_COLUMNS, ['org', 'company', 'account', 'client']),
    orgRoleIdx: findColumn(header, ORG_ROLE_COLUMNS),
    roleIdx: findColumn(header, ROLE_COLUMNS),
    tagsIdx: findColumn(header, TAGS_COLUMNS, ['tag']),
    notesIdx: findColumn(header, NOTES_COLUMNS, ['note']),
  };
}

function rowHasRecognizedHeader(headerCells: string[]): boolean {
  return (
    findColumn(headerCells, FIRST_NAME_COLUMNS) >= 0 ||
    findColumn(headerCells, LAST_NAME_COLUMNS) >= 0 ||
    findColumn(headerCells, FULL_NAME_COLUMNS) >= 0 ||
    findColumn(headerCells, EMAIL_COLUMNS, ['email', 'mail']) >= 0
  );
}

function parsePeopleRow(row: string[], map: ColumnMap, line: number): ParsedPeopleImportRow | null {
  if (row.every((c) => !c?.trim())) return null;

  let firstName = cell(row, map.firstIdx);
  let lastName = cell(row, map.lastIdx) || null;
  const full = cell(row, map.fullIdx);
  if (!firstName && full) {
    const split = splitPersonName(full);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  if (!firstName && lastName) {
    firstName = lastName;
    lastName = null;
  }

  const email = normalizeEmailCell(cell(row, map.emailIdx));
  const phone = optionalCell(cell(row, map.phoneIdx));
  const organization = optionalCell(cell(row, map.orgIdx));

  let title = optionalCell(cell(row, map.titleIdx));
  let organizationRole = optionalCell(cell(row, map.orgRoleIdx));
  const genericRole = optionalCell(cell(row, map.roleIdx));
  if (genericRole) {
    if (organization && !organizationRole) {
      organizationRole = genericRole;
    } else if (!title) {
      title = genericRole;
    }
  }

  const tags = parseTags(cell(row, map.tagsIdx));
  const notes = optionalCell(cell(row, map.notesIdx));

  if (!firstName.trim() && !email) return null;

  return {
    line,
    firstName: firstName.trim(),
    lastName: lastName?.trim() || null,
    email,
    phone,
    title,
    organization,
    organizationRole,
    tags,
    notes,
  };
}

function inferColumnMapFromData(rows: string[][], startRow: number): ColumnMap {
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  const used = new Set<number>();

  const emailIdx = pickBestColumn(rows, startRow, colCount, looksLikeEmail, 0.35, used);
  const phoneIdx = pickBestColumn(rows, startRow, colCount, looksLikePhone, 0.35, used);

  const firstLast = pickAdjacentNamePair(rows, startRow, colCount, used);
  let firstIdx = -1;
  let lastIdx = -1;
  let fullIdx = -1;

  if (firstLast) {
    firstIdx = firstLast[0];
    lastIdx = firstLast[1];
    used.add(firstIdx);
    used.add(lastIdx);
  } else {
    fullIdx = pickPersonNameColumn(rows, startRow, colCount, used, emailIdx);
    if (fullIdx >= 0) used.add(fullIdx);
  }

  let orgIdx = -1;
  let bestOrgScore = 0;
  for (let c = 0; c < colCount; c++) {
    if (used.has(c)) continue;
    const person = scoreColumn(rows, startRow, c, looksLikePersonName);
    const org = scoreColumn(rows, startRow, c, looksLikeOrg);
    if (org < 0.35 || org < person) continue;
    const avgLen = averageCellLength(rows, startRow, c);
    const combined = org * 0.7 + Math.min(avgLen / 40, 1) * 0.3;
    if (combined > bestOrgScore && avgLen >= 6) {
      bestOrgScore = combined;
      orgIdx = c;
    }
  }
  if (orgIdx >= 0) used.add(orgIdx);

  return { ...EMPTY_COLUMN_MAP, firstIdx, lastIdx, fullIdx, emailIdx, phoneIdx, orgIdx };
}

function pickBestColumn(
  rows: string[][],
  startRow: number,
  colCount: number,
  match: (value: string) => boolean,
  minScore: number,
  used: Set<number>,
): number {
  let bestIdx = -1;
  let bestScore = minScore;
  for (let c = 0; c < colCount; c++) {
    if (used.has(c)) continue;
    const score = scoreColumn(rows, startRow, c, match);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = c;
    }
  }
  return bestIdx;
}

/** Prefer person-heavy columns (not org names), typically just left of the email column. */
function pickPersonNameColumn(
  rows: string[][],
  startRow: number,
  colCount: number,
  used: Set<number>,
  emailIdx: number,
): number {
  let bestIdx = -1;
  let bestScore = 0.35;
  for (let c = 0; c < colCount; c++) {
    if (used.has(c)) continue;
    const person = scoreColumn(rows, startRow, c, looksLikePersonName);
    const org = scoreColumn(rows, startRow, c, looksLikeOrg);
    if (person < 0.35 || org >= person) continue;
    let score = person;
    if (emailIdx >= 0 && c < emailIdx) score += 0.15;
    const pick =
      score > bestScore || (Math.abs(score - bestScore) < 0.05 && bestIdx >= 0 && c < bestIdx);
    if (pick) {
      bestScore = score;
      bestIdx = c;
    }
  }
  return bestIdx;
}

function pickAdjacentNamePair(
  rows: string[][],
  startRow: number,
  colCount: number,
  used: Set<number>,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestScore = 0;
  for (let c = 0; c < colCount - 1; c++) {
    if (used.has(c) || used.has(c + 1)) continue;
    const left = scoreColumn(rows, startRow, c, looksLikePersonName);
    const right = scoreColumn(rows, startRow, c + 1, looksLikePersonName);
    if (left < 0.35 || right < 0.35) continue;
    const combined = left + right;
    if (combined > bestScore) {
      bestScore = combined;
      best = [c, c + 1];
    }
  }
  return best;
}

function scoreColumn(
  rows: string[][],
  startRow: number,
  col: number,
  match: (value: string) => boolean,
): number {
  let hits = 0;
  let total = 0;
  const end = Math.min(rows.length, startRow + 30);
  for (let i = startRow; i < end; i++) {
    const value = cell(rows[i], col);
    if (!value) continue;
    total++;
    if (match(value)) hits++;
  }
  return total === 0 ? 0 : hits / total;
}

function averageCellLength(rows: string[][], startRow: number, col: number): number {
  let sum = 0;
  let count = 0;
  const end = Math.min(rows.length, startRow + 30);
  for (let i = startRow; i < end; i++) {
    const value = cell(rows[i], col);
    if (!value) continue;
    sum += value.length;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

function looksLikeEmail(value: string): boolean {
  const t = value.trim();
  return t.includes('@') && t.length >= 5 && !/\s/.test(t);
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function looksLikePersonName(value: string): boolean {
  const t = value.trim();
  if (!t || looksLikeEmail(t) || looksLikePhone(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (ORG_NAME_SIGNALS.test(t)) return false;
  if (t.length > 80 || !/[a-zA-Z]/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words >= 4) return false;
  return true;
}

function looksLikeOrg(value: string): boolean {
  const t = value.trim();
  if (!t || looksLikeEmail(t) || looksLikePhone(t)) return false;
  if (ORG_NAME_SIGNALS.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words <= 2 && t.length < 24) return false;
  return t.length >= 8 && words >= 2;
}

/** Splits "Last, First", "First Last", or single token names. */
export function splitPersonName(raw: string): { firstName: string; lastName: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { firstName: '', lastName: null };

  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',').map((p) => p.trim());
    const first = rest.join(' ').trim();
    if (first) return { firstName: stripPrefixes(first), lastName: last || null };
    return { firstName: stripPrefixes(last), lastName: null };
  }

  const parts = stripPrefixes(trimmed).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function stripPrefixes(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && TITLE_PREFIX.test(parts[0])) parts.shift();
  return parts.join(' ');
}

function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeEmailCell(raw: string): string | null {
  const first = raw.split(/[;,]/)[0]?.trim().toLowerCase() ?? '';
  return first.includes('@') && !/\s/.test(first) ? first : null;
}

function optionalCell(raw: string): string | null {
  const t = raw.trim();
  return t || null;
}

function cell(row: string[], idx: number): string {
  if (idx < 0) return '';
  return row[idx]?.trim() ?? '';
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
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
      // paired with \n
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}
