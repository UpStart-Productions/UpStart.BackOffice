import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsObject, IsString } from 'class-validator';
import { Request, Response } from 'express';
import {
  allows,
  isAdminRole,
  normalizeFormSettings,
  type FormAttachInfoDto,
  type FormAttachTargetDto,
  type ClientFormOptionDto,
  type ClientFormResultDto,
  type ClientFormResultListItemDto,
  type ClientFormsPanelDto,
  type FormAccessLevel,
} from '@upstart/back-office/shared';
import { AccessGuard, SignedIn } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { ATTRIBUTION_INCLUDE, toRecordAttribution } from '../common/record-attribution';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkDto } from './form.dto';
import { sanitizeFormAccess } from './form-access.util';
import { attachInfo, attachTargets, logFormActivity } from './form-attach.util';
import { notifyFormAttached, notifyFormSubmitted } from './form-notify.util';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { FormFilesService, formFilesPrefix } from './form-files.service';
import { liveValues, mergeFormValues } from './form-fields.util';
import { FormLinksService } from './form-links.service';
import { FormStructureService } from './form-structure.service';
import { M, personName } from './free-forms.util';

class CreateResultDto {
  @IsString() formId!: string;
  @IsString() clientId!: string;
}

class ChangeResultClientDto {
  @IsString() clientId!: string;
}

class SaveResultDto {
  /** fieldId -> value (null or empty clears it). Fields left out keep their value. */
  @IsObject() values!: Record<string, unknown>;
}

const LIST_INCLUDE = {
  form: { select: { name: true, settings: true } },
  client: { select: { name: true } },
  updatedBy: { select: { firstName: true, lastName: true, name: true, email: true } },
} as const;
type ListRow = Prisma.FormResponseGetPayload<{ include: typeof LIST_INCLUDE }>;

type FormRow = { id: string; name: string; access: unknown; settings: unknown; publishedVersionId?: string | null };

function listItem(r: ListRow): ClientFormResultListItemDto {
  const settings = normalizeFormSettings(r.form.settings);
  const staffAt = r.updatedAt.getTime();
  const publicNewer = r.publicUpdatedAt && (!r.updatedByUserId || r.publicUpdatedAt.getTime() >= staffAt - 1000);
  return {
    id: r.id,
    formId: r.formId,
    formName: r.form.name,
    copies: settings.client.copies,
    isClientForm: settings.client.enabled,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    status: r.status,
    clientId: r.clientId,
    clientName: r.client?.name ?? null,
    submitterName: r.submitterName,
    submitterEmail: r.submitterEmail,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    updatedByName: publicNewer ? r.publicUpdatedBy : personName(r.updatedBy),
  };
}

/**
 * Client forms on client and organization pages: a record's results, adding one, viewing and editing it (auto-saved),
 * Submit / Reopen, moving it, and share links. Each form sets Read or Edit per role (admins always edit); Clients reach
 * applies. The page's Forms panel also lists other forms' responses attached to the record, for people with Forms.
 * Responses waiting for review (public submissions not yet attached) are handled in Forms, not here.
 */
