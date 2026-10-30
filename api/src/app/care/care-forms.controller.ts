import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { CARE_FORM_MODULE, CARE_RECORD_KINDS, type CareFormDto } from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { UserContext } from '../common/app.types';
import { sanitizeFormAccess } from '../forms/form-access.util';
import { CreateFieldDto, CreateLinkDto, MoveDto, OrderDto, SectionDto, UpdateFieldDto, UpdateLinkDto } from '../forms/form.dto';
import { FormLinksService } from '../forms/form-links.service';
import { FormStructureService } from '../forms/form-structure.service';
import { PrismaService } from '../prisma/prisma.service';
import { CareAccessService } from './care-access.service';
import { byCareKind, careKind, ensureCareForms } from './care-forms.util';
import { UpdateCareFormDto } from './care.dto';

const M = CARE_FORM_MODULE;

/**
 * Customize fields (Care → Intake / Care profiles / Visits): Care's forms on the form engine, their sections and
 * fields, who can use them (per role) and their public links. Changing a form needs Care Setup; reading one needs access to it.
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
    private readonly structure: FormStructureService,
    private readonly links: FormLinksService,
  ) {}

  /** Forms the user can use (all of them for Setup), with field counts. */
  @Get('forms')
  async list(@Req() req: Request) {
    const user = req.user as UserContext;
    await ensureCareForms(this.prisma);
    const roleId = await this.care.roleId(user);
    const setup = this.care.canSetup(user);
    const forms = await this.prisma.form.findMany({
      where: { module: M, key: { in: CARE_RECORD_KINDS } },
      select: {
        id: true, key: true, name: true, description: true, access: true,
        sections: { select: { _count: { select: { fields: true } } } },
        _count: { select: { responses: true, links: true } },
      },
    });
    const out = [];
    for (const f of byCareKind(forms)) {
      const myAccess = await this.care.formAccess(user, f, roleId);
      if (!myAccess && !setup) continue;
      out.push({
        id: f.id, kind: careKind(f), name: f.name, description: f.description,
        access: sanitizeFormAccess(f.access),
        fieldCount: f.sections.reduce((n, s) => n + s._count.fields, 0),
        recordCount: f._count.responses,
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
    const form = await this.structure.findForm(id, M);
    const myAccess = await this.care.formAccess(user, form);
    if (!myAccess && !this.care.canSetup(user)) throw new NotFoundException('Form not found');
    const sections = await this.structure.sections(id);
    const counts = await this.structure.valueCounts(id);
    return {
      id: form.id,
      kind: careKind(form),
      name: form.name,
      description: form.description,
      access: sanitizeFormAccess(form.access),
      myAccess,
      sections: sections.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f, valueCount: counts.get(f.id) ?? 0 })) })),
    };
  }

  @Patch('forms/:id')
  @Action('setup')
  async update(@Param('id') id: string, @Body() dto: UpdateCareFormDto) {
    await this.structure.findForm(id, M);
    const data: Prisma.FormUpdateInput = {};
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
    const f = await this.prisma.form.update({ where: { id }, data });
    return { id: f.id, name: f.name, description: f.description, access: sanitizeFormAccess(f.access) };
  }

  // ── Sections and fields (the form engine checks the builder profile) ──────

  @Post('forms/:id/sections')
  @Action('setup')
  createSection(@Param('id') formId: string, @Body() dto: SectionDto) {
    return this.structure.createSection(formId, M, dto.name, dto.description);
  }

  @Patch('sections/:id')
  @Action('setup')
  updateSection(@Param('id') id: string, @Body() dto: SectionDto) {
    return this.structure.renameSection(id, M, dto.name, dto.description);
  }

  /** Deletes the section and its fields; their answers disappear from every record. */
  @Delete('sections/:id')
  @Action('setup')
  deleteSection(@Param('id') id: string) {
    return this.structure.deleteSection(id, M);
  }

  @Post('sections/:id/move')
  @Action('setup')
  moveSection(@Param('id') id: string, @Body() dto: MoveDto) {
    return this.structure.moveSection(id, M, dto.direction);
  }

  /** Drag and drop: the form's sections in a new order. */
  @Post('forms/:id/sections/order')
  @Action('setup')
  orderSections(@Param('id') formId: string, @Body() dto: OrderDto) {
    return this.structure.reorderSections(formId, M, dto.ids);
  }

  /** Drag and drop: a section's fields in a new order. */
  @Post('sections/:id/fields/order')
  @Action('setup')
  orderFields(@Param('id') sectionId: string, @Body() dto: OrderDto) {
    return this.structure.reorderFields(sectionId, M, dto.ids);
  }

  @Post('sections/:id/fields')
  @Action('setup')
  createField(@Param('id') sectionId: string, @Body() dto: CreateFieldDto) {
    return this.structure.createField(sectionId, M, dto);
  }

  @Patch('fields/:id')
  @Action('setup')
  updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.structure.updateField(id, M, dto);
  }

  /** Deletes the field; its answers disappear from every record. */
  @Delete('fields/:id')
  @Action('setup')
  deleteField(@Param('id') id: string) {
    return this.structure.deleteField(id, M);
  }

  @Post('fields/:id/move')
  @Action('setup')
  moveField(@Param('id') id: string, @Body() dto: MoveDto) {
    return this.structure.moveField(id, M, dto.direction);
  }

  // ── Public links (form level) ──────────────────────────────────────────────

  /** Every link for this form: new-intake links and per-organization links. */
  @Get('forms/:id/links')
  @Action('setup')
  async formLinks(@Param('id') formId: string) {
    await this.structure.findForm(formId, M);
    return this.links.list({ formId });
  }

  /** A new-intake link (the Intake form's profile is the only one that allows them). Per-organization links are made from the record. */
  @Post('forms/:id/links')
  @Action('setup')
  async createIntakeLink(@Req() req: Request, @Param('id') formId: string, @Body() dto: CreateLinkDto) {
    await this.structure.findForm(formId, M);
    return this.links.create(req.user as UserContext, { formId, kind: 'NEW', clientId: null }, dto);
  }

  /** Setup can revoke any link; people who can edit a form can revoke its links for organizations they reach. */
  @Post('links/:id/revoke')
  async revoke(@Req() req: Request, @Param('id') id: string) {
    await this.assertLink(req.user as UserContext, id);
    return this.links.revoke(id);
  }

  /** Rename a link or change the websites that may show it (same rule as revoking). */
  @Patch('links/:id')
  async updateLink(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateLinkDto) {
    await this.assertLink(req.user as UserContext, id);
    return this.links.update(id, dto);
  }

  private async assertLink(user: UserContext, id: string) {
    const link = await this.links.find(id);
    if (link.form.module !== M) throw new NotFoundException('Link not found');
    if (!this.care.canSetup(user)) {
      const level = await this.care.formAccess(user, link.form);
      if (level !== 'edit' || !link.clientId) throw new ForbiddenException("Your role can't change this link");
      await this.care.assertClient(user, link.clientId);
    }
  }
}
