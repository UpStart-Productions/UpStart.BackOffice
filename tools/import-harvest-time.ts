/**
 * One-time import of Harvest time entries from a CSV export.
 *
 * Local:
 *   npm run import-harvest-time -- --dry-run
 *   npm run import-harvest-time -- --confirm
 *
 * Production (EC2, from repo root):
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -v "$(pwd)/tools/import-harvest-time.ts:/app/tools/import-harvest-time.ts:ro" \
 *     -v "$(pwd)/tools/data/harvest_time_report.csv:/app/tools/data/harvest_time_report.csv:ro" \
 *     api npx tsx tools/import-harvest-time.ts --dry-run
 *
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -v "$(pwd)/tools/import-harvest-time.ts:/app/tools/import-harvest-time.ts:ro" \
 *     -v "$(pwd)/tools/data/harvest_time_report.csv:/app/tools/data/harvest_time_report.csv:ro" \
 *     api npx tsx tools/import-harvest-time.ts --confirm
 */
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const CLIENT_CODE = 'WOU';
const PROJECT_NAME = 'Traffic Safety Education';
const USER_EMAIL = 'jeff@heyupstart.com';
const DEFAULT_CSV = path.resolve(__dirname, 'data/harvest_time_report.csv');
const PACIFIC_TZ = 'America/Los_Angeles';
const START_HOUR = 9;

/** Harvest task name → Back Office project task name */
const TASK_MAP: Record<string, string> = {
  'Project Management': 'Project Management',
  Programming: 'Development',
};

type HarvestRow = {
  Date: string;
  Client: string;
  Project: string;
  Task: string;
  Notes: string;
  Hours: string;
  'Billable?': string;
  'Billable Rate': string;
};

type ImportContext = {
  userId: string;
  projectId: string;
  taskIds: Map<string, string>;
  existingKeys: Set<string>;
};

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const confirm = argv.includes('--confirm');
  const csvIdx = argv.indexOf('--csv');
  const csvPath = csvIdx >= 0 ? path.resolve(argv[csvIdx + 1] ?? '') : DEFAULT_CSV;

  if (dryRun === confirm) {
    console.error('Pass exactly one of --dry-run or --confirm');
    process.exit(1);
  }
  if (csvIdx >= 0 && !argv[csvIdx + 1]) {
    console.error('--csv requires a file path');
    process.exit(1);
  }

  return { dryRun, confirm, csvPath };
}

/** Minimal RFC-style CSV parser (handles quoted fields and embedded newlines). */
function parseCsv(content: string): HarvestRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

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
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else if (ch === '\r') {
      // ignore
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = cells[idx] ?? '';
    });
    return record as HarvestRow;
  });
}

function getTimezoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  if (offsetStr === 'GMT') return 0;
  const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const mins = Number(match[3] ?? 0);
  return sign * (hours * 60 + mins);
}

/** 9:00 AM on `dateStr` (YYYY-MM-DD) in America/Los_Angeles. */
function pacificStartAt(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const middayUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMin = getTimezoneOffsetMinutes(PACIFIC_TZ, middayUtc);
  const localMinFromMidnight = START_HOUR * 60;
  const utcMinFromMidnight = localMinFromMidnight - offsetMin;
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      Math.floor(utcMinFromMidnight / 60),
      utcMinFromMidnight % 60,
      0,
      0,
    ),
  );
}

function hoursToMinutes(hours: string): number {
  const n = Number(hours);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error(`Invalid hours value: ${hours}`);
  }
  return Math.round(n * 60);
}

function pacificDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function entryKey(
  dateStr: string,
  projectTaskId: string,
  durationMin: number,
  description: string,
): string {
  return crypto
    .createHash('sha256')
    .update([dateStr, projectTaskId, String(durationMin), description.trim()].join('\0'))
    .digest('hex');
}

function existingEntryKey(
  startedAt: Date,
  projectTaskId: string | null | undefined,
  durationMin: number | null | undefined,
  description: string | null | undefined,
): string {
  return entryKey(
    pacificDateKey(startedAt),
    projectTaskId ?? '',
    durationMin ?? 0,
    description ?? '',
  );
}

