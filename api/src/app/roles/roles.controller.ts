import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { actionsFor, PERMISSION_AREAS, sanitizeActions, sanitizePermissions } from '@upstart/back-office/shared';
import { ensurePresetRoles, presetFor } from '../access/role-presets.util';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AccessGuard, AdminOnly } from '../access/access.guard';

export class CreateRoleDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsObject() permissions!: Record<string, unknown>;
  @IsOptional() @IsObject() actions?: Record<string, unknown>;
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsObject() permissions?: Record<string, unknown>;
  @IsOptional() @IsObject() actions?: Record<string, unknown>;
}

/** JSON with object keys sorted, so two settings compare equal regardless of key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** What a role can actually do: each area it can see, with every checkbox resolved (missing = allowed). */
function effectiveAccess(permissions: unknown, actions: unknown) {
  const perms = sanitizePermissions(permissions);
  const acts = sanitizeActions(actions);
  return Object.fromEntries(
    PERMISSION_AREAS.filter((a) => perms[a]).map((area) => [
      area,
      { view: perms[area], ...Object.fromEntries(actionsFor(area).map((a) => [a, acts[area]?.[a] !== false])) },
    ]),
  );
}

/** True when a built-in role no longer gives the same access as the default (name changes don't count). */
export function isModified(r: { key?: string | null; permissions: unknown; actions?: unknown }): boolean {
  const preset = presetFor(r.key);
  if (!preset) return false;
  return canonical(effectiveAccess(r.permissions, r.actions)) !== canonical(effectiveAccess(preset.permissions, preset.actions));
}

function toView(r: { id: string; name: string; key?: string | null; permissions: unknown; actions?: unknown; _count?: { users: number } }) {
  return {
    id: r.id,
    name: r.name,
    key: r.key ?? null,
    /** A built-in role every tenant starts with: editable, resettable, not deletable. */
    isPreset: !!presetFor(r.key),
    /** A built-in role someone has changed; only then is "Reset to default" offered. */
    isModified: isModified(r),
    permissions: sanitizePermissions(r.permissions),
    actions: sanitizeActions(r.actions),
    userCount: r._count?.users ?? 0,
  };
}

/** Tenant-defined roles for USER accounts. Admins manage them; every tenant has its own set. */
@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@AdminOnly()
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    await ensurePresetRoles(this.prisma);
    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });
    return roles.map(toView);
  }

  @Post()
  async create(@Body() dto: CreateRoleDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (await this.prisma.role.findFirst({ where: { name } })) throw new ConflictException(`A role named "${name}" already exists`);
    const role = await this.prisma.role.create({
      data: { name, permissions: sanitizePermissions(dto.permissions), actions: sanitizeActions(dto.actions) },
      include: { _count: { select: { users: true } } },
    });
    return toView(role);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const existing = await this.prisma.role.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Role not found');
    const name = dto.name?.trim();
    if (name && name !== existing.name && (await this.prisma.role.findFirst({ where: { name, id: { not: id } } }))) {
      throw new ConflictException(`A role named "${name}" already exists`);
    }
    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.permissions !== undefined ? { permissions: sanitizePermissions(dto.permissions) } : {}),
        ...(dto.actions !== undefined ? { actions: sanitizeActions(dto.actions) } : {}),
      },
      include: { _count: { select: { users: true } } },
    });
    return toView(role);
  }

  /** The people who have this role, for the "View users" list. */
  @Get(':id/users')
  async users(@Param('id') id: string) {
    const role = await this.prisma.role.findFirst({ where: { id }, select: { id: true } });
    if (!role) throw new NotFoundException('Role not found');
    const users = await this.prisma.user.findMany({
      where: { roleId: id },
      select: { id: true, email: true, firstName: true, lastName: true, name: true, avatarUrl: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || null,
      avatarUrl: toPublicAssetUrl(u.avatarUrl),
      isActive: u.isActive,
    }));
  }

  /** Put a built-in role back to how every tenant starts (name is kept). */
  @Post(':id/reset')
  async reset(@Param('id') id: string) {
    const existing = await this.prisma.role.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Role not found');
    const preset = presetFor(existing.key);
    if (!preset) throw new BadRequestException('Only built-in roles can be reset.');
    const role = await this.prisma.role.update({
      where: { id },
      data: { permissions: preset.permissions, actions: preset.actions },
      include: { _count: { select: { users: true } } },
    });
    return toView(role);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const role = await this.prisma.role.findFirst({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (presetFor(role.key)) throw new BadRequestException('Built-in roles can\'t be deleted. Edit it or reset it instead.');
    if (role._count.users > 0) {
      throw new ConflictException(`${role._count.users} user(s) still have this role. Move them to another role first.`);
    }
    await this.prisma.role.delete({ where: { id } });
    return { deleted: true };
  }
}
