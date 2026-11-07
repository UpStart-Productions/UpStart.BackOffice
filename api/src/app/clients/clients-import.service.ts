import { BadRequestException, Injectable } from '@nestjs/common';
import type { UserContext } from '../common/app.types';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import {
  ORG_IMPORT_MAX_ROWS,
  parseOrganizationImportFromBuffer,
  ParsedOrganizationImportRow,
} from './organization-import.util';

type ClassifiedOrgRow = ParsedOrganizationImportRow & {
  status: 'create' | 'skip' | 'error';
  statusMessage?: string;
};

@Injectable()
export class ClientsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  parseImportFile(fileBase64: string): ParsedOrganizationImportRow[] {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid file data');
    }
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('File is too large (max 2 MB)');
    }
    let rows: ParsedOrganizationImportRow[];
    try {
      rows = parseOrganizationImportFromBuffer(buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not parse that file');
    }
    if (rows.length === 0) {
      throw new BadRequestException('No organizations found in that file');
    }
    if (rows.length > ORG_IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Too many rows (${rows.length}). Import at most ${ORG_IMPORT_MAX_ROWS} organizations at once.`,
      );
    }
    return rows;
  }

  async previewImport(fileBase64: string) {
    const rows = this.parseImportFile(fileBase64);
    const classified = await this.classifyRows(rows);
    return {
      totalRows: rows.length,
      preview: classified.slice(0, 10),
      summary: summarize(classified),
    };
  }

  async commitImport(fileBase64: string, user: UserContext) {
    const rows = this.parseImportFile(fileBase64);
    const classified = await this.classifyRows(rows);

    let created = 0;
    let skipped = 0;
    const errors: { line: number; message: string }[] = [];

    for (const row of classified) {
      if (row.status === 'skip') {
        skipped++;
        continue;
      }
      if (row.status === 'error') {
        errors.push({ line: row.line, message: row.statusMessage ?? 'Invalid row' });
        continue;
      }
      try {
        const clientId = await this.prisma.$transaction(async (tx) => {
          const createdRow = await tx.client.create({
            data: {
              name: row.name,
              code: row.code ?? undefined,
              journey: row.journey === 'CLIENT' ? 'CLIENT' : 'NONE',
              email: row.email,
              phone: row.phone,
              address: row.address,
              city: row.city,
              state: row.state,
              zip: row.zip,
              website: row.website,
              notes: row.notes,
              isActive: true,
            },
            select: { id: true },
          });
          return createdRow.id;
        });
        if (this.access.level(user, 'clients') !== 'all') {
          await this.prisma.clientAssignment.create({ data: { clientId, userId: user.id } });
        }
        await this.storageFolders.ensureClientFolders(clientId);
        created++;
      } catch (err) {
        errors.push({ line: row.line, message: err instanceof Error ? err.message : 'Could not create organization' });
      }
    }

    return { created, skipped, failed: errors.length, errors };
  }

  private async classifyRows(rows: ParsedOrganizationImportRow[]): Promise<ClassifiedOrgRow[]> {
    const names = rows.map((r) => r.name.trim().toLowerCase());
    const existing = new Set<string>();
    if (names.length) {
      const clients = await this.prisma.client.findMany({
        where: { OR: names.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })) },
        select: { name: true },
      });
      for (const c of clients) existing.add(c.name.trim().toLowerCase());
    }

    const seenInFile = new Set<string>();
    const out: ClassifiedOrgRow[] = [];
    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      if (!key) {
        out.push({ ...row, status: 'error', statusMessage: 'Missing organization name' });
        continue;
      }
      if (existing.has(key) || seenInFile.has(key)) {
        out.push({
          ...row,
          status: 'skip',
          statusMessage: existing.has(key) ? 'Name already exists' : 'Duplicate name in file',
        });
        seenInFile.add(key);
        continue;
      }
      seenInFile.add(key);
      out.push({ ...row, status: 'create' });
    }
    return out;
  }
}

function summarize(rows: ClassifiedOrgRow[]): { create: number; skip: number; error: number } {
  return rows.reduce((acc, r) => {
    acc[r.status]++;
    return acc;
  }, { create: 0, skip: 0, error: 0 });
}
