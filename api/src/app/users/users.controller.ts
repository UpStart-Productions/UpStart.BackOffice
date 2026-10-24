import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { isAdminRole, sanitizePermissions, type UserRole } from '@upstart/back-office/shared';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { InvitesService } from '../invites/invites.service';
import { CognitoService } from '../cognito/cognito.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { runUnscoped } from '../tenancy/tenant-context';
import { ImageResizeService } from '../storage/image-resize.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateUserDto, SetUserActiveDto, UpdateUserDto, UploadAvatarDto } from './dto/user.dto';

const ALLOWED_AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
}) {
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fromParts || user.name?.trim() || user.email;
}

function toListItem(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  hourlyRate: { toNumber?: () => number } | null;
  isActive: boolean;
  clientId: string | null;
  roleId?: string | null;
  tenantRole?: { id: string; name: string } | null;
  client?: { id: string; name: string; code: string } | null;
}) {
  return {
    roleId: user.roleId ?? null,
    roleName: user.tenantRole?.name ?? null,
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: displayName(user),
    avatarUrl: toPublicAssetUrl(user.avatarUrl),
    role: user.role,
    hourlyRate: user.hourlyRate != null ? Number(user.hourlyRate) : null,
    isActive: user.isActive,
    clientId: user.clientId,
    client: user.client ?? null,
  };
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cognito: CognitoService,
    private readonly invites: InvitesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly imageResize: ImageResizeService,
  ) {}

  @Get('me')
  async me(@Req() req: Request) {
    const user = req.user as UserContext;
    // Unscoped: a super user switched into another tenant must still find their own row.
    const row = await runUnscoped(() =>
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          avatarUrl: true,
          role: true,
          hourlyRate: true,
          clientId: true,
          tenantId: true,
          isSuper: true,
          tenantRole: { select: { name: true, permissions: true } },
        },
      }),
    );
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      name: displayName(row),
      avatarUrl: toPublicAssetUrl(row.avatarUrl),
      role: row.role,
      hourlyRate: row.hourlyRate != null ? Number(row.hourlyRate) : null,
      clientId: row.clientId,
      tenantId: row.tenantId,
      isSuper: row.isSuper,
      roleName: row.tenantRole?.name ?? null,
      permissions: sanitizePermissions(row.tenantRole?.permissions),
    };
  }

  @Post('me/avatar')
  async uploadMyAvatar(@Req() req: Request, @Body() dto: UploadAvatarDto) {
    const caller = req.user as UserContext;
    return this.uploadAvatarFromDto(caller.id, dto);
  }

  @Get()
  @UseGuards(RequireAdminGuard)
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      include: {
        client: { select: { id: true, name: true, code: true } },
        tenantRole: { select: { id: true, name: true } },
      },
    });
    return { users: users.map(toListItem) };
  }

  @Post()
  @UseGuards(RequireAdminGuard)
  async create(@Body() dto: CreateUserDto, @Req() req: Request) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const firstName = dto.firstName?.trim() || null;
    const lastName = dto.lastName?.trim() || null;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

    const roleId = await this.resolveRoleId(dto.role, dto.roleId);

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        name,
        role: dto.role,
        roleId,
        hourlyRate: dto.hourlyRate,
        clientId: null,
      },
      include: {
        client: { select: { id: true, name: true, code: true } },
        tenantRole: { select: { id: true, name: true } },
      },
    });

    const invite = await this.invites.sendWelcomeInvite({ user, invitedBy: req.user as UserContext });
    return { user: toListItem(user), invite };
  }

  @Patch(':id')
  @UseGuards(RequireAdminGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.email !== undefined) {
      const newEmail = dto.email.trim().toLowerCase();
      const conflict = await this.prisma.user.findFirst({
        where: { email: newEmail, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Another user already has this email.');
    }

    const firstName =
      dto.firstName !== undefined ? dto.firstName.trim() || null : existing.firstName;
    const lastName =
      dto.lastName !== undefined ? dto.lastName.trim() || null : existing.lastName;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

    // Admins have no tenant role. Users need one. Changing role type or picking a role updates roleId.
    const effectiveRole = dto.role ?? existing.role;
    let newRoleId: string | null | undefined;
    if (effectiveRole === 'ADMIN') {
      if (dto.role !== undefined || dto.roleId !== undefined) newRoleId = null;
    } else if (dto.roleId !== undefined || dto.role !== undefined) {
      newRoleId = await this.resolveRoleId(effectiveRole, dto.roleId ?? existing.roleId ?? undefined);
    }

    if (dto.avatarUrl === null && existing.avatarUrl) {
      await this.deleteStoredAvatar(existing.avatarUrl);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
        ...(dto.firstName !== undefined && { firstName }),
        ...(dto.lastName !== undefined && { lastName }),
        ...(dto.firstName !== undefined || dto.lastName !== undefined ? { name } : {}),
        ...(dto.role !== undefined && { role: dto.role, clientId: null }),
        ...(newRoleId !== undefined && { roleId: newRoleId }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      include: {
        client: { select: { id: true, name: true, code: true } },
        tenantRole: { select: { id: true, name: true } },
      },
    });

    return { user: toListItem(user) };
  }

  @Post(':id/avatar')
  async uploadUserAvatar(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UploadAvatarDto,
  ) {
    const caller = req.user as UserContext;
    const targetUserId = id === 'me' ? caller.id : id;

    if (targetUserId !== caller.id && !isAdminRole(caller.role)) {
      throw new ForbiddenException('Admin access required');
    }

    const existing = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) throw new NotFoundException('User not found');
    return this.uploadAvatarFromDto(targetUserId, dto);
  }

  @Patch(':id/active')
  @UseGuards(RequireAdminGuard)
  async setActive(@Req() req: Request, @Param('id') id: string, @Body() dto: SetUserActiveDto) {
    const caller = req.user as UserContext;
    if (caller.id === id && !dto.isActive) {
      throw new ForbiddenException('You cannot disable your own account.');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    return { updated: true };
  }

  @Post(':id/invite')
  @UseGuards(RequireAdminGuard)
  async invite(@Param('id') id: string, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.invites.sendWelcomeInvite({ user, invitedBy: req.user as UserContext });
  }

  @Delete(':id')
  @UseGuards(RequireAdminGuard)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const caller = req.user as UserContext;
    if (caller.id === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (existing.avatarUrl) {
      await this.deleteStoredAvatar(existing.avatarUrl);
    }

    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  /** Admins have no tenant role. Users must be given one that exists in this tenant. */
  private async resolveRoleId(role: UserRole, roleId?: string | null): Promise<string | null> {
    if (role === 'ADMIN') return null;
    if (!roleId) throw new BadRequestException('Choose a role for this user.');
    const found = await this.prisma.role.findFirst({ where: { id: roleId }, select: { id: true } });
    if (!found) throw new BadRequestException('That role does not exist.');
    return found.id;
  }

  private uploadAvatarFromDto(userId: string, dto: UploadAvatarDto) {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid file data');
    }
    if (!buffer.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (buffer.length > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Image must be less than 5MB');
    }
    return this.uploadAvatarForUser(userId, { buffer, mimetype: dto.mimeType });
  }

  private async uploadAvatarForUser(
    userId: string,
    file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (!ALLOWED_AVATAR_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    const processed = await this.imageResize.process(file.buffer, file.mimetype, 'avatar');
    const filename = `${userId}-${Date.now()}${processed.ext}`;
    const key = `avatars/${userId}/${filename}`;
    const url = await this.storage.upload({
      buffer: processed.buffer,
      key,
      mimeType: processed.mimeType,
    });

    if (existing.avatarUrl) {
      await this.deleteStoredAvatar(existing.avatarUrl);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return { url: toPublicAssetUrl(url) ?? url };
  }

  private async deleteStoredAvatar(avatarUrl: string): Promise<void> {
    try {
      const key = this.storage.keyFromUrl(avatarUrl);
      if (key && !key.startsWith('http')) {
        await this.storage.delete(key);
      }
    } catch {
      /* best-effort cleanup */
    }
  }
}
