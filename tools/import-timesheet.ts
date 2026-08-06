/**
 * Import completed time entries from CSV into Back Office.
 *
 * Supported columns (header required; aliases shown):
 *   date
 *   duration_hours | hours
 *   client, project
 *   task (optional)
 *   description (optional)
 *   billable | isbillable (optional; defaults true)
 *
 * - date: YYYY-MM-DD
 * - duration: decimal hours (e.g. 2.5) or H:MM (e.g. 2:30)
 * - billable: yes/no, true/false, or 1/0
 *
 * Usage:
 *   npm run import-timesheet -- --csv data/back-office-timesheet-import.csv --user you@example.com
 *   npm run import-timesheet -- --all --user you@example.com
 *   npm run import-timesheet -- --all --user you@example.com --dry-run
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type CsvRow = {
  date: string;
  client: string;
  project: string;
  task: string;
  description: string;
  durationHours: number;
  isBillable: boolean;
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean | string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args['dry-run'] = true;
      continue;
    }
    if (arg === '--all') {
      args.all = true;
      continue;
    }
    if (arg.startsWith('--') && i + 1 < argv.length) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (key === 'csv') {
        const existing = args.csv;
        args.csv = existing ? [...(existing as string[]), value] : [value];
      } else {
        args[key] = value;
      }
    }
  }
  return args;
}

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

function rowsFromCsv(text: string, sourceLabel: string): CsvRow[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ''));
  if (table.length < 2) {
    throw new Error(`${sourceLabel}: CSV must include a header row and at least one data row`);
  }

  const header = table[0].map(normalizeHeader);
  const dateI = columnIndex(header, 'date');
  const durI = columnIndex(header, 'duration_hours', 'hours');
  const clientI = columnIndex(header, 'client');
  const projectI = columnIndex(header, 'project');
  const taskI = columnIndex(header, 'task');
  const descI = columnIndex(header, 'description');
  const billI = columnIndex(header, 'billable', 'isbillable');

  if (dateI < 0) throw new Error(`${sourceLabel}: missing required column: date`);
  if (durI < 0) throw new Error(`${sourceLabel}: missing required column: duration_hours or hours`);
  if (clientI < 0) throw new Error(`${sourceLabel}: missing required column: client`);
  if (projectI < 0) throw new Error(`${sourceLabel}: missing required column: project`);

  const rows: CsvRow[] = [];
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
        `${sourceLabel} row ${rowNum + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return rows;
}

function parseDateKey(dateStr: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) throw new Error(`Invalid date "${dateStr}" (use YYYY-MM-DD)`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function startedStoppedAt(dateStr: string, durationHours: number): { startedAt: Date; stoppedAt: Date } {
  const { y, m, d } = parseDateKey(dateStr);
  const startedAt = new Date(y, m - 1, d, 9, 0, 0, 0);
  const stoppedAt = new Date(startedAt.getTime() + Math.round(durationHours * 60) * 60_000);
  return { startedAt, stoppedAt };
}

function compareNames(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function resolveCsvPaths(args: ReturnType<typeof parseArgs>): string[] {
  if (args.all) {
    const dataDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      throw new Error(`Data directory not found: ${dataDir}`);
    }
    return fs
      .readdirSync(dataDir)
      .filter((name) => name.toLowerCase().endsWith('.csv'))
      .sort()
      .map((name) => path.join(dataDir, name));
  }

  const csvArg = args.csv;
  if (!csvArg) return [];
  return (Array.isArray(csvArg) ? csvArg : [csvArg]).map((p) => path.resolve(String(p)));
}

async function importRows(
  rows: CsvRow[],
  user: { id: string; email: string },
  projects: Awaited<ReturnType<typeof loadProjects>>,
  dryRun: boolean,
  sourceLabel: string,
): Promise<number> {
  let created = 0;

  for (const row of rows) {
    const project = projects.find(
      (p) => compareNames(p.name, row.project) && compareNames(p.client.name, row.client),
    );
    if (!project) {
      throw new Error(
        `${sourceLabel}: no project "${row.project}" under client "${row.client}" (${row.date}). Create it in Back Office first.`,
      );
    }

    let projectTaskId: string | undefined;
    let isBillable = row.isBillable;

    if (row.task) {
      const task = project.tasks.find((t) => compareNames(t.name, row.task));
      if (!task) {
        throw new Error(
          `${sourceLabel}: no task "${row.task}" on project "${row.project}" (${row.date}). Add it under Project → Tasks.`,
        );
      }
      projectTaskId = task.id;
      isBillable = row.isBillable && task.isBillable;
    }

    const { startedAt, stoppedAt } = startedStoppedAt(row.date, row.durationHours);
    const durationMin = Math.round(row.durationHours * 60);

    if (dryRun) {
      console.log(
        `[dry-run] ${sourceLabel}: ${row.date} ${row.client} / ${row.project}${row.task ? ` / ${row.task}` : ''} — ${row.durationHours}h — ${row.description.slice(0, 60)}`,
      );
      created++;
      continue;
    }

    await prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: project.id,
        projectTaskId,
        description: row.description || undefined,
        startedAt,
        stoppedAt,
        durationMin,
        isBillable,
      },
    });
    created++;
  }

  return created;
}

async function loadProjects() {
  return prisma.project.findMany({
    where: { isActive: true },
    include: {
      client: { select: { id: true, name: true } },
      tasks: { where: { isActive: true } },
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userEmail = args['user'] as string | undefined;
  const dryRun = !!args['dry-run'];
  const csvPaths = resolveCsvPaths(args);

  if (!userEmail || csvPaths.length === 0) {
    console.error(
      'Usage: npm run import-timesheet -- --csv <path> [--csv <path> ...] --user <email> [--dry-run]',
    );
    console.error('       npm run import-timesheet -- --all --user <email> [--dry-run]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: userEmail.trim() } });
  if (!user) throw new Error(`User not found: ${userEmail}`);

  const projects = await loadProjects();
  let totalCreated = 0;

  for (const csvPath of csvPaths) {
    const label = path.basename(csvPath);
    const rows = rowsFromCsv(fs.readFileSync(csvPath, 'utf-8'), label);
    console.log(`${dryRun ? 'Dry run' : 'Importing'} ${rows.length} rows from ${label}...`);
    totalCreated += await importRows(rows, user, projects, dryRun, label);
  }

  console.log(
    dryRun
      ? `Dry run OK — ${totalCreated} entries would be imported for ${user.email} from ${csvPaths.length} file(s).`
      : `Imported ${totalCreated} time entries for ${user.email} from ${csvPaths.length} file(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
