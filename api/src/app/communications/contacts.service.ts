import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from './communications.constants';
import {
  AddContactEmailDto, CreateContactDto, LinkContactAccountDto, UpdateContactDto,
} from './dto/communications.dto';
import { normalizeEmail } from './email-address.util';
import { clampLimit } from './interactions.service';
import { hasTagWhere, setContactTags, tagNames, tagsInclude } from '../crm-tags/crm-tags.util';

const TENANT = DEFAULT_TENANT_ID; // Phase 2 replaces this with the caller's tenant.

const contactInclude = {
  emails: { select: { id: true, email: true, isPrimary: true }, orderBy: { createdAt: 'asc' as const } },
  accountLinks: {
    select: { clientId: true, role: true, isPrimary: true, client: { select: { id: true, name: true, journey: true } } },
  },
  ...tagsInclude,
};

/** API shape: tag rows flattened to names. */
function toContactView<T extends { tags?: { tag: { name: string } }[] }>(contact: T) {
  const { tags, ...rest } = contact;
  return { ...rest, tags: tagNames(tags) };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { q?: string; clientId?: string; review?: boolean; tag?: string; limit?: string | number } = {}) {
    const q = opts.q?.trim();
    const rows = await this.prisma.contact.findMany({
      where: {
        tenantId: TENANT,
        ...(opts.review ? { autoCreated: true } : {}),
        ...hasTagWhere(opts.tag),
        ...(opts.clientId ? { accountLinks: { some: { clientId: opts.clientId } } } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { emails: { some: { email: { contains: q.toLowerCase() } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: clampLimit(opts.limit, 100, 500),
      include: contactInclude,
    });
    return rows.map(toContactView);
  }

  async reviewCount(): Promise<{ count: number }> {
    return { count: await this.prisma.contact.count({ where: { tenantId: TENANT, autoCreated: true } }) };
  }

  async get(id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId: TENANT }, include: contactInclude });
    if (!contact) throw new NotFoundException('Contact not found.');
    return toContactView(contact);
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
          phone: dto.phone ?? null,
          notes: dto.notes ?? null,
          ...(email ? { emails: { create: { tenantId: TENANT, email, isPrimary: true } } } : {}),
          ...(dto.clientId
            ? { accountLinks: { create: { clientId: dto.clientId, role: dto.role ?? null } } }
            : {}),
        },
        select: { id: true },
      });
      if (dto.tags?.length) await setContactTags(this.prisma, created.id, dto.tags);
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
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.autoCreated !== undefined ? { autoCreated: dto.autoCreated } : {}),
      },
    });
    if (dto.tags !== undefined) await setContactTags(this.prisma, id, dto.tags);
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

  private async assertClient(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Client not found.');
  }
}
