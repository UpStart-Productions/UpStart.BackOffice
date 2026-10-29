import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import type { CareFormKind, CareRecordDto, CareRecordListItemDto, FormFieldType } from '@upstart/back-office/shared';
import { AccessGuard, Area } from '../access/access.guard';
import { UserContext } from '../common/app.types';
import { ATTRIBUTION_INCLUDE, toRecordAttribution } from '../common/record-attribution';
import { ensureLeadLinks } from '../leads/lead-links.util';
import { firstLane, laneFields } from '../pipelines/pipeline-lanes.util';
import { PrismaService } from '../prisma/prisma.service';
import { CareAccessService } from './care-access.service';
import { CareLinksService } from './care-links.service';
import { fieldView } from './care-forms.controller';
import { ensureCareForms } from './care-forms.util';
import { AcceptIntakeDto, CreateLinkDto, CreateRecordDto, SaveValuesDto } from './care.dto';
import { liveValues, mergeFormValues } from './form-fields.util';

const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

function personName(u: { firstName: string | null; lastName: string | null; name: string | null; email: string } | null): string | null {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
}

const LIST_INCLUDE = {
  form: { select: { kind: true, name: true } },
  client: { select: { name: true } },
  updatedBy: { select: { firstName: true, lastName: true, name: true, email: true } },
} as const;

type ListRow = Prisma.CareRecordGetPayload<{ include: typeof LIST_INCLUDE }>;

function listItem(r: ListRow): CareRecordListItemDto {
  const staffAt = r.updatedAt.getTime();
  const publicNewer = r.publicUpdatedAt && (!r.updatedByUserId || r.publicUpdatedAt.getTime() >= staffAt - 1000);
  return {
    id: r.id,
    formId: r.formId,
    kind: r.form.kind,
    status: r.status,
    clientId: r.clientId,
    clientName: r.client?.name ?? null,
    submitterName: r.submitterName,
    submitterEmail: r.submitterEmail,
    updatedAt: r.updatedAt.toISOString(),
    updatedByName: publicNewer ? r.publicUpdatedBy : personName(r.updatedBy),
  };
}

/**
 * Care records: one living copy of a form per organization, plus pending intakes from public links.
 * Read needs Read on the form; changes need Edit. Organizations are limited by Clients reach.
 */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('care')