@ApiTags('client-forms')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@SignedIn()
@Controller('client-forms')
export class ClientFormsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly structure: FormStructureService,
    private readonly links: FormLinksService,
    private readonly files: FormFilesService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  /** The client page's Forms panel: the client's results the user can read, and the forms they can add. */
  @Get('clients/:clientId')
  async panel(@Req() req: Request, @Param('clientId') clientId: string): Promise<ClientFormsPanelDto> {
    const user = req.user as UserContext;
    await this.assertClient(user, clientId);
    const forms = await this.clientForms();
    const roleId = await this.roleId(user);
    const readable = new Set<string>();
    const options: ClientFormOptionDto[] = [];
    for (const f of forms) {
      const level = this.levelFor(user, f, roleId);
      if (!level) continue;
      readable.add(f.id);
      const s = normalizeFormSettings(f.settings).client;
      // Only published forms can be added (drafts are still being built).
      if (level === 'edit' && f.publishedVersionId) options.push({ formId: f.id, name: f.name, copies: s.copies, myAccess: level });
    }
    // Other forms' responses attached here (e.g. an assessment accepted into an organization): people with Forms.
    const otherForms = allows(user, 'forms', 'view') ? { form: { module: M, NOT: { settings: { path: ['client', 'enabled'], equals: true } } } } : null;
    const rows = await this.prisma.formResponse.findMany({
      where: {
        clientId,
        status: 'ACTIVE',
        OR: [...(readable.size ? [{ formId: { in: [...readable] } }] : []), ...(otherForms ? [otherForms] : [])],
      },
      orderBy: { createdAt: 'desc' },
      include: LIST_INCLUDE,
    });
    options.sort((a, b) => a.name.localeCompare(b.name));
    return { results: rows.map(listItem), options };
  }

  /** Add a result for a client. A living form returns the client's existing copy if there is one. */
  @Post('records')
  async create(@Req() req: Request, @Body() dto: CreateResultDto) {
    const user = req.user as UserContext;
    const form = await this.prisma.form.findFirst({ where: { id: dto.formId, module: M } });
    if (!form || !normalizeFormSettings(form.settings).client.enabled) throw new NotFoundException('Form not found');
    if (!form.publishedVersionId) throw new BadRequestException('Publish this form before adding it to a client');
    if ((await this.formAccess(user, form)) !== 'edit') throw new NotFoundException('Form not found');
    await this.assertClient(user, dto.clientId);
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Client not found');
    const living = normalizeFormSettings(form.settings).client.copies === 'living';
    if (living) {
      const existing = await this.prisma.formResponse.findFirst({ where: { formId: form.id, clientId: client.id, living: true }, select: { id: true } });
      if (existing) return { id: existing.id };
    }
    const r = await this.prisma.formResponse.create({ data: { formId: form.id, clientId: client.id, living }, select: { id: true } });
    return { id: r.id };
  }

  /** A file from this result (signed in, with Read on the form and the client in reach). ?download=1 saves it. */
  @Get('records/:id/files')
  async file(@Req() req: Request, @Res() res: Response, @Param('id') id: string, @Query('key') key?: string, @Query('download') download?: string) {
    const { record } = await this.assertResult(req.user as UserContext, id, 'read');
    await this.files.send(res, record.values, key, download === '1');
  }

  @Get('records/:id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<ClientFormResultDto> {
    const { level } = await this.assertResult(req.user as UserContext, id, 'read');
    return this.view(id, level);
  }

  @Put('records/:id')
  async save(@Req() req: Request, @Param('id') id: string, @Body() dto: SaveResultDto) {
    const { record } = await this.assertResult(req.user as UserContext, id, 'edit');
    const fields = await this.structure.fields(record.formId);
    let values: Record<string, unknown>;
    try {
      values = mergeFormValues(fields, record.values as Record<string, unknown>, dto.values ?? {}, { filePrefix: formFilesPrefix(record.formId) });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid value');
    }
    await this.prisma.formResponse.update({ where: { id }, data: { values: values as Prisma.InputJsonValue } });
    return this.view(id, 'edit');
  }

  /** Submit: the answers are complete (required questions checked). It stays editable; Reopen marks it In progress again. */
  @Post('records/:id/submit')
  async submit(@Req() req: Request, @Param('id') id: string) {
    const { record } = await this.assertResult(req.user as UserContext, id, 'edit');
    const fields = await this.structure.fields(record.formId);
    try {
      mergeFormValues(fields, record.values as Record<string, unknown>, {}, { requireAll: true });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Fill in the required questions');
    }
    await this.prisma.formResponse.update({ where: { id }, data: { submittedAt: new Date() } });
    await notifyFormSubmitted(this.prisma, this.delivery, { form: record.form, responseId: id, clientId: record.clientId!, actor: req.user as UserContext });
    return this.view(id, 'edit');
  }

  @Post('records/:id/reopen')
  async reopen(@Req() req: Request, @Param('id') id: string) {
    await this.assertResult(req.user as UserContext, id, 'edit');
    await this.prisma.formResponse.update({ where: { id }, data: { submittedAt: null } });
    return this.view(id, 'edit');
  }

  /** The Move dialog: who will see the result where it goes (no suggestions: it's already attached). */
  @Get('records/:id/attach-info')
  async moveInfo(@Req() req: Request, @Param('id') id: string): Promise<FormAttachInfoDto> {
    const user = req.user as UserContext;
    const { record } = await this.assertResult(user, id, 'edit');
    const info = await attachInfo(this.prisma, record.form, { name: null, email: null }, await this.access.clientIds(user));
    return info;
  }

  /** Every client and organization the user reaches, with status, tags and people (Attach and Move pickers). */
  @Get('targets')
  async targets(@Req() req: Request): Promise<FormAttachTargetDto[]> {
    return attachTargets(this.prisma, await this.access.clientIds(req.user as UserContext));
  }

  /** Move a result to another client or organization (e.g. it was added to the wrong one). Its share links go along. */
  @Patch('records/:id/client')
  async changeClient(@Req() req: Request, @Param('id') id: string, @Body() dto: ChangeResultClientDto) {
    const user = req.user as UserContext;
    const { record } = await this.assertResult(user, id, 'edit');
    if (dto.clientId === record.clientId) return this.view(id, 'edit');
    await this.assertClient(user, dto.clientId);
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundException('Client not found');
    const from = await this.prisma.client.findUnique({ where: { id: record.clientId! }, select: { name: true } });
    if (record.living) {
      const taken = await this.prisma.formResponse.findFirst({ where: { formId: record.formId, clientId: client.id, living: true }, select: { id: true } });
      if (taken) throw new ConflictException(`${client.name} already has ${record.form.name}`);
    }
    await this.prisma.$transaction([
      this.prisma.formResponse.update({ where: { id }, data: { clientId: client.id } }),
      this.prisma.formLink.updateMany({ where: { responseId: id }, data: { clientId: client.id } }),
      ...(record.living
        ? [this.prisma.formLink.updateMany({ where: { formId: record.formId, clientId: record.clientId, responseId: null }, data: { clientId: client.id } })]
        : []),
    ]);
    await logFormActivity(this.prisma, user, record.clientId!, `${record.form.name} moved to ${client.name}`);
    await logFormActivity(this.prisma, user, client.id, `${record.form.name} moved here from ${from?.name ?? 'another record'}`);
    await notifyFormAttached(this.prisma, this.delivery, { form: record.form, responseId: id, clientId: client.id, actor: user, moved: true });
    return this.view(id, 'edit');
  }

  @Delete('records/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const { record } = await this.assertResult(req.user as UserContext, id, 'edit');
    await this.prisma.formResponse.delete({ where: { id } });
    await this.files.deleteIn(record.values);
    return { deleted: true };
  }

  // ── Share links (living copies) ────────────────────────────────────────────

  /** This result's share links (and, for a living copy, links made before links pointed at one result). */
  @Get('records/:id/links')
  async recordLinks(@Req() req: Request, @Param('id') id: string) {
    const { record } = await this.assertResult(req.user as UserContext, id, 'edit');
    return this.links.list({
      OR: [{ responseId: id }, ...(record.living ? [{ formId: record.formId, clientId: record.clientId!, kind: 'CLIENT' as const, responseId: null }] : [])],
    });
  }

  /** A link to this result for someone outside (e.g. family) to fill it in over time; it auto-saves. */
  @Post('records/:id/links')
  async createRecordLink(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateLinkDto) {
    const user = req.user as UserContext;
    const { record } = await this.assertResult(user, id, 'edit');
    return this.links.create(user, { formId: record.formId, kind: 'CLIENT', clientId: record.clientId!, responseId: record.id }, dto);
  }

  @Post('links/:id/revoke')
  async revoke(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserContext;
    const link = await this.links.find(id);
    if (link.form.module !== M || link.kind !== 'CLIENT' || !link.clientId) throw new NotFoundException('Link not found');
    if ((await this.formAccess(user, link.form)) !== 'edit') throw new NotFoundException('Link not found');
    await this.assertClient(user, link.clientId);
    return this.links.revoke(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async clientForms(): Promise<FormRow[]> {
    const forms = await this.prisma.form.findMany({
      where: { module: M, settings: { path: ['client', 'enabled'], equals: true } },
      select: { id: true, name: true, access: true, settings: true, publishedVersionId: true },
      orderBy: { name: 'asc' },
    });
    return forms;
  }

  private async roleId(user: UserContext): Promise<string | null> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { roleId: true } });
    return row?.roleId ?? null;
  }

  private levelFor(user: UserContext, form: { access: unknown }, roleId: string | null): FormAccessLevel | null {
    if (isAdminRole(user.role)) return 'edit';
    if (user.role !== 'USER' || !roleId) return null;
    return sanitizeFormAccess(form.access)[roleId] ?? null;
  }

  private async formAccess(user: UserContext, form: { access: unknown }): Promise<FormAccessLevel | null> {
    return this.levelFor(user, form, isAdminRole(user.role) ? null : await this.roleId(user));
  }

  private async assertClient(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Client not found');
  }

  /** An accepted result of a client form the user can reach, with their access, or 404. */
  private async assertResult(user: UserContext, id: string, need: FormAccessLevel) {
    const record = await this.prisma.formResponse.findFirst({
      where: { id, clientId: { not: null }, form: { module: M } },
      include: { form: true },
    });
    if (!record || !normalizeFormSettings(record.form.settings).client.enabled) throw new NotFoundException('Form not found');
    const level = await this.formAccess(user, record.form);
    if (!level) throw new NotFoundException('Form not found');
    await this.assertClient(user, record.clientId!);
    if (need === 'edit' && level !== 'edit') throw new ForbiddenException("Your role can't edit this form");
    return { record, level };
  }

  private async view(id: string, level: FormAccessLevel): Promise<ClientFormResultDto> {
    const r = await this.prisma.formResponse.findUniqueOrThrow({ where: { id }, include: { ...LIST_INCLUDE, ...ATTRIBUTION_INCLUDE } });
    const sections = await this.structure.sections(r.formId);
    const fields = sections.flatMap((s) => s.fields);
    return {
      ...listItem(r),
      values: liveValues(fields, r.values),
      sections,
      submitterPhone: r.submitterPhone,
      publicUpdatedAt: r.publicUpdatedAt?.toISOString() ?? null,
      publicUpdatedBy: r.publicUpdatedBy,
      myAccess: level,
      canShare: level === 'edit',
      attribution: toRecordAttribution(r),
    };
  }
}
