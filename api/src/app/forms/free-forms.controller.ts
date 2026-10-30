import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import {
  allows, normalizeFormSettings, parseFormDefinition, type FormDefinition, type FormScores, type FormSectionDto, type FormSnapshot, type FormSubmissionDto, type FreeFormDto, type FreeFormListItemDto,
} from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { ensureLeadLinks } from '../leads/lead-links.util';
import { firstLane, laneFields } from '../pipelines/pipeline-lanes.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFieldDto, CreateLinkDto, MoveDto, OrderDto, SectionDto, UpdateFieldDto, UpdateLinkDto } from './form.dto';
import { formFieldOptions, liveValues } from './form-fields.util';
import { FormLinksService } from './form-links.service';
import { FormStructureService } from './form-structure.service';
import { AcceptSubmissionDto, CreateFreeFormDto, ImportFreeFormDto, SUBMISSION_STATUSES, UpdateFreeFormDto } from './free-forms.dto';
import { bandsOf, liveSnapshot, M, personName, snapshotsDiffer, SUBMISSION_INCLUDE, submissionItem, type SubmissionRow } from './free-forms.util';

/**
 * Forms area: free-standing forms (module "forms"), their fields and scoring, Publish, public links and
 * submissions. Forms: Own = forms the person created; All = every form. Create/Edit/Delete are the role's checkboxes.
 * Fields and links use the form engine with the full builder profile.
 */
