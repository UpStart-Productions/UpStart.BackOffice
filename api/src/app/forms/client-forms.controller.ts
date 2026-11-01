import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsObject, IsString } from 'class-validator';
import { Request, Response } from 'express';
import {
  isAdminRole,
  normalizeFormSettings,
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

type FormRow = { id: string; name: string; access: unknown; settings: unknown };

function listItem(r: ListRow): ClientFormResultListItemDto {
  const settings = normalizeFormSettings(r.form.settings);
  const staffAt = r.updatedAt.getTime();
  const publicNewer = r.publicUpdatedAt && (!r.updatedByUserId || r.publicUpdatedAt.getTime() >= staffAt - 1000);
  return {
    id: r.id,
    formId: r.formId,
    formName: r.form.name,
    category: settings.client.category,
    copies: settings.client.copies,
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
 * Client forms on client pages: a client's results, adding one, viewing and editing it, and share links for
 * living copies. Each form sets Read or Edit per role (admins always edit); Clients reach applies. Results waiting
 * for review (public submissions not yet accepted) are handled in Forms, not here.
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
      if (level === 'edit') options.push({ formId: f.id, name: f.name, category: s.category, copies: s.copies, myAccess: level });
    }
    const rows = readable.size
      ? await this.prisma.formResponse.findMany({
          where: { clientId, status: 'ACTIVE', formId: { in: [...readable] } },
          orderBy: { createdAt: 'desc' },
          include: LIST_INCLUDE,
        })
      : [];
    options.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
    return { results: rows.map(listItem), options };
  }

  /** Add a result for a client. A living form returns the client's existing copy if there is one. */
  @Post('records')
  async create(@Req() req: Request, @Body() dto: CreateResultDto) {
    const user = req.user as UserContext;
    const form = await this.prisma.form.findFirst({ where: { id: dto.formId, module: M } });
    if (!form || !normalizeFormSettings(form.settings).client.enabled) throw new NotFoundException('Form not found');
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

  /** Move a result to another client (e.g. it was added to the wrong one). A living copy's share links go along. */
  @Patch('records/:id/client')
  async changeClient(@Req() req: Request, @Param('id') id: string, @Body() dto: ChangeResultClientDto) {
    const user = req.user as UserContext;
    const { record } = await this.assertResult(user, id, 'edit');
    if (dto.clientId === record.clientId) return this.view(id, 'edit');
    await this.assertClient(user, dto.clientId);
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundException('Client not found');
    if (record.living) {
      const taken = await this.prisma.formResponse.findFirst({ where: { formId: record.formId, clientId: client.id, living: true }, select: { id: true } });
      if (taken) throw new ConflictException(`${client.name} already has ${record.form.name}`);
    }
    await this.prisma.$transaction([
      this.prisma.formResponse.update({ where: { id }, data: { clientId: client.id } }),
      ...(record.living
        ? [this.prisma.formLink.updateMany({ where: { formId: record.formId, clientId: record.clientId }, data: { clientId: client.id } })]
        : []),
    ]);
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

  @Get('records/:id/links')
  async recordLinks(@Req() req: Request, @Param('id') id: string) {
    const { record } = await this.assertResult(req.user as UserContext, id, 'edit');
    if (!record.living) return [];
    return this.links.list({ formId: record.formId, clientId: record.clientId! });
  }

  /** A link to this client's copy for someone outside (e.g. family) to update it. */
  @Post('records/:id/links')
  async createRecordLink(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateLinkDto) {
    const user = req.user as UserContext;
    const { record } = await this.assertResult(user, id, 'edit');
    if (!record.living) throw new BadRequestException('Share links are for forms with one living copy per client');
    return this.links.create(user, { formId: record.formId, kind: 'CLIENT', clientId: record.clientId! }, dto);
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
      select: { id: true, name: true, access: true, settings: true },
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
      canShare: r.living && level === 'edit',
      attribution: toRecordAttribution(r),
    };
  }
}
