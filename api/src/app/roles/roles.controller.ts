import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { sanitizePermissions } from '@upstart/back-office/shared';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

export class CreateRoleDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsObject() permissions!: Record<string, unknown>;
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsObject() permissions?: Record<string, unknown>;
}

function toView(r: { id: string; name: string; permissions: unknown; _count?: { users: number } }) {
  return { id: r.id, name: r.name, permissions: sanitizePermissions(r.permissions), userCount: r._count?.users ?? 0 };
}

/** Tenant-defined roles for staff users. Admins manage them; every tenant has its own set. */
@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RequireAdminGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });
    return roles.map(toView);
  }

  @Post()
  async create(@Body() dto: CreateRoleDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (await this.prisma.role.findFirst({ where: { name } })) throw new ConflictException(`A role named "${name}" already exists`);
    const role = await this.prisma.role.create({
      data: { name, permissions: sanitizePermissions(dto.permissions) },
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
      },
      include: { _count: { select: { users: true } } },
    });
    return toView(role);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const role = await this.prisma.role.findFirst({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role._count.users > 0) {
      throw new ConflictException(`${role._count.users} user(s) still have this role. Move them to another role first.`);
    }
    await this.prisma.role.delete({ where: { id } });
    return { deleted: true };
  }
}
