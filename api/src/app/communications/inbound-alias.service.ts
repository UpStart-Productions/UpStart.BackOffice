import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from './communications.constants';

/** URL/local-part friendly slug (adapted from GrovLink's common/slugify). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export async function generateUniqueSlug(
  baseSlug: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = baseSlug;
  let counter = 1;
  while (await exists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

export interface ResolvedAlias {
  aliasId: string;
  alias: string;
  tenantId: string;
  tenantName: string;
  /** Domains that count as the tenant's own team. */
  internalDomains: string[];
}

/**
 * Per-tenant capture addresses (adapted from GrovLink's InboundEmailAliasService).
 * An alias is the local part of e.g. tpn@in.<domain>. Old aliases are demoted, never deleted,
 * so mail already addressed to them keeps routing.
 */
@Injectable()
export class InboundAliasService implements OnModuleInit {
  private readonly logger = new Logger(InboundAliasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Make sure the default tenant has a primary alias so local testing works out of the box. */
  async onModuleInit(): Promise<void> {
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
      if (!tenant) return;
      await this.ensurePrimaryForTenant(tenant.id, tenant.slug);
    } catch (err) {
      // Never block API startup (e.g. migration not applied yet).
      this.logger.warn(`Could not ensure default inbound alias: ${(err as Error).message}`);
    }
  }

  async ensurePrimaryForTenant(tenantId: string, name: string): Promise<string> {
    const existing = await this.prisma.inboundAlias.findFirst({
      where: { tenantId, isPrimary: true },
    });
    if (existing) return existing.alias;
    const alias = await generateUniqueSlug(slugify(name) || 'tenant', async (candidate) => {
      const hit = await this.prisma.inboundAlias.findUnique({ where: { alias: candidate } });
      return !!hit;
    });
    await this.prisma.inboundAlias.create({ data: { alias, tenantId, isPrimary: true } });
    this.logger.log(`Created inbound alias "${alias}" for tenant ${tenantId}`);
    return alias;
  }

  listForTenant(tenantId: string) {
    return this.prisma.inboundAlias.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async setPrimaryAlias(tenantId: string, newAliasRaw: string): Promise<{ alias: string }> {
    const candidate = slugify(newAliasRaw);
    if (!candidate) throw new BadRequestException('Alias cannot be empty');
    const existing = await this.prisma.inboundAlias.findUnique({ where: { alias: candidate } });
    if (existing && existing.tenantId !== tenantId) {
      throw new ConflictException(`Alias "${candidate}" is already in use.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.inboundAlias.updateMany({
        where: { tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
      if (existing) {
        await tx.inboundAlias.update({ where: { id: existing.id }, data: { isPrimary: true } });
      } else {
        await tx.inboundAlias.create({ data: { alias: candidate, tenantId, isPrimary: true } });
      }
    });
    return { alias: candidate };
  }

  async resolve(aliasRaw: string): Promise<ResolvedAlias | null> {
    const alias = aliasRaw.trim().toLowerCase();
    if (!alias) return null;
    const row = await this.prisma.inboundAlias.findUnique({
      where: { alias },
      select: {
        id: true,
        alias: true,
        tenantId: true,
        tenant: { select: { name: true, internalDomains: true } },
      },
    });
    if (!row) return null;
    return {
      aliasId: row.id,
      alias: row.alias,
      tenantId: row.tenantId,
      tenantName: row.tenant.name,
      internalDomains: row.tenant.internalDomains,
    };
  }
}
