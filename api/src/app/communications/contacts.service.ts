import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserContext } from '../common/app.types';
import { AccessService } from '../access/access.service';
import { createOrganizationFromImport } from '../clients/import-organization-create.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { clientIdsMatchingServiceOrProduct, insensitiveContains } from '../search/text-search.util';
import { DEFAULT_TENANT_ID } from './communications.constants';
import {
  AddContactEmailDto, CreateContactDto, LinkContactAccountDto, UpdateContactDto,
} from './dto/communications.dto';
import { normalizeEmail } from './email-address.util';
import { clampLimit } from './interactions.service';
import { ATTRIBUTION_INCLUDE, withAttribution } from '../common/record-attribution';
import { setContactTags } from '../crm-tags/crm-tags.util';
import { contactIdsWithTagName, contactTagsByIds } from '../dimensions/dimensions-load.util';
import {
  parsePeopleImportFromBuffer,
  ParsedPeopleImportRow,
  PEOPLE_IMPORT_MAX_ROWS,
} from './people-import-csv.util';

const TENANT = DEFAULT_TENANT_ID; // Phase 2 replaces this with the caller's tenant.

const contactInclude = {
  emails: { select: { id: true, email: true, isPrimary: true }, orderBy: { createdAt: 'asc' as const } },
  accountLinks: {
    select: { clientId: true, role: true, isPrimary: true, client: { select: { id: true, name: true, journey: true } } },
  },
  ...ATTRIBUTION_INCLUDE,
};

