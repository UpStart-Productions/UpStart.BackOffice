import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { RequireSuperGuard } from './require-super.guard';
import { runUnscoped, runWithTenant } from './tenant-context';
import { ensurePresetRoles } from '../access/role-presets.util';
import { createStarterPipeline } from '../pipelines/pipeline-lanes.util';
import { DEFAULT_MODULES, sanitizeModules } from '@upstart/back-office/shared';

export class CreateTenantDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @Matches(/^[a-z0-9-]{2,40}$/, { message: 'Slug: 2-40 characters, a-z, 0-9 and dashes' }) slug!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) internalDomains?: string[];
  /** Module keys to switch on (libs/shared modules.ts). Omitted: the default set. */
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
}

export class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,40}$/, { message: 'Slug: 2-40 characters, a-z, 0-9 and dashes' }) slug?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) internalDomains?: string[];
  /** Module keys switched on. Turning one off hides it but keeps its data. */
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  /** The calling super user's own pay rate in this tenant. Null clears it. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) myHourlyRate?: number | null;
}

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenants the caller may act in: all of them for a super user, otherwise every tenant where their
   * email has an active user row (one person can belong to several). While a platform operator is
   * acting as someone, just that person's current tenant: switching would not change whose row is used.
   */
  @Get('mine')
  async mine(@Req() req: Request) {
    const user = req.user as UserContext;
    const select = { id: true, name: true, slug: true } as const;
    if (user.isSuper) return this.prisma.tenant.findMany({ select, orderBy: { name: 'asc' } });
    if (!user.tenantId) return [];
    if (req.impersonatedBy) {
      const own = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select });
      return own ? [own] : [];
    }
    const rows = await runUnscoped(() =>
      this.prisma.user.findMany({
        where: { email: user.email, isActive: true, tenantId: { not: null } },
        select: { tenant: { select } },
      }),
    );
    return rows
      .map((r) => r.tenant)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every tenant with details (platform admin page). */
  @Get()
  @UseGuards(RequireSuperGuard)
  async list(@Req() req: Request) {
    const user = req.user as UserContext;
    const [tenants, rates] = await Promise.all([
      this.prisma.tenant.findMany({
        select: { id: true, name: true, slug: true, internalDomains: true, modules: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      // The caller's own rate in each tenant: across tenants, so unscoped (filtered to their own rows).
      runUnscoped(() => this.prisma.superUserRate.findMany({ where: { userId: user.id }, select: { tenantId: true, hourlyRate: true } })),
    ]);
    const byTenant = new Map(rates.map((r) => [r.tenantId, Number(r.hourlyRate)]));
    return tenants.map((t) => ({ ...t, myHourlyRate: byTenant.get(t.id) ?? null }));
  }

  /** Edit a tenant's name, slug (which is also its email capture address) and internal domains. */
  @Patch(':id')
  @UseGuards(RequireSuperGuard)
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tenant not found');
    const data: { name?: string; slug?: string; internalDomains?: string[]; modules?: string[] } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      data.name = name;
    }
    if (dto.internalDomains !== undefined) {
      data.internalDomains = [...new Set(dto.internalDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
    }
    if (dto.modules !== undefined) {
      data.modules = sanitizeModules(dto.modules);
      // Switching Bookings off takes the tenant's public booking pages down, so only allow it once none are live.
      if (existing.modules.includes('bookings') && !data.modules.includes('bookings')) {
        const live = await runWithTenant(id, () => this.prisma.bookingType.count({ where: { isActive: true } }));
        if (live) {
          throw new ConflictException(
            `This tenant has ${live} active booking page${live === 1 ? '' : 's'}. Turn ${live === 1 ? 'it' : 'them'} off in Bookings before switching the module off.`,
          );
        }
      }
    }
    const slugChanged = dto.slug !== undefined && dto.slug !== existing.slug;
    if (slugChanged) {
      if (await this.prisma.tenant.findUnique({ where: { slug: dto.slug } })) {
        throw new ConflictException(`A tenant with slug "${dto.slug}" already exists`);
      }
      const aliasTaken = await runUnscoped(() => this.prisma.inboundAlias.findUnique({ where: { alias: dto.slug! } }));
      if (aliasTaken && aliasTaken.tenantId !== id) throw new ConflictException(`The address "${dto.slug}" is already in use`);
      data.slug = dto.slug;
    }
    const tenant = await this.prisma.tenant.update({ where: { id }, data });
    if (slugChanged) {
      // The primary capture address follows the slug.
      await runUnscoped(async () => {
        const primary = await this.prisma.inboundAlias.findFirst({ where: { tenantId: id, isPrimary: true } });
        if (primary) await this.prisma.inboundAlias.update({ where: { id: primary.id }, data: { alias: dto.slug! } });
        else if (!(await this.prisma.inboundAlias.findUnique({ where: { alias: dto.slug! } }))) {
          await this.prisma.inboundAlias.create({ data: { alias: dto.slug!, tenantId: id, isPrimary: true } });
        }
      });
    }
    if (dto.myHourlyRate !== undefined) await this.setMyRate((req.user as UserContext).id, id, dto.myHourlyRate);
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, internalDomains: tenant.internalDomains, modules: tenant.modules };
  }

  /** The super user's pay rate in a tenant (any tenant, not just the current one, so tenantId is explicit). */
  private async setMyRate(userId: string, tenantId: string, rate: number | null) {
    await runWithTenant(tenantId, async () => {
      if (rate == null) {
        await this.prisma.superUserRate.deleteMany({ where: { userId } });
        return;
      }
      await this.prisma.superUserRate.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { userId, hourlyRate: rate },
        update: { hourlyRate: rate },
      });
    });
  }

  /** Create a tenant and its primary inbound-email alias. Add its first admin from Users after switching in. */
  @Post()
  @UseGuards(RequireSuperGuard)
  async create(@Body() dto: CreateTenantDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const internalDomains = [...new Set((dto.internalDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean))];
    if (await this.prisma.tenant.findUnique({ where: { slug: dto.slug } })) {
      throw new ConflictException(`A tenant with slug "${dto.slug}" already exists`);
    }
    const modules = dto.modules !== undefined ? sanitizeModules(dto.modules) : [...DEFAULT_MODULES];
    const tenant = await this.prisma.tenant.create({ data: { name, slug: dto.slug, internalDomains, modules } });
    // Capture address <slug>@in.<domain>; unscoped because no request tenant exists yet (tenantId is explicit).
    await runUnscoped(async () => {
      const taken = await this.prisma.inboundAlias.findUnique({ where: { alias: dto.slug } });
      if (!taken) await this.prisma.inboundAlias.create({ data: { alias: dto.slug, tenantId: tenant.id, isPrimary: true } });
    });
    // Preset roles, the starter pipeline and Business settings company name (tenant display name).
    await runWithTenant(tenant.id, async () => {
      await ensurePresetRoles(this.prisma);
      await createStarterPipeline(this.prisma);
      await this.prisma.organizationProfile.create({ data: { companyName: name } });
    });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, internalDomains: tenant.internalDomains, modules: tenant.modules };
  }
}