@ApiTags('forms')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('forms')
@Controller('form-admin')
export class FreeFormsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly structure: FormStructureService,
    private readonly links: FormLinksService,
  ) {}

  // ── Forms ──────────────────────────────────────────────────────────────────

  @Get('forms')
  async list(@Req() req: Request): Promise<FreeFormListItemDto[]> {
    const user = req.user as UserContext;
    const forms = await this.prisma.form.findMany({
      where: { module: M, ...this.ownWhere(user) },
      orderBy: { updatedAt: 'desc' },
      include: {
        publishedVersion: { select: { number: true, snapshot: true } },
        createdBy: { select: { firstName: true, lastName: true, name: true, email: true } },
        _count: { select: { responses: true } },
      },
    });
    const pending = await this.prisma.formResponse.groupBy({
      by: ['formId'],
      where: { formId: { in: forms.map((f) => f.id) }, status: 'PENDING' },
      _count: { _all: true },
    });
    const pendingBy = new Map(pending.map((p) => [p.formId, p._count._all]));
    const out: FreeFormListItemDto[] = [];
    for (const f of forms) {
      out.push({
        id: f.id,
        name: f.name,
        description: f.description,
        publishedNumber: f.publishedVersion?.number ?? null,
        hasUnpublishedChanges: f.publishedVersion ? snapshotsDiffer(await liveSnapshot(this.structure, f), f.publishedVersion.snapshot) : true,
        responseCount: f._count.responses,
        pendingCount: pendingBy.get(f.id) ?? 0,
        updatedAt: f.updatedAt.toISOString(),
        createdByName: personName(f.createdBy),
      });
    }
    return out;
  }

  @Post('forms')
  async create(@Req() req: Request, @Body() dto: CreateFreeFormDto) {
    const user = req.user as UserContext;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const f = await this.prisma.form.create({
      data: { module: M, name, description: dto.description?.trim() || null, createdById: user.id, settings: normalizeFormSettings({}) as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    return { id: f.id };
  }

  /** Create a form (a draft) from a form file. */
  @Post('forms/import')
  async import(@Req() req: Request, @Body() dto: ImportFreeFormDto) {
    const user = req.user as UserContext;
    let def: FormDefinition;
    try {
      def = parseFormDefinition(dto.definition);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'This form file could not be read');
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          module: M,
          name: dto.name?.trim() || def.name,
          description: def.description,
          settings: def.settings as unknown as Prisma.InputJsonValue,
          createdById: user.id,
        },
        select: { id: true },
      });
      for (const [si, s] of def.sections.entries()) {
        const section = await tx.formSection.create({
          data: { formId: form.id, name: s.name, description: s.description ?? null, sortOrder: si },
          select: { id: true },
        });
        for (const [fi, f] of s.fields.entries()) {
          await tx.formField.create({
            data: {
              sectionId: section.id,
              name: f.name,
              type: f.type,
              required: f.required,
              scoreGroupId: f.scoreGroupId ?? null,
              options: f.options
                ? (formFieldOptions(f.type, f.options, true) as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
              sortOrder: fi,
            },
          });
        }
      }
      return form.id;
    });
    return { id };
  }

  /** The form as a file (its current fields and settings, not necessarily what's published). */
  @Get('forms/:id/export')
  async export(@Req() req: Request, @Param('id') id: string): Promise<FormDefinition> {
    const form = await this.findForm(req.user as UserContext, id);
    const live = await liveSnapshot(this.structure, form);
    return {
      format: 'ubo-form',
      version: 1,
      name: form.name,
      description: form.description,
      settings: normalizeFormSettings(form.settings),
      sections: live.sections.map((s) => ({
        name: s.name,
        description: s.description ?? null,
        fields: s.fields.map((f) => ({
          name: f.name,
          type: f.type,
          required: f.required,
          ...(f.options.length ? { options: f.options.map((o) => ({ label: o.label, ...(typeof o.points === 'number' ? { points: o.points } : {}) })) } : {}),
          scoreGroupId: f.scoreGroupId ?? null,
        })),
      })),
    };
  }

  @Get('forms/:id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<FreeFormDto> {
    const user = req.user as UserContext;
    const form = await this.findForm(user, id);
    const live = await liveSnapshot(this.structure, form);
    const counts = await this.structure.valueCounts(id);
    return {
      id: form.id,
      name: form.name,
      description: form.description,
      settings: normalizeFormSettings(form.settings),
      sections: live.sections.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f, valueCount: counts.get(f.id) ?? 0 })) })),
      published: form.publishedVersion ? { number: form.publishedVersion.number, publishedAt: form.publishedVersion.publishedAt.toISOString() } : null,
      hasUnpublishedChanges: form.publishedVersion ? snapshotsDiffer(live, form.publishedVersion.snapshot) : true,
      canEdit: allows(user, 'forms', 'edit'),
      canDelete: allows(user, 'forms', 'delete'),
    };
  }

  @Patch('forms/:id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFreeFormDto) {
    await this.findForm(req.user as UserContext, id);
    const data: Prisma.FormUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required');
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.settings !== undefined) data.settings = normalizeFormSettings(dto.settings) as unknown as Prisma.InputJsonValue;
    await this.prisma.form.update({ where: { id }, data });
    return this.get(req, id);
  }

  /** Deletes the form, its versions, links and every submission. */
  @Delete('forms/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.findForm(req.user as UserContext, id);
    await this.prisma.$transaction([
      this.prisma.form.update({ where: { id }, data: { publishedVersionId: null } }),
      this.prisma.form.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  /** Freeze the current fields and scoring as the next version; public links serve it from now on. */
  @Post('forms/:id/publish')
  @Action('edit')
  async publish(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserContext;
    const form = await this.findForm(user, id);
    const live = await liveSnapshot(this.structure, form);
    if (!live.sections.some((s) => s.fields.length)) throw new BadRequestException('Add at least one field before publishing');
    const last = await this.prisma.formVersion.findFirst({ where: { formId: id }, orderBy: { number: 'desc' }, select: { number: true } });
    await this.prisma.$transaction(async (tx) => {
      const v = await tx.formVersion.create({
        data: { formId: id, number: (last?.number ?? 0) + 1, snapshot: live as unknown as Prisma.InputJsonValue, publishedById: user.id },
        select: { id: true },
      });
      await tx.form.update({ where: { id }, data: { publishedVersionId: v.id } });
    });
    return this.get(req, id);
  }

  /** Take the form offline: links stop working until it is published again. Versions and submissions stay. */
  @Post('forms/:id/unpublish')
  @Action('edit')
  async unpublish(@Req() req: Request, @Param('id') id: string) {
    await this.findForm(req.user as UserContext, id);
    await this.prisma.form.update({ where: { id }, data: { publishedVersionId: null } });
    return this.get(req, id);
  }

  // ── Sections and fields (full builder profile) ─────────────────────────────

  @Post('forms/:id/sections')
  @Action('edit')
  async createSection(@Req() req: Request, @Param('id') formId: string, @Body() dto: SectionDto) {
    await this.findForm(req.user as UserContext, formId);
    return this.touch(formId, this.structure.createSection(formId, M, dto.name, dto.description));
  }

  @Patch('sections/:id')
  async updateSection(@Req() req: Request, @Param('id') id: string, @Body() dto: SectionDto) {
    const s = await this.structure.findSection(id, M);
    await this.findForm(req.user as UserContext, s.formId);
    return this.touch(s.formId, this.structure.renameSection(id, M, dto.name, dto.description));
  }

  @Delete('sections/:id')
  @Action('edit')
  async deleteSection(@Req() req: Request, @Param('id') id: string) {
    const s = await this.structure.findSection(id, M);
    await this.findForm(req.user as UserContext, s.formId);
    return this.touch(s.formId, this.structure.deleteSection(id, M));
  }

  @Post('sections/:id/move')
  @Action('edit')
  async moveSection(@Req() req: Request, @Param('id') id: string, @Body() dto: MoveDto) {
    const s = await this.structure.findSection(id, M);
    await this.findForm(req.user as UserContext, s.formId);
    return this.touch(s.formId, this.structure.moveSection(id, M, dto.direction));
  }

  /** Drag and drop: the form's sections in a new order. */
  @Post('forms/:id/sections/order')
  @Action('edit')
  async orderSections(@Req() req: Request, @Param('id') formId: string, @Body() dto: OrderDto) {
    await this.findForm(req.user as UserContext, formId);
    return this.touch(formId, this.structure.reorderSections(formId, M, dto.ids));
  }

  /** Drag and drop: a section's fields in a new order. */
  @Post('sections/:id/fields/order')
  @Action('edit')
  async orderFields(@Req() req: Request, @Param('id') sectionId: string, @Body() dto: OrderDto) {
    const s = await this.structure.findSection(sectionId, M);
    await this.findForm(req.user as UserContext, s.formId);
    return this.touch(s.formId, this.structure.reorderFields(sectionId, M, dto.ids));
  }

  @Post('sections/:id/fields')
  @Action('edit')
  async createField(@Req() req: Request, @Param('id') sectionId: string, @Body() dto: CreateFieldDto) {
    const s = await this.structure.findSection(sectionId, M);
    await this.findForm(req.user as UserContext, s.formId);
    return this.touch(s.formId, this.structure.createField(sectionId, M, dto));
  }

  @Patch('fields/:id')
  async updateField(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFieldDto) {
    const f = await this.structure.findField(id, M);
    await this.findForm(req.user as UserContext, f.section.formId);
    return this.touch(f.section.formId, this.structure.updateField(id, M, dto));
  }

  @Delete('fields/:id')
  @Action('edit')
  async deleteField(@Req() req: Request, @Param('id') id: string) {
    const f = await this.structure.findField(id, M);
    await this.findForm(req.user as UserContext, f.section.formId);
    return this.touch(f.section.formId, this.structure.deleteField(id, M));
  }

  @Post('fields/:id/move')
  @Action('edit')
  async moveField(@Req() req: Request, @Param('id') id: string, @Body() dto: MoveDto) {
    const f = await this.structure.findField(id, M);
    await this.findForm(req.user as UserContext, f.section.formId);
    return this.touch(f.section.formId, this.structure.moveField(id, M, dto.direction));
  }

  // ── Public links ───────────────────────────────────────────────────────────

  @Get('forms/:id/links')
  async formLinks(@Req() req: Request, @Param('id') formId: string) {
    await this.findForm(req.user as UserContext, formId);
    return this.links.list({ formId });
  }

  @Post('forms/:id/links')
  @Action('edit')
  async createLink(@Req() req: Request, @Param('id') formId: string, @Body() dto: CreateLinkDto) {
    const user = req.user as UserContext;
    await this.findForm(user, formId);
    return this.links.create(user, { formId, kind: 'NEW', clientId: null }, dto);
  }

  @Post('links/:id/revoke')
  @Action('edit')
  async revoke(@Req() req: Request, @Param('id') id: string) {
    const link = await this.links.find(id);
    if (link.form.module !== M) throw new NotFoundException('Link not found');
    await this.findForm(req.user as UserContext, link.formId);
    return this.links.revoke(id);
  }

  @Patch('links/:id')
  async updateLink(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateLinkDto) {
    const link = await this.links.find(id);
    if (link.form.module !== M) throw new NotFoundException('Link not found');
    await this.findForm(req.user as UserContext, link.formId);
    return this.links.update(id, dto);
  }

  // ── Submissions ────────────────────────────────────────────────────────────

  /** A form's submissions. ?status=PENDING | ACTIVE | DISMISSED. */
  @Get('forms/:id/submissions')
  async submissions(@Req() req: Request, @Param('id') formId: string, @Query('status') status?: string) {
    await this.findForm(req.user as UserContext, formId);
    const st = SUBMISSION_STATUSES.find((s) => s === status);
    const rows = await this.prisma.formResponse.findMany({
      where: { formId, ...(st ? { status: st } : {}) },
      orderBy: { createdAt: 'desc' },
      include: SUBMISSION_INCLUDE,
    });
    const pendingCount = await this.prisma.formResponse.count({ where: { formId, status: 'PENDING' } });
    return { items: rows.map(submissionItem), pendingCount };
  }

  /** Every submission with its answers, for the Excel export. ?status like the list. */
  @Get('forms/:id/submissions/export')
  async exportSubmissions(@Req() req: Request, @Param('id') formId: string, @Query('status') status?: string): Promise<FormSubmissionDto[]> {
    const user = req.user as UserContext;
    const form = await this.findForm(user, formId);
    const st = SUBMISSION_STATUSES.find((s) => s === status);
    const rows = await this.prisma.formResponse.findMany({
      where: { formId, ...(st ? { status: st } : {}) },
      orderBy: { createdAt: 'asc' },
      include: SUBMISSION_INCLUDE,
    });
    const current = rows.some((r) => !r.version) ? await this.structure.sections(formId) : [];
    return rows.map((r) => this.submissionDto(user, r, form.name, current));
  }

  @Get('submissions/:id')
  async submission(@Req() req: Request, @Param('id') id: string): Promise<FormSubmissionDto> {
    const user = req.user as UserContext;
    const r = await this.findSubmission(user, id);
    const current = r.version ? [] : await this.structure.sections(r.formId);
    return this.submissionDto(user, r, r.form.name, current);
  }

  /** `current`: the form's sections now, for submissions saved before versions. */
  private submissionDto(user: UserContext, r: SubmissionRow, formName: string, current: FormSectionDto[]): FormSubmissionDto {
    const snap = r.version?.snapshot as unknown as FormSnapshot | undefined;
    const sections = snap?.sections ?? current;
    return {
      ...submissionItem(r),
      formName,
      submitterPhone: r.submitterPhone,
      versionNumber: r.version?.number ?? null,
      sections,
      values: liveValues(sections.flatMap((s) => s.fields), r.values),
      scores: (r.scores as unknown as FormScores | null) ?? null,
      bands: bandsOf(r),
      canEdit: allows(user, 'forms', 'edit'),
    };
  }

  /**
   * Accept a submission: into a new Prospect (with a pipeline card and the respondent as its person, source Inbound)
   * or an existing organization.
   */
  @Post('submissions/:id/accept')
  @Action('edit')
  async accept(@Req() req: Request, @Param('id') id: string, @Body() dto: AcceptSubmissionDto) {
    const user = req.user as UserContext;
    const r = await this.findSubmission(user, id);
    if (r.status === 'ACTIVE' && r.clientId) throw new BadRequestException('This submission is already accepted');
    let clientId: string;
    if (dto.mode === 'existing') {
      if (!dto.clientId) throw new BadRequestException('Pick an organization');
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new NotFoundException('Organization not found');
      clientId = client.id;
    } else {
      const name = dto.name?.trim() || r.submitterOrganization?.trim();
      if (!name) throw new BadRequestException('Enter the organization name');
      clientId = await this.prisma.$transaction(async (tx) => {
        const lane = await firstLane(tx);
        const lead = await tx.lead.create({
          data: {
            ...laneFields(lane),
            organization: name,
            primaryContact: r.submitterName,
            email: r.submitterEmail,
            phone: r.submitterPhone,
            source: 'INBOUND',
            nextAction: `Follow up on ${r.form.name}`,
          },
          select: { id: true },
        });
        return (await ensureLeadLinks(tx, lead.id)).clientId;
      });
    }
    await this.prisma.formResponse.update({ where: { id }, data: { clientId, status: 'ACTIVE' } });
    return this.submission(req, id);
  }

  /** Set a submission aside (kept, under Dismissed). */
  @Post('submissions/:id/dismiss')
  @Action('edit')
  async dismiss(@Req() req: Request, @Param('id') id: string) {
    await this.findSubmission(req.user as UserContext, id);
    await this.prisma.formResponse.update({ where: { id }, data: { status: 'DISMISSED' } });
    return this.submission(req, id);
  }

  /** Back to Waiting for review (from Dismissed). */
  @Post('submissions/:id/restore')
  @Action('edit')
  async restore(@Req() req: Request, @Param('id') id: string) {
    const r = await this.findSubmission(req.user as UserContext, id);
    await this.prisma.formResponse.update({ where: { id }, data: { status: r.clientId ? 'ACTIVE' : 'PENDING' } });
    return this.submission(req, id);
  }

  @Delete('submissions/:id')
  async deleteSubmission(@Req() req: Request, @Param('id') id: string) {
    await this.findSubmission(req.user as UserContext, id);
    await this.prisma.formResponse.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Own: forms the person created. */
  private ownWhere(user: UserContext): Prisma.FormWhereInput {
    return this.access.level(user, 'forms') === 'own' ? { createdById: user.id } : {};
  }

  private async findForm(user: UserContext, id: string) {
    const f = await this.prisma.form.findFirst({ where: { id, module: M, ...this.ownWhere(user) }, include: { publishedVersion: true } });
    if (!f) throw new NotFoundException('Form not found');
    return f;
  }

  private async findSubmission(user: UserContext, id: string) {
    const r = await this.prisma.formResponse.findFirst({
      where: { id, form: { module: M, ...this.ownWhere(user) } },
      include: { ...SUBMISSION_INCLUDE, form: { select: { name: true } } },
    });
    if (!r) throw new NotFoundException('Submission not found');
    return r;
  }

  /** Field changes count as editing the form (it moves to the top of the list). */
  private async touch<T>(formId: string, work: Promise<T>): Promise<T> {
    const out = await work;
    await this.prisma.form.update({ where: { id: formId }, data: { updatedAt: new Date() } });
    return out;
  }
}
