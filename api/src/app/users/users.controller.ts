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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { isAdminRole, type UserRole } from '@upstart/back-office/shared';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { CognitoService } from '../cognito/cognito.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { ImageResizeService } from '../storage/image-resize.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateUserDto, SetUserActiveDto, UpdateUserDto } from './dto/user.dto';

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
  client?: { id: string; name: string; code: string } | null;
}) {
  return {
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
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly imageResize: ImageResizeService,
  ) {}

  @Get('me')
  async me(@Req() req: Request) {
    const user = req.user as UserContext;
    const row = await this.prisma.user.findUniqueOrThrow({
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
      },
    });
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
    };
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  async uploadMyAvatar(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    const caller = req.user as UserContext;
    return this.uploadAvatarForUser(caller.id, file);
  }

  @Get()
  @UseGuards(RequireAdminGuard)
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      include: {
        client: { select: { id: true, name: true, code: true } },
      },
    });
    return { users: users.map(toListItem) };
  }

  @Post()
  @UseGuards(RequireAdminGuard)
  async create(@Body() dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    const firstName = dto.firstName?.trim() || null;
    const lastName = dto.lastName?.trim() || null;
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        name,
        role: dto.role,
        hourlyRate: dto.hourlyRate,
        clientId: null,
      },
      include: {
        client: { select: { id: true, name: true, code: true } },
      },
    });

    return { user: toListItem(user) };
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
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      include: {
        client: { select: { id: true, name: true, code: true } },
      },
    });

    return { user: toListItem(user) };
  }

  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  async uploadUserAvatar(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    const caller = req.user as UserContext;
    const targetUserId = id === 'me' ? caller.id : id;

    if (targetUserId !== caller.id && !isAdminRole(caller.role)) {
      throw new ForbiddenException('Admin access required');
    }

    const existing = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) throw new NotFoundException('User not found');
    return this.uploadAvatarForUser(targetUserId, file);
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
  async invite(@Param('id') id: string) {
    if (!this.cognito.isConfigured) {
      throw new BadRequestException(
        'Email/password sign-in is not configured. Set up Cognito to invite users.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.cognito.createUserForEmail(user.email);
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