async function resolveContext(prisma: PrismaClient): Promise<ImportContext> {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User not found: ${USER_EMAIL}`);

  const client = await prisma.client.findUnique({ where: { code: CLIENT_CODE } });
  if (!client) throw new Error(`Client not found with code: ${CLIENT_CODE}`);

  const project = await prisma.project.findFirst({
    where: { clientId: client.id, name: PROJECT_NAME },
    include: { tasks: { where: { isActive: true } } },
  });
  if (!project) {
    throw new Error(`Project not found: "${PROJECT_NAME}" under client ${CLIENT_CODE}`);
  }

  const taskIds = new Map<string, string>();
  for (const [harvestTask, backOfficeTask] of Object.entries(TASK_MAP)) {
    const match = project.tasks.find((t) => t.name === backOfficeTask);
    if (!match) {
      throw new Error(
        `Project task not found: "${backOfficeTask}" (Harvest: "${harvestTask}") on project "${PROJECT_NAME}"`,
      );
    }
    taskIds.set(harvestTask, match.id);
  }

  const existing = await prisma.timeEntry.findMany({
    where: { userId: user.id, projectId: project.id },
    select: {
      startedAt: true,
      projectTaskId: true,
      durationMin: true,
      description: true,
    },
  });

  const existingKeys = new Set(
    existing.map((e) =>
      existingEntryKey(e.startedAt, e.projectTaskId, e.durationMin, e.description),
    ),
  );

  return {
    userId: user.id,
    projectId: project.id,
    taskIds,
    existingKeys,
  };
}

async function main() {
  const { dryRun, confirm, csvPath } = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    if (rows.length === 0) {
      throw new Error('CSV contains no data rows');
    }

    const ctx = await resolveContext(prisma);

    let createCount = 0;
    let skipCount = 0;
    let totalHours = 0;
    const unknownTasks = new Set<string>();

    for (const row of rows) {
      const mappedTaskName = TASK_MAP[row.Task];
      if (!mappedTaskName) {
        unknownTasks.add(row.Task);
        continue;
      }

      const projectTaskId = ctx.taskIds.get(row.Task)!;
      const durationMin = hoursToMinutes(row.Hours);
      const description = row.Notes.trim() || undefined;
      const key = entryKey(row.Date, projectTaskId, durationMin, description ?? '');

      if (ctx.existingKeys.has(key)) {
        skipCount++;
        continue;
      }

      createCount++;
      totalHours += durationMin / 60;
      ctx.existingKeys.add(key);

      if (confirm) {
        const startedAt = pacificStartAt(row.Date);
        const stoppedAt = new Date(startedAt.getTime() + durationMin * 60_000);
        const isBillable = row['Billable?'].trim().toLowerCase() === 'yes';
        const hourlyRate = row['Billable Rate'].trim()
          ? Number(row['Billable Rate'])
          : undefined;

        await prisma.timeEntry.create({
          data: {
            userId: ctx.userId,
            projectId: ctx.projectId,
            projectTaskId,
            description,
            startedAt,
            stoppedAt,
            durationMin,
            isBillable,
            hourlyRate,
          },
        });
      }
    }

    if (unknownTasks.size > 0) {
      throw new Error(`Unknown Harvest task(s): ${[...unknownTasks].join(', ')}`);
    }

    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'IMPORT'}`);
    console.log(`CSV: ${csvPath}`);
    console.log(`Client code: ${CLIENT_CODE}`);
    console.log(`Project: ${PROJECT_NAME}`);
    console.log(`User: ${USER_EMAIL}`);
    console.log(`Rows in CSV: ${rows.length}`);
    console.log(`Would create: ${createCount}`);
    console.log(`Would skip (already imported): ${skipCount}`);
    console.log(`Hours to import: ${Math.round(totalHours * 100) / 100}`);

    if (dryRun && createCount > 0) {
      console.log('\nRe-run with --confirm to write entries.');
    }
    if (confirm) {
      console.log(`\nImported ${createCount} time entries.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
