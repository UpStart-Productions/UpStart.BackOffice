import type { AccountJourneyValue } from './dto/create-client.dto';
import { spreadsheetToTable } from '../communications/people-import-csv.util';

export const ORG_IMPORT_MAX_ROWS = 500;

export type ParsedOrganizationImportRow = {
  line: number;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  code: string | null;
  journey: AccountJourneyValue;
  tags: string[];
};

const NAME_COLUMNS = [
  'organization',
  'organisation',
  'organization name',
  'organisation name',
  'company',
  'company name',
  'account',
  'account name',
  'client',
  'client name',
  'name',
  'employer',
  'org',
];
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
const WEBSITE_COLUMNS = ['website', 'web site', 'url', 'web', 'homepage', 'site'];
const ADDRESS_COLUMNS = ['address', 'street', 'street address', 'mailing address'];
const CITY_COLUMNS = ['city', 'town'];
const STATE_COLUMNS = ['state', 'province', 'region'];
const ZIP_COLUMNS = ['zip', 'zip code', 'postal', 'postal code', 'postcode'];
const NOTES_COLUMNS = ['notes', 'note', 'comments', 'description'];
const TAGS_COLUMNS = ['tags', 'tag'];
const CODE_COLUMNS = ['invoice code', 'code', 'client code', 'org code'];
const STATUS_COLUMNS = ['status', 'type', 'journey', 'category', 'org type', 'organization type'];

type ColumnMap = Record<
  'name' | 'email' | 'phone' | 'website' | 'address' | 'city' | 'state' | 'zip' | 'notes' | 'tags' | 'code' | 'status',
  number
>;

const EMPTY_MAP: ColumnMap = {
  name: -1,
  email: -1,
  phone: -1,
  website: -1,
  address: -1,
  city: -1,
  state: -1,
  zip: -1,
  notes: -1,
  tags: -1,
  code: -1,
  status: -1,
};

export function parseOrganizationImportFromBuffer(buffer: Buffer): ParsedOrganizationImportRow[] {
  return parseOrganizationImportTable(spreadsheetToTable(buffer));
}

function parseOrganizationImportTable(rows: string[][]): ParsedOrganizationImportRow[] {
  if (!rows.some((r) => r.some((c) => c?.trim()))) return [];

  const located = locateHeaderRow(rows);
  let map = located?.map ?? columnMapFromHeaderRow(rows[0]);
  let dataStart = located ? located.headerRowIndex + 1 : 1;

  if (!located && map.name < 0) {
    const headerCells = rows[0].map((h) => normalizeHeader(h));
    const firstRowIsData =
      !rowHasRecognizedHeader(headerCells) && rows[0].some((c) => looksLikeOrgName(c) || looksLikeEmail(c));
    if (firstRowIsData) {
      map = inferColumnMapFromData(rows, 0);
      dataStart = 0;
    } else if (rows.length > 1) {
      map = inferColumnMapFromData(rows, 1);
      dataStart = 1;
    }
  }

  if (map.name < 0) {
    throw new Error(
      'Could not tell which column is the organization name. Add a header row, or put the name in the first column.',
    );
  }

  const out: ParsedOrganizationImportRow[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const parsed = parseOrganizationRow(rows[i], map, i + 1);
    if (parsed) out.push(parsed);
  }
  return out;
}

function columnMapFromHeaderRow(headerRow: string[]): ColumnMap {
  const header = headerRow.map((h) => normalizeHeader(h));
  return {
    name: findColumn(header, NAME_COLUMNS, ['org', 'company', 'account', 'name']),
    email: findColumn(header, EMAIL_COLUMNS, ['email', 'mail', 'adres', 'addr']),
    phone: findColumn(header, PHONE_COLUMNS, ['phone', 'phon', 'fone']),
    website: findColumn(header, WEBSITE_COLUMNS, ['web', 'url', 'site']),
    address: findColumn(header, ADDRESS_COLUMNS, ['address', 'street']),
    city: findColumn(header, CITY_COLUMNS),
    state: findColumn(header, STATE_COLUMNS),
    zip: findColumn(header, ZIP_COLUMNS, ['zip', 'postal']),
    notes: findColumn(header, NOTES_COLUMNS, ['note']),
    tags: findColumn(header, TAGS_COLUMNS, ['tag']),
    code: findColumn(header, CODE_COLUMNS, ['code']),
    status: findColumn(header, STATUS_COLUMNS, ['status', 'type']),
  };
}

