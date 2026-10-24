import { BadRequestException, Body, ConflictException, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenants the caller may act in: all of them for a super user, otherwise just their own. */
  @Get('mine')
  async mine(@Req() req: Request) {
    const user = req.user as UserContext;
    const select = { id: true, name: true, slug: true } as const;
    if (user.isSuper) return this.prisma.tenant.findMany({ select, orderBy: { name: 'asc' } });
    if (!user.tenantId) return [];
    const own = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select });
    return own ? [own] : [];
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
    // Every tenant starts with the same preset roles (editable later under Users > Roles).
    await runWithTenant(tenant.id, () => ensurePresetRoles(this.prisma));
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, internalDomains: tenant.internalDomains };
  }
}
