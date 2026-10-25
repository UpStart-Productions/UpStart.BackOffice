import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { RequireSuperGuard } from './require-super.guard';
import { runUnscoped, runWithTenant } from './tenant-context';
import { ensurePresetRoles } from '../access/role-presets.util';

export class CreateTenantDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @Matches(/^[a-z0-9-]{2,40}$/, { message: 'Slug: 2-40 characters, a-z, 0-9 and dashes' }) slug!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) internalDomains?: string[];
}

export class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,40}$/, { message: 'Slug: 2-40 characters, a-z, 0-9 and dashes' }) slug?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) internalDomains?: string[];
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
  list() {
    return this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, internalDomains: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Edit a tenant's name, slug (which is also its email capture address) and internal domains. */
  @Patch(':id')
  @UseGuards(RequireSuperGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tenant not found');
    const data: { name?: string; slug?: string; internalDomains?: string[] } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      data.name = name;
    }
    if (dto.internalDomains !== undefined) {
      data.internalDomains = [...new Set(dto.internalDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
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
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, internalDomains: tenant.internalDomains };
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
    const tenant = await this.prisma.tenant.create({ data: { name, slug: dto.slug, internalDomains } });
    // Capture address <slug>@in.<domain>; unscoped because no request tenant exists yet (tenantId is explicit).
    await runUnscoped(async () => {
      const taken = await this.prisma.inboundAlias.findUnique({ where: { alias: dto.slug } });
      if (!taken) await this.prisma.inboundAlias.create({ data: { alias: dto.slug, tenantId: tenant.id, isPrimary: true } });
    });
    // Preset roles and Business settings company name (tenant display name).
    await runWithTenant(tenant.id, async () => {
      await ensurePresetRoles(this.prisma);
      await this.prisma.organizationProfile.create({ data: { companyName: name } });
    });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, internalDomains: tenant.internalDomains };
  }
}