function headerMatchScore(map: ColumnMap): number {
  return Object.values(map).filter((i) => i >= 0).length;
}

function locateHeaderRow(rows: string[][]): { map: ColumnMap; headerRowIndex: number } | null {
  let best: { map: ColumnMap; headerRowIndex: number; score: number } | null = null;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    if (rows[i].every((c) => !c?.trim())) continue;
    const map = columnMapFromHeaderRow(rows[i]);
    if (map.name < 0) continue;
    const score = headerMatchScore(map);
    if (!best || score > best.score) {
      best = { map, headerRowIndex: i, score };
    }
  }
  return best ? { map: best.map, headerRowIndex: best.headerRowIndex } : null;
}

function rowHasRecognizedHeader(headerCells: string[]): boolean {
  return findColumn(headerCells, NAME_COLUMNS, ['org', 'company', 'name']) >= 0;
}

function inferColumnMapFromData(rows: string[][], startRow: number): ColumnMap {
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  const used = new Set<number>();
  const emailIdx = pickBestColumn(rows, startRow, colCount, looksLikeEmail, 0.35, used);
  const nameIdx = pickOrgNameColumn(rows, startRow, colCount, used, emailIdx);
  if (nameIdx >= 0) used.add(nameIdx);
  const phoneIdx = pickBestColumn(rows, startRow, colCount, looksLikePhone, 0.35, used);
  const websiteIdx = pickBestColumn(rows, startRow, colCount, looksLikeWebsite, 0.35, used);
  return {
    ...EMPTY_MAP,
    name: nameIdx,
    email: emailIdx,
    phone: phoneIdx,
    website: websiteIdx,
  };
}

function pickOrgNameColumn(
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
    const score = scoreColumn(rows, startRow, c, looksLikeOrgName);
    if (score < 0.35) continue;
    let weighted = score;
    if (emailIdx >= 0 && c < emailIdx) weighted += 0.1;
    if (c === 0) weighted += 0.05;
    if (weighted > bestScore) {
      bestScore = weighted;
      bestIdx = c;
    }
  }
  return bestIdx;
}

function parseOrganizationRow(row: string[], map: ColumnMap, line: number): ParsedOrganizationImportRow | null {
  if (row.every((c) => !c?.trim())) return null;
  const name = cell(row, map.name).trim();
  if (!name) return null;

  const statusRaw = optionalCell(cell(row, map.status));
  return {
    line,
    name,
    email: normalizeEmailCell(cell(row, map.email)),
    phone: optionalCell(cell(row, map.phone)),
    website: optionalCell(cell(row, map.website)),
    address: optionalCell(cell(row, map.address)),
    city: optionalCell(cell(row, map.city)),
    state: optionalCell(cell(row, map.state)),
    zip: optionalCell(cell(row, map.zip)),
    notes: optionalCell(cell(row, map.notes)),
    code: optionalCell(cell(row, map.code))?.toUpperCase() ?? null,
    journey: parseJourney(statusRaw),
    tags: [],
  };
}

export function parseJourney(raw: string | null | undefined): AccountJourneyValue {
  if (!raw?.trim()) return 'NONE';
  const t = raw.trim().toLowerCase();
  if (t === 'client' || t === 'clients' || t === 'active client') return 'CLIENT';
  return 'NONE';
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

function looksLikeEmail(value: string): boolean {
  const t = value.trim();
  return t.includes('@') && t.length >= 5 && !/\s/.test(t);
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function looksLikeWebsite(value: string): boolean {
  const t = value.trim().toLowerCase();
  return /^https?:\/\//.test(t) || (t.includes('.') && !t.includes('@') && !looksLikeEmail(t));
}

function looksLikeOrgName(value: string): boolean {
  const t = value.trim();
  if (!t || looksLikeEmail(t) || looksLikePhone(t) || looksLikeWebsite(t)) return false;
  if (t.length > 120) return false;
  return /[a-zA-Z]/.test(t);
}