/** API shape with tag names from CONTACT dimensions. */
function toContactView<T extends { id: string }>(contact: T, tags: string[]) {
  return { ...contact, tags };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function optionalText(value: string | undefined | null): string | null {
  const t = value?.trim();
  return t || null;
}

function summarizeImport(
  rows: { status: 'create' | 'skip' | 'warn' | 'error' }[],
): { create: number; skip: number; warn: number; error: number } {
  return rows.reduce(
    (acc, r) => {
      acc[r.status]++;
      return acc;
    },
    { create: 0, skip: 0, warn: 0, error: 0 },
  );
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  async list(opts: { q?: string; clientId?: string; review?: boolean; tag?: string; limit?: string | number } = {}) {
    const q = opts.q?.trim();
    const orgIds = q ? await clientIdsMatchingServiceOrProduct(this.prisma, TENANT, q) : [];
    const tagIds = opts.tag ? await contactIdsWithTagName(this.prisma, opts.tag) : [];
    const rows = await this.prisma.contact.findMany({
      where: {
        tenantId: TENANT,
        ...(opts.review ? { autoCreated: true } : {}),
        ...(tagIds.length ? { id: { in: tagIds } } : opts.tag ? { id: { in: [] } } : {}),
        ...(opts.clientId ? { accountLinks: { some: { clientId: opts.clientId } } } : {}),
        ...(q
          ? {
              OR: [
                { firstName: insensitiveContains(q) },
                { lastName: insensitiveContains(q) },
                { emails: { some: { email: { contains: q.toLowerCase() } } } },
                { accountLinks: { some: { client: { name: insensitiveContains(q) } } } },
                ...(orgIds.length ? [{ accountLinks: { some: { clientId: { in: orgIds } } } }] : []),
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: clampLimit(opts.limit, 100, 500),
      include: contactInclude,
    });
    const tagMap = await contactTagsByIds(this.prisma, rows.map((r) => r.id));
    return rows.map((r) => toContactView(r, tagMap.get(r.id) ?? []));
  }

  async reviewCount(): Promise<{ count: number }> {
    return { count: await this.prisma.contact.count({ where: { tenantId: TENANT, autoCreated: true } }) };
  }

  async get(id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId: TENANT }, include: contactInclude });
    if (!contact) throw new NotFoundException('Contact not found.');
    const tagMap = await contactTagsByIds(this.prisma, [contact.id]);
    return withAttribution(contact, toContactView(contact, tagMap.get(contact.id) ?? []));
  }

  async create(dto: CreateContactDto) {
    const email = dto.email ? normalizeEmail(dto.email) : null;
    if (dto.email && !email) throw new BadRequestException('Invalid email address.');
    if (dto.clientId) await this.assertClient(dto.clientId);

    try {
      const created = await this.prisma.contact.create({
        data: {
          tenantId: TENANT,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          title: dto.title ?? null,
          phone: optionalText(dto.phone),
          linkedInUrl: optionalText(dto.linkedInUrl),
          personalUrl: optionalText(dto.personalUrl),
          notes: dto.notes ?? null,
          ...(email ? { emails: { create: { tenantId: TENANT, email, isPrimary: true } } } : {}),
          ...(dto.clientId
            ? { accountLinks: { create: { clientId: dto.clientId, role: dto.role ?? null } } }
            : {}),
        },
        select: { id: true },
      });
      if (dto.tags?.length) await setContactTags(this.prisma, created.id, dto.tags, TENANT);
      return this.get(created.id);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('That email already belongs to another contact.');
      throw err;
    }
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.get(id);
    await this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() || null } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.phone !== undefined ? { phone: optionalText(dto.phone) } : {}),
        ...(dto.linkedInUrl !== undefined ? { linkedInUrl: optionalText(dto.linkedInUrl) } : {}),
        ...(dto.personalUrl !== undefined ? { personalUrl: optionalText(dto.personalUrl) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.autoCreated !== undefined ? { autoCreated: dto.autoCreated } : {}),
      },
    });
    if (dto.tags !== undefined) await setContactTags(this.prisma, id, dto.tags, TENANT);
    return this.get(id);
  }

  async addEmail(id: string, dto: AddContactEmailDto) {
    await this.get(id);
    const email = normalizeEmail(dto.email);
    if (!email) throw new BadRequestException('Invalid email address.');
    try {
      if (dto.isPrimary) {
        await this.prisma.contactEmail.updateMany({ where: { contactId: id }, data: { isPrimary: false } });
      }
      await this.prisma.contactEmail.create({
        data: { tenantId: TENANT, contactId: id, email, isPrimary: !!dto.isPrimary },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('That email already belongs to a contact.');
      throw err;
    }
    return this.get(id);
  }

  async removeEmail(id: string, email: string) {
    await this.get(id);
    const normalized = normalizeEmail(email);
    if (!normalized) throw new BadRequestException('Invalid email address.');
    await this.prisma.contactEmail.deleteMany({ where: { contactId: id, email: normalized } });
    return this.get(id);
  }

  async linkAccount(id: string, dto: LinkContactAccountDto) {
    await this.get(id);
    await this.assertClient(dto.clientId);
    await this.prisma.contactAccount.upsert({
      where: { contactId_clientId: { contactId: id, clientId: dto.clientId } },
      create: { contactId: id, clientId: dto.clientId, role: dto.role ?? null, isPrimary: !!dto.isPrimary },
      update: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
      },
    });
    return this.get(id);
  }

  async unlinkAccount(id: string, clientId: string) {
    await this.get(id);
    await this.prisma.contactAccount.deleteMany({ where: { contactId: id, clientId } });
    return this.get(id);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.contact.delete({ where: { id } });
    return { deleted: true as const };
  }

  parsePeopleImportFile(fileBase64: string): ParsedPeopleImportRow[] {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid file data');
    }
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('File is too large (max 2 MB)');
    }
    let rows: ParsedPeopleImportRow[];
    try {
      rows = parsePeopleImportFromBuffer(buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not parse that file');
    }
    if (rows.length === 0) {
      throw new BadRequestException('No people found in that file');
    }
    if (rows.length > PEOPLE_IMPORT_MAX_ROWS) {
      throw new BadRequestException(`Too many rows (${rows.length}). Import at most ${PEOPLE_IMPORT_MAX_ROWS} people at once.`);
    }
    return rows;
  }

  async previewPeopleImport(fileBase64: string) {
    const rows = this.parsePeopleImportFile(fileBase64);
    const classified = await this.classifyPeopleImportRows(rows);
    const orgNames = new Set(
      classified
        .filter((r) => r.organization && !r.resolvedClientId)
        .map((r) => r.organization!.trim().toLowerCase()),
    );
    return {
      totalRows: rows.length,
      preview: classified.slice(0, 10),
      summary: { ...summarizeImport(classified), organizationsToCreate: orgNames.size },
    };
  }

  async commitPeopleImport(fileBase64: string, user: UserContext) {
    const rows = this.parsePeopleImportFile(fileBase64);
    let classified = await this.classifyPeopleImportRows(rows);
    const orgsCreated = await this.ensurePeopleImportOrganizations(classified, user);
    if (orgsCreated > 0) {
      classified = await this.classifyPeopleImportRows(rows);
    }
    const toCreate = classified.filter((r) => r.status === 'create' || r.status === 'warn');

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
        const dto: CreateContactDto = {
          firstName: row.firstName.trim(),
          lastName: row.lastName ?? undefined,
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          title: row.title ?? undefined,
          notes: row.notes ?? undefined,
          tags: row.tags.length ? row.tags : undefined,
          clientId: row.resolvedClientId ?? undefined,
          role: row.organizationRole ?? undefined,
        };
        await this.create(dto);
        created++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not create person';
        errors.push({ line: row.line, message });
      }
    }

    return { created, skipped, failed: errors.length, errors, attempted: toCreate.length, organizationsCreated: orgsCreated };
  }

  private async ensurePeopleImportOrganizations(
    rows: Awaited<ReturnType<ContactsService['classifyPeopleImportRows']>>,
    user: UserContext,
  ): Promise<number> {
    const pending = [
      ...new Set(
        rows
          .filter((r) => r.organization && !r.resolvedClientId)
          .map((r) => r.organization!.trim())
          .filter(Boolean),
      ),
    ];
    if (!pending.length) return 0;

    let created = 0;
    for (const name of pending) {
      const exists = await this.prisma.client.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (exists) continue;
      try {
        await createOrganizationFromImport(this.prisma, this.storageFolders, this.access, user, {
          name,
          journey: 'NONE',
        });
        created++;
      } catch {
        // classify pass will still warn; person row may error on link
      }
    }
    return created;
  }

  private async classifyPeopleImportRows(rows: ParsedPeopleImportRow[]) {
    const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
    const existingEmails = new Set<string>();
    if (emails.length) {
      const found = await this.prisma.contactEmail.findMany({
        where: { tenantId: TENANT, email: { in: emails } },
        select: { email: true },
      });
      for (const e of found) existingEmails.add(e.email);
    }

    const orgNames = [...new Set(rows.map((r) => r.organization).filter((n): n is string => !!n))];
    const clientByName = new Map<string, string>();
    if (orgNames.length) {
      const clients = await this.prisma.client.findMany({
        where: {
          tenantId: TENANT,
          OR: orgNames.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })),
        },
        select: { id: true, name: true },
      });
      for (const c of clients) {
        clientByName.set(c.name.trim().toLowerCase(), c.id);
      }
    }

    type Classified = ParsedPeopleImportRow & {
      status: 'create' | 'skip' | 'warn' | 'error';
      statusMessage?: string;
      resolvedClientId?: string | null;
    };

    const out: Classified[] = [];
    const seenInFile = new Set<string>();

    for (const row of rows) {
      if (!row.firstName.trim()) {
        out.push({ ...row, status: 'error', statusMessage: 'Missing first name' });
        continue;
      }
      if (row.email) {
        if (existingEmails.has(row.email) || seenInFile.has(row.email)) {
          out.push({
            ...row,
            status: 'skip',
            statusMessage: existingEmails.has(row.email) ? 'Email already in People' : 'Duplicate email in file',
          });
          seenInFile.add(row.email);
          continue;
        }
        seenInFile.add(row.email);
      }

      let resolvedClientId: string | null = null;
      let status: Classified['status'] = 'create';
      let statusMessage: string | undefined;
      if (row.organization) {
        resolvedClientId = clientByName.get(row.organization.trim().toLowerCase()) ?? null;
        if (!resolvedClientId) {
          statusMessage = `Organization "${row.organization}" will be created as Partner / other`;
        }
      }
      out.push({ ...row, status, statusMessage, resolvedClientId });
    }
    return out;
  }

  private async assertClient(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Client not found.');
  }

}