@Controller('care')
export class CareRecordsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly care: CareAccessService,
    private readonly links: CareLinksService,
  ) {}

  /** Records of one kind the user can see. ?status=PENDING lists public intakes waiting for review. */
  @Get('records')
  async list(@Req() req: Request, @Query('kind') kind?: string, @Query('status') status?: string) {
    const user = req.user as UserContext;
    await ensureCareForms(this.prisma);
    const k: CareFormKind = kind === 'CARE_PROFILE' ? 'CARE_PROFILE' : 'INTAKE';
    const theForm = await this.prisma.careForm.findFirst({ where: { kind: k } });
    if (!theForm) return { items: [], myAccess: null, formId: null, pendingCount: 0 };
    const myAccess = await this.care.formAccess(user, theForm);
    if (!myAccess) return { items: [], myAccess: null, formId: theForm.id, pendingCount: 0 };
    const reach = await this.care.clientIds(user);
    const canSeePending = k === 'INTAKE' && reach === null && myAccess === 'edit';
    const where: Prisma.CareRecordWhereInput = {
      formId: theForm.id,
      ...(status === 'PENDING'
        ? { status: 'PENDING' as const }
        : status === 'ACTIVE'
          ? { status: 'ACTIVE' as const }
          : {}),
      ...(reach === null ? {} : { clientId: { in: reach } }),
      ...(canSeePending ? {} : { status: 'ACTIVE' as const }),
    };
    if (status === 'PENDING' && !canSeePending) return { items: [], myAccess, formId: theForm.id, pendingCount: 0 };
    const rows = await this.prisma.careRecord.findMany({ where, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], include: LIST_INCLUDE });
    const pendingCount = canSeePending ? await this.prisma.careRecord.count({ where: { formId: theForm.id, status: 'PENDING' } }) : 0;
    return { items: rows.map(listItem), myAccess, formId: theForm.id, pendingCount };
  }

  /** For the organization page: each form the user can use, and this organization's record if there is one. */
  @Get('clients/:clientId')
  async forClient(@Req() req: Request, @Param('clientId') clientId: string) {
    const user = req.user as UserContext;
    await this.care.assertClient(user, clientId);
    await ensureCareForms(this.prisma);
    const roleId = await this.care.roleId(user);
    const forms = await this.prisma.careForm.findMany({
      orderBy: { kind: 'asc' },
      include: { records: { where: { clientId }, select: { id: true, updatedAt: true } } },
    });
    const out = [];
    for (const f of forms) {
      const myAccess = await this.care.formAccess(user, f, roleId);
      if (!myAccess) continue;
      out.push({
        formId: f.id,
        kind: f.kind,
        name: f.name,
        myAccess,
        recordId: f.records[0]?.id ?? null,
        updatedAt: f.records[0]?.updatedAt.toISOString() ?? null,
      });
    }
    return out;
  }

  /** Start an organization's copy of a form (returns the existing one if it's already there). */
  @Post('records')
  async create(@Req() req: Request, @Body() dto: CreateRecordDto) {
    const user = req.user as UserContext;
    const form = await this.prisma.careForm.findUnique({ where: { id: dto.formId } });
    if (!form) throw new NotFoundException('Form not found');
    if ((await this.care.formAccess(user, form)) !== 'edit') throw new NotFoundException('Form not found');
    await this.care.assertClient(user, dto.clientId);
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Organization not found');
    const existing = await this.prisma.careRecord.findFirst({ where: { formId: form.id, clientId: dto.clientId }, select: { id: true } });
    if (existing) return { id: existing.id };
    const r = await this.prisma.careRecord.create({ data: { formId: form.id, clientId: dto.clientId }, select: { id: true } });
    return { id: r.id };
  }

  @Get('records/:id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<CareRecordDto> {
    const { level } = await this.care.assertRecord(req.user as UserContext, id, 'read');
    return this.view(id, level);
  }

  @Put('records/:id')
  async save(@Req() req: Request, @Param('id') id: string, @Body() dto: SaveValuesDto) {
    const { record } = await this.care.assertRecord(req.user as UserContext, id, 'edit');
    const fields = await this.fieldsOf(record.formId);
    let values: Record<string, unknown>;
    try {
      values = mergeFormValues(fields, record.values as Record<string, unknown>, dto.values ?? {});
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid value');
    }
    await this.prisma.careRecord.update({ where: { id }, data: { values: values as Prisma.InputJsonValue } });
    return this.view(id, 'edit');
  }

  /** Delete a record (or dismiss a pending intake). */
  @Delete('records/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.care.assertRecord(req.user as UserContext, id, 'edit');
    await this.prisma.careRecord.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Accept a pending public intake: attach it to a new Prospect organization (with a pipeline card and
   * the submitter as its person) or to an existing organization.
   */
  @Post('records/:id/accept')
  async accept(@Req() req: Request, @Param('id') id: string, @Body() dto: AcceptIntakeDto) {
    const user = req.user as UserContext;
    const { record } = await this.care.assertRecord(user, id, 'edit');
    if (record.status !== 'PENDING') throw new BadRequestException('This intake is already accepted');
    let clientId: string;
    if (dto.mode === 'existing') {
      if (!dto.clientId) throw new BadRequestException('Pick an organization');
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new NotFoundException('Organization not found');
      clientId = client.id;
    } else {
      const name = dto.name?.trim();
      if (!name) throw new BadRequestException('Enter the organization name');
      clientId = await this.prisma.$transaction(async (tx) => {
        const lane = await firstLane(tx);
        const lead = await tx.lead.create({
          data: {
            ...laneFields(lane),
            organization: name,
            primaryContact: record.submitterName,
            email: record.submitterEmail,
            phone: record.submitterPhone,
          },
          select: { id: true },
        });
        return (await ensureLeadLinks(tx, lead.id)).clientId;
      });
    }
    const taken = await this.prisma.careRecord.findFirst({ where: { formId: record.formId, clientId }, select: { id: true } });
    if (taken) throw new ConflictException('That organization already has an intake form. Open it and copy what you need, or dismiss this one.');
    await this.prisma.careRecord.update({ where: { id }, data: { clientId, status: 'ACTIVE' } });
    return this.view(id, 'edit');
  }

  // ── Per-organization public links ──────────────────────────────────────────

  @Get('records/:id/links')
  async recordLinks(@Req() req: Request, @Param('id') id: string) {
    const { record } = await this.care.assertRecord(req.user as UserContext, id, 'edit');
    if (!record.clientId) return [];
    return this.links.list({ formId: record.formId, clientId: record.clientId });
  }

  /** A link for this organization's copy of the form (e.g. for family to update it). */
  @Post('records/:id/links')
  async createRecordLink(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateLinkDto) {
    const user = req.user as UserContext;
    const { record } = await this.care.assertRecord(user, id, 'edit');
    if (!record.clientId) throw new BadRequestException('Accept this intake first');
    return this.links.create(user, { formId: record.formId, kind: 'CLIENT_UPDATE', clientId: record.clientId }, dto);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async fieldsOf(formId: string) {
    const sections = await this.prisma.careFormSection.findMany({
      where: { formId },
      orderBy: ORDER,
      select: { id: true, name: true, fields: { orderBy: ORDER, select: { id: true, name: true, type: true, options: true, required: true } } },
    });
    return sections.flatMap((s) => s.fields.map((f) => ({ ...f, type: f.type as FormFieldType })));
  }

  private async view(id: string, level: 'read' | 'edit'): Promise<CareRecordDto> {
    const r = await this.prisma.careRecord.findUniqueOrThrow({ where: { id }, include: { ...LIST_INCLUDE, ...ATTRIBUTION_INCLUDE } });
    const sections = await this.prisma.careFormSection.findMany({
      where: { formId: r.formId },
      orderBy: ORDER,
      select: { id: true, name: true, fields: { orderBy: ORDER, select: { id: true, name: true, type: true, options: true, required: true } } },
    });
    const fields = sections.flatMap((s) => s.fields);
    return {
      ...listItem(r),
      formName: r.form.name,
      values: liveValues(fields, r.values),
      sections: sections.map((s) => ({ id: s.id, name: s.name, fields: s.fields.map(fieldView) })),
      submitterPhone: r.submitterPhone,
      publicUpdatedAt: r.publicUpdatedAt?.toISOString() ?? null,
      publicUpdatedBy: r.publicUpdatedBy,
      myAccess: level,
      attribution: toRecordAttribution(r),
    };
  }
}
