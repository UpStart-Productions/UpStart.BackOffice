import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Request } from 'express';
import { isAdminRole } from '@upstart/back-office/shared';
import { AccessGuard, AdminOnly, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import type { FieldOption } from '../task-manager/task-fields.util';
import { CLIENT_FIELD_TYPES, ClientFieldTypeValue, clientFieldOptions, coerceClientFieldValue } from './client-fields.util';

class OptionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(120) label!: string;
}

export class SectionDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsBoolean() sensitive?: boolean;
}

export class UpdateSectionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() sensitive?: boolean;
}

export class CreateFieldDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(CLIENT_FIELD_TYPES) type!: ClientFieldTypeValue;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}

/** The type can't change once values may exist. */
export class UpdateFieldDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}

export class MoveDto {
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}

export class SetValuesDto {
  /** fieldId -> value (null or empty clears it). Fields left out are unchanged. */
  @IsObject() values!: Record<string, unknown>;
}

const fieldSelect = { id: true, name: true, type: true, options: true, sortOrder: true } as const;

type FieldRow = { id: string; name: string; type: ClientFieldTypeValue; options: Prisma.JsonValue; sortOrder: number };

function fieldView(f: FieldRow) {
  return { id: f.id, name: f.name, type: f.type, options: (f.options as FieldOption[] | null) ?? [] };
}

/**
 * Client custom fields. Admins define sections and fields in Settings; the organization page shows them,
 * filled in by anyone who can edit the organization. Sensitive sections are only for admins and people
 * assigned to the organization.
 */
