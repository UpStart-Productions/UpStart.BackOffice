import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { RequireSuperGuard } from '../auth/require-super.guard';
import { CognitoService } from '../cognito/cognito.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, SetUserActiveDto, UpdateUserDto } from './dto/user.dto';

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
  role: 'ADMIN' | 'MEMBER';
  hourlyRate: { toNumber?: () => number } | null;
  isActive: boolean;
  isSuper: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: displayName(user),
    role: user.role,
    hourlyRate: user.hourlyRate != null ? Number(user.hourlyRate) : null,
    isActive: user.isActive,
    isSuper: user.isSuper,
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
        isSuper: true,
      },
    });
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      name: displayName(row),
      avatarUrl: row.avatarUrl,
      role: row.role,
      hourlyRate: row.hourlyRate != null ? Number(row.hourlyRate) : null,
      isSuper: row.isSuper,
    };
  }

  @Get()
  @UseGuards(RequireSuperGuard)
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });
    return { users: users.map(toListItem) };
  }

  @Post()
  @UseGuards(RequireSuperGuard)
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
      },
    });

    return { user: toListItem(user) };
  }

  @Patch(':id')
  @UseGuards(RequireSuperGuard)
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

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
        ...(dto.firstName !== undefined && { firstName }),
        ...(dto.lastName !== undefined && { lastName }),
        ...(dto.firstName !== undefined || dto.lastName !== undefined ? { name } : {}),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
    });

    return { user: toListItem(user) };
  }

  @Patch(':id/active')
  @UseGuards(RequireSuperGuard)
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
  @UseGuards(RequireSuperGuard)
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
  @UseGuards(RequireSuperGuard)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const caller = req.user as UserContext;
    if (caller.id === id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
