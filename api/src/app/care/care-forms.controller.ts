import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { isSelectFieldType, type CareFormDto, type FormFieldOption, type FormFieldType } from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { CareAccessService } from './care-access.service';
import { CareLinksService } from './care-links.service';
import { ensureCareForms, sanitizeFormAccess } from './care-forms.util';
import { CreateFieldDto, CreateLinkDto, MoveDto, SectionDto, UpdateCareFormDto, UpdateFieldDto } from './care.dto';
import { formFieldOptions } from './form-fields.util';

const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
const FIELD_SELECT = { id: true, name: true, type: true, options: true, required: true } as const;

type FieldRow = { id: string; name: string; type: FormFieldType; options: Prisma.JsonValue; required: boolean };
export function fieldView(f: FieldRow) {
  return { id: f.id, name: f.name, type: f.type, options: (f.options as FormFieldOption[] | null) ?? [], required: f.required };
}

/**
 * Customize fields (Care → Intake / Care profiles): the tenant's Intake form and Care profile, their sections and fields, who can use them
 * (per role) and their public links. Changing a form needs Care Setup; reading one needs access to it.
 */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('care')
@Controller('care')
export class CareFormsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly care: CareAccessService,
    private readonly links: CareLinksService,
  ) {}

  /** Forms the user can use (all of them for Setup), with field counts. */
  @Get('forms')
  async list(@Req() req: Request) {
    const user = req.user as UserContext;
    await ensureCareForms(this.prisma);
    const roleId = await this.care.roleId(user);
    const setup = this.care.canSetup(user);
    const forms = await this.prisma.careForm.findMany({
      orderBy: { kind: 'asc' },
      select: {
        id: true, kind: true, name: true, description: true, access: true,
        sections: { select: { _count: { select: { fields: true } } } },
        _count: { select: { records: true, links: true } },
      },
    });
    const out = [];
    for (const f of forms) {
      const myAccess = await this.care.formAccess(user, f, roleId);
      if (!myAccess && !setup) continue;
      out.push({
        id: f.id, kind: f.kind, name: f.name, description: f.description,
        access: sanitizeFormAccess(f.access),
        fieldCount: f.sections.reduce((n, s) => n + s._count.fields, 0),
        recordCount: f._count.records,
        linkCount: f._count.links,
        myAccess,
      });
    }
    return { forms: out, canSetup: setup };
  }

  /** Roles for the "Who can use it" table. */
  @Get('roles')
  @Action('setup')
  roles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  }

  @Get('forms/:id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<CareFormDto> {
    const user = req.user as UserContext;
    const form = await this.findForm(id);
    const myAccess = await this.care.formAccess(user, form);
    if (!myAccess && !this.care.canSetup(user)) throw new NotFoundException('Form not found');
    const sections = await this.prisma.careFormSection.findMany({
      where: { formId: id },
      orderBy: ORDER,
      select: { id: true, name: true, fields: { orderBy: ORDER, select: FIELD_SELECT } },
    });
    // How many records have each field filled in (shown in setup before deleting a field).
    const records = await this.prisma.careRecord.findMany({ where: { formId: id }, select: { values: true } });
    const counts = new Map<string, number>();
    for (const r of records) {
      for (const [k, v] of Object.entries((r.values ?? {}) as Record<string, unknown>)) {
        if (v !== null && v !== undefined) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return {
      id: form.id,
      kind: form.kind,
      name: form.name,
      description: form.description,
      access: sanitizeFormAccess(form.access),
      myAccess,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        fields: s.fields.map((f) => ({ ...fieldView(f), valueCount: counts.get(f.id) ?? 0 })),
      })),
    };
  }

  @Patch('forms/:id')
  @Action('setup')
  async update(@Param('id') id: string, @Body() dto: UpdateCareFormDto) {
    await this.findForm(id);
    const data: Prisma.CareFormUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required');
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.access !== undefined) {
      const roles = new Set((await this.prisma.role.findMany({ select: { id: true } })).map((r) => r.id));
      const access = sanitizeFormAccess(dto.access);
      for (const roleId of Object.keys(access)) if (!roles.has(roleId)) delete access[roleId];
      data.access = access;
    }
    const f = await this.prisma.careForm.update({ where: { id }, data });
    return { id: f.id, name: f.name, description: f.description, access: sanitizeFormAccess(f.access) };
  }

  // ── Sections ───────────────────────────────────────────────────────────────

  @Post('forms/:id/sections')
  @Action('setup')
  async createSection(@Param('id') formId: string, @Body() dto: SectionDto) {
    await this.findForm(formId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const last = await this.prisma.careFormSection.findFirst({ where: { formId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const s = await this.prisma.careFormSection.create({ data: { formId, name, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    return { id: s.id, name: s.name, fields: [] };
  }

  @Patch('sections/:id')
  @Action('setup')
  async updateSection(@Param('id') id: string, @Body() dto: SectionDto) {
    await this.findSection(id);
    if (!dto.name.trim()) throw new BadRequestException('Name is required');
    const s = await this.prisma.careFormSection.update({ where: { id }, data: { name: dto.name.trim() } });
    return { id: s.id, name: s.name };
  }

  /** Deletes the section and its fields; their answers disappear from every record. */
  @Delete('sections/:id')
  @Action('setup')
  async deleteSection(@Param('id') id: string) {
    await this.findSection(id);
    await this.prisma.careFormSection.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('sections/:id/move')
  @Action('setup')
  async moveSection(@Param('id') id: string, @Body() dto: MoveDto) {
    const section = await this.findSection(id);
    const rows = await this.prisma.careFormSection.findMany({ where: { formId: section.formId }, orderBy: ORDER, select: { id: true } });
    await this.reorder(rows.map((r) => r.id), id, dto.direction, (rid, sortOrder) =>
      this.prisma.careFormSection.update({ where: { id: rid }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  // ── Fields ─────────────────────────────────────────────────────────────────

  @Post('sections/:id/fields')
  @Action('setup')
  async createField(@Param('id') sectionId: string, @Body() dto: CreateFieldDto) {
    await this.findSection(sectionId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const options = formFieldOptions(dto.type, dto.options);
    if (isSelectFieldType(dto.type) && !options.length) throw new BadRequestException('Add at least one option');
    const last = await this.prisma.careFormField.findFirst({ where: { sectionId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const f = await this.prisma.careFormField.create({
      data: {
        sectionId,
        name,
        type: dto.type,
        required: !!dto.required,
        options: options.length ? (options as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: FIELD_SELECT,
    });
    return fieldView(f);
  }

  @Patch('fields/:id')
  @Action('setup')
  async updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    const field = await this.findField(id);
    const data: Prisma.CareFormFieldUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required');
      data.name = dto.name.trim();
    }
    if (dto.required !== undefined) data.required = dto.required;
    if (dto.options !== undefined && isSelectFieldType(field.type)) {
      const options = formFieldOptions(field.type, dto.options);
      if (!options.length) throw new BadRequestException('Add at least one option');
      data.options = options as unknown as Prisma.InputJsonValue;
    }
    const f = await this.prisma.careFormField.update({ where: { id }, data, select: FIELD_SELECT });
    return fieldView(f);
  }

  /** Deletes the field; its answers disappear from every record. */
  @Delete('fields/:id')
  @Action('setup')
  async deleteField(@Param('id') id: string) {
    await this.findField(id);
    await this.prisma.careFormField.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('fields/:id/move')
  @Action('setup')
  async moveField(@Param('id') id: string, @Body() dto: MoveDto) {
    const field = await this.findField(id);
    const rows = await this.prisma.careFormField.findMany({ where: { sectionId: field.sectionId }, orderBy: ORDER, select: { id: true } });
    await this.reorder(rows.map((r) => r.id), id, dto.direction, (rid, sortOrder) =>
      this.prisma.careFormField.update({ where: { id: rid }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  // ── Public links (form level) ──────────────────────────────────────────────

  /** Every link for this form: new-intake links and per-organization links. */
  @Get('forms/:id/links')
  @Action('setup')
  async formLinks(@Param('id') formId: string) {
    await this.findForm(formId);
    return this.links.list({ formId });
  }

  /** A new-intake link (Intake form only). Per-organization links are made from the record. */
  @Post('forms/:id/links')
  @Action('setup')
  async createIntakeLink(@Req() req: Request, @Param('id') formId: string, @Body() dto: CreateLinkDto) {
    const form = await this.findForm(formId);
    if (form.kind !== 'INTAKE') throw new BadRequestException('New-intake links are only for the Intake form');
    return this.links.create(req.user as UserContext, { formId, kind: 'NEW_INTAKE', clientId: null }, dto);
  }

  @Post('links/:id/revoke')
  async revoke(@Req() req: Request, @Param('id') id: string) {
    return this.links.revoke(req.user as UserContext, id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async findForm(id: string) {
    const f = await this.prisma.careForm.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Form not found');
    return f;
  }

  private async findSection(id: string) {
    const s = await this.prisma.careFormSection.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Section not found');
    return s;
  }

  private async findField(id: string) {
    const f = await this.prisma.careFormField.findUnique({ where: { id } });
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
