import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { presetFor } from '@upstart/back-office/shared';
import { ensurePresetRoles } from '../access/role-presets.util';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { AccessGuard, AdminOnly } from '../access/access.guard';

function toUserPreview(u: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || null,
    avatarUrl: toPublicAssetUrl(u.avatarUrl),
    isActive: u.isActive,
  };
}

function toView(
  r: { id: string; name: string; key?: string | null; _count?: { users: number } },
  previewUsers: ReturnType<typeof toUserPreview>[] = [],
) {
  const preset = presetFor(r.key);
  return {
    id: r.id,
    name: r.name,
    key: r.key ?? null,
    description: preset?.description ?? '',
    permissions: preset?.permissions ?? {},
    actions: preset?.actions ?? {},
    userCount: r._count?.users ?? 0,
    previewUsers,
  };
}

/**
 * The tenant's roles for USER accounts: always Member and Guest, defined in code (libs/shared permissions.ts).
 * Read-only: nobody creates, edits or deletes roles. Admins are a user type, not a role.
 */
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
    const roles = await this.prisma.role.findMany({ include: { _count: { select: { users: true } } } });
    const members = await this.prisma.user.findMany({
      where: { roleId: { not: null } },
      select: {
        roleId: true,
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        name: true,
        avatarUrl: true,
        isActive: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });
    const previews = new Map<string, ReturnType<typeof toUserPreview>[]>();
    for (const u of members) {
      const roleId = u.roleId!;
      const list = previews.get(roleId) ?? [];
      if (list.length < 3) list.push(toUserPreview(u));
      previews.set(roleId, list);
    }
    const order = (key: string | null) => (key === 'member' ? 0 : key === 'guest' ? 1 : 2);
    return roles
      .sort((a, b) => order(a.key) - order(b.key))
      .map((r) => toView(r, previews.get(r.id) ?? []));
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
    return users.map((u) => toUserPreview(u));
  }
}