@ApiTags('client-fields')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
export class ClientFieldsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  // ── Setup (Settings → Client fields) ──────────────────────────────────────────

  @Get('client-fields')
  @AdminOnly()
  async list() {
    const sections = await this.prisma.clientFieldSection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        sensitive: true,
        fields: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { ...fieldSelect, _count: { select: { values: true } } } },
      },
    });
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      sensitive: s.sensitive,
      fields: s.fields.map((f) => ({ ...fieldView(f), valueCount: f._count.values })),
    }));
  }

  @Post('client-fields/sections')
  @AdminOnly()
  async createSection(@Body() dto: SectionDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const last = await this.prisma.clientFieldSection.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const s = await this.prisma.clientFieldSection.create({
      data: { name, sensitive: !!dto.sensitive, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return { id: s.id, name: s.name, sensitive: s.sensitive, fields: [] };
  }

  @Patch('client-fields/sections/:id')
  @AdminOnly()
  async updateSection(@Param('id') id: string, @Body() dto: UpdateSectionDto) {
    await this.findSection(id);
    const data: Prisma.ClientFieldSectionUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required');
      data.name = dto.name.trim();
    }
    if (dto.sensitive !== undefined) data.sensitive = dto.sensitive;
    const s = await this.prisma.clientFieldSection.update({ where: { id }, data });
    return { id: s.id, name: s.name, sensitive: s.sensitive };
  }

  /** Deletes the section, its fields and every value in them. */
  @Delete('client-fields/sections/:id')
  @AdminOnly()
  async deleteSection(@Param('id') id: string) {
    await this.findSection(id);
    await this.prisma.clientFieldSection.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('client-fields/sections/:id/move')
  @AdminOnly()
  async moveSection(@Param('id') id: string, @Body() dto: MoveDto) {
    const rows = await this.prisma.clientFieldSection.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
    await this.reorder(rows.map((r) => r.id), id, dto.direction, (rid, sortOrder) =>
      this.prisma.clientFieldSection.update({ where: { id: rid }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  @Post('client-fields/sections/:id/fields')
  @AdminOnly()
  async createField(@Param('id') sectionId: string, @Body() dto: CreateFieldDto) {
    await this.findSection(sectionId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const options = clientFieldOptions(dto.type, dto.options);
    if ((dto.type === 'SINGLE_SELECT' || dto.type === 'MULTI_SELECT') && !options.length) {
      throw new BadRequestException('Add at least one option');
    }
    const last = await this.prisma.clientField.findFirst({ where: { sectionId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const f = await this.prisma.clientField.create({
      data: {
        sectionId,
        name,
        type: dto.type,
        options: options.length ? (options as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: fieldSelect,
    });
    return fieldView(f);
  }

  @Patch('client-fields/fields/:id')
  @AdminOnly()
  async updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    const field = await this.findField(id);
    const data: Prisma.ClientFieldUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required');
      data.name = dto.name.trim();
    }
    if (dto.options !== undefined && (field.type === 'SINGLE_SELECT' || field.type === 'MULTI_SELECT')) {
      const options = clientFieldOptions(field.type, dto.options);
      if (!options.length) throw new BadRequestException('Add at least one option');
      data.options = options as unknown as Prisma.InputJsonValue;
    }
    const f = await this.prisma.clientField.update({ where: { id }, data, select: fieldSelect });
    return fieldView(f);
  }

  /** Deletes the field and its value on every organization. */
  @Delete('client-fields/fields/:id')
  @AdminOnly()
  async deleteField(@Param('id') id: string) {
    await this.findField(id);
    await this.prisma.clientField.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('client-fields/fields/:id/move')
  @AdminOnly()
  async moveField(@Param('id') id: string, @Body() dto: MoveDto) {
    const field = await this.findField(id);
    const rows = await this.prisma.clientField.findMany({
      where: { sectionId: field.sectionId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await this.reorder(rows.map((r) => r.id), id, dto.direction, (rid, sortOrder) =>
      this.prisma.clientField.update({ where: { id: rid }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  // ── Values (organization page) ─────────────────────────────────────────────────

  /** Sections (with fields and this organization's values) the user may see. Empty sections are left out. */
  @Get('clients/:id/fields')
  @Area('clients')
  async values(@Req() req: Request, @Param('id') clientId: string) {
    const user = req.user as UserContext;
    await this.assertReach(user, clientId);
    const seeSensitive = await this.canSeeSensitive(user, clientId);
    const sections = await this.prisma.clientFieldSection.findMany({
      where: seeSensitive ? {} : { sensitive: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        sensitive: true,
        fields: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { ...fieldSelect, values: { where: { clientId }, select: { value: true } } },
        },
      },
    });
    return sections
      .filter((s) => s.fields.length)
      .map((s) => ({
        id: s.id,
        name: s.name,
        sensitive: s.sensitive,
        fields: s.fields.map((f) => ({ ...fieldView(f), value: f.values[0]?.value ?? null })),
      }));
  }

  /** Save several values at once (the organization page's Save). */
  @Put('clients/:id/fields')
  @Area('clients')
  async setValues(@Req() req: Request, @Param('id') clientId: string, @Body() dto: SetValuesDto) {
    const user = req.user as UserContext;
    await this.assertReach(user, clientId);
    const ids = Object.keys(dto.values ?? {});
    if (!ids.length) return this.values(req, clientId);
    const seeSensitive = await this.canSeeSensitive(user, clientId);
    const fields = await this.prisma.clientField.findMany({
      where: { id: { in: ids }, ...(seeSensitive ? {} : { section: { sensitive: false } }) },
      select: { id: true, name: true, type: true, options: true },
    });
    if (fields.length !== ids.length) throw new NotFoundException('Field not found');
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const f of fields) {
      let coerced: unknown;
      try {
        coerced = coerceClientFieldValue(f.type, (f.options as FieldOption[] | null) ?? [], dto.values[f.id]);
      } catch (err) {
        throw new BadRequestException(`${f.name}: ${err instanceof Error ? err.message : 'Invalid value'}`);
      }
      ops.push(
        coerced === null
          ? this.prisma.clientFieldValue.deleteMany({ where: { clientId, fieldId: f.id } })
          : this.prisma.clientFieldValue.upsert({
              where: { clientId_fieldId: { clientId, fieldId: f.id } },
              create: { clientId, fieldId: f.id, value: coerced as Prisma.InputJsonValue },
              update: { value: coerced as Prisma.InputJsonValue },
            }),
      );
    }
    await this.prisma.$transaction(ops);
    return this.values(req, clientId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────

  /** 404 (not 403) for an organization outside the user's reach, so ids can't be probed. */
  private async assertReach(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Client not found');
    const exists = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Client not found');
  }

  /** Sensitive sections: admins, and people assigned to the organization. */
  private async canSeeSensitive(user: UserContext, clientId: string): Promise<boolean> {
    if (isAdminRole(user.role)) return true;
    const assigned = await this.prisma.clientAssignment.findFirst({ where: { clientId, userId: user.id }, select: { id: true } });
    return !!assigned;
  }

  private async findSection(id: string) {
    const s = await this.prisma.clientFieldSection.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Section not found');
    return s;
  }

  private async findField(id: string) {
    const f = await this.prisma.clientField.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Field not found');
    return f;
  }

  /** Swap a row with its neighbour and renumber the list 0..n. */
  private async reorder(
    ids: string[],
    id: string,
    direction: 'up' | 'down',
    write: (id: string, sortOrder: number) => Prisma.PrismaPromise<unknown>,
  ) {
    const i = ids.indexOf(id);
    if (i < 0) throw new NotFoundException('Not found');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await this.prisma.$transaction(ids.map((rid, index) => write(rid, index)));
  }
}
