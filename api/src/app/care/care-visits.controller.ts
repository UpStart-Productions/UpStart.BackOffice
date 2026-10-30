import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { allows, isAdminRole, type CareVisitDto, type CareVisitListItemDto } from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { liveValues, mergeFormValues } from '../forms/form-fields.util';
import { FormStructureService } from '../forms/form-structure.service';
import { careForm, ensureCareForms } from './care-forms.util';

export class CreateVisitDto {
  @IsString() clientId!: string;
  /** Someone else's visit (needs Visits: All). Default: the signed-in user. */
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() shiftId?: string;
  /** Default now. */
  @IsOptional() @IsDateString() startedAt?: string;
  /** Given: a finished visit (logged afterwards). Omitted: the visit starts now and is in progress. */
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string;
  @IsOptional() @IsObject() values?: Record<string, unknown>;
}

export class UpdateVisitDto {
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string | null;
  @IsOptional() @IsObject() values?: Record<string, unknown>;
}

export class EndVisitDto {
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string | null;
  @IsOptional() @IsObject() values?: Record<string, unknown>;
}

const PERSON = { select: { id: true, firstName: true, lastName: true, name: true, email: true, avatarUrl: true } } as const;
const INCLUDE = {
  client: { select: { name: true } },
  user: PERSON,
  timeEntry: { select: { invoiceLineItemId: true, tenantInvoiceLineItemId: true } },
} as const;
type Row = Prisma.CareVisitGetPayload<{ include: typeof INCLUDE }>;

export function personRef(u: { id: string; firstName: string | null; lastName: string | null; name: string | null; email: string; avatarUrl: string | null }) {
  return { id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email, avatarUrl: toPublicAssetUrl(u.avatarUrl) ?? null };
}

const minutes = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

function listItem(r: Row): CareVisitListItemDto {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    worker: personRef(r.user),
    shiftId: r.shiftId,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    status: r.status,
    durationMin: r.endedAt ? minutes(r.startedAt, r.endedAt) : null,
  };
}

/**
 * Care → Visits: what happened on each visit (notes + the tenant's visit checklist), tied to time.
 * Ending a visit creates a time entry for the worker, so hours flow into invoicing as usual.
 * Visits: Own = the user's own visits; All = everyone's, within the organizations they reach.
 */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('visits')
@Controller('care')
export class CareVisitsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly structure: FormStructureService,
  ) {}

  @Get('visits')
  async list(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clientId') clientId?: string,
    @Query('userId') userId?: string,
  ) {
    const user = req.user as UserContext;
    const where: Prisma.CareVisitWhereInput = {
      AND: [
        await this.scope(user),
        clientId ? { clientId } : {},
        userId ? { userId } : {},
        from ? { startedAt: { gte: new Date(from) } } : {},
        to ? { startedAt: { lte: new Date(to) } } : {},
      ],
    };
    const rows = await this.prisma.careVisit.findMany({ where, orderBy: { startedAt: 'desc' }, include: INCLUDE, take: 1000 });
    // The signed-in user's visit in progress, wherever it falls (for the banner).
    const mine = await this.prisma.careVisit.findFirst({ where: { userId: user.id, status: 'IN_PROGRESS' }, include: INCLUDE });
    return { items: rows.map(listItem), inProgress: mine ? listItem(mine) : null };
  }

  /** Team members who can be given visits or shifts (pickers). */
  @Get('workers')
  @Area('visits', 'schedule')
  async workers() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'USER'] } },
      select: { ...PERSON.select, role: true, tenantRole: { select: { permissions: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });
    return users
      .filter((u) => {
        if (u.role === 'ADMIN') return true;
        const p = (u.tenantRole?.permissions ?? {}) as Record<string, unknown>;
        return !!p['visits'] || !!p['schedule'];
      })
      .map((u) => ({ ...personRef(u), email: u.email, firstName: u.firstName, lastName: u.lastName }));
  }

  /** The visit checklist form (for Customize form). */
  @Get('visit-form')
  async visitForm() {
    return { formId: (await this.checklistForm()).formId };
  }

  @Get('visits/:id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<CareVisitDto> {
    const user = req.user as UserContext;
    await this.find(user, id);
    return this.view(user, id);
  }

  /** Start a visit now, or log one that already happened (with endedAt). */
  @Post('visits')
  async create(@Req() req: Request, @Body() dto: CreateVisitDto) {
    const user = req.user as UserContext;
    const workerId = dto.userId && dto.userId !== user.id ? dto.userId : user.id;
    if (workerId !== user.id && this.access.level(user, 'visits') !== 'all') {
      throw new ForbiddenException("Your role can only log your own visits");
    }
    await this.assertClient(user, dto.clientId);
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundException('Organization not found');
    if (dto.shiftId) {
      const shift = await this.prisma.careShift.findUnique({ where: { id: dto.shiftId }, include: { visit: { select: { id: true } } } });
      if (!shift || shift.clientId !== dto.clientId) throw new BadRequestException('That shift is not for this organization');
      if (shift.visit) throw new ConflictException('This shift already has a visit');
    }
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    if (endedAt && endedAt <= startedAt) throw new BadRequestException('The end must be after the start');
    if (!endedAt) {
      const running = await this.prisma.careVisit.findFirst({ where: { userId: workerId, status: 'IN_PROGRESS' }, select: { id: true } });
      if (running) throw new ConflictException('There is already a visit in progress. End it first.');
    }
    const values = await this.mergeValues({}, dto.values ?? {});
    const visit = await this.prisma.careVisit.create({
      data: {
        clientId: client.id,
        userId: workerId,
        shiftId: dto.shiftId ?? null,
        startedAt,
        endedAt,
        status: endedAt ? 'COMPLETED' : 'IN_PROGRESS',
        notes: dto.notes?.trim() || null,
        values: values as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    if (endedAt) await this.syncTimeEntry(visit.id);
    return this.view(user, visit.id);
  }

  @Put('visits/:id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateVisitDto) {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : visit.startedAt;
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : visit.endedAt;
    if (endedAt && endedAt <= startedAt) throw new BadRequestException('The end must be after the start');
    const timesChanged = startedAt.getTime() !== visit.startedAt.getTime() || (endedAt?.getTime() ?? null) !== (visit.endedAt?.getTime() ?? null);
    if (timesChanged && this.invoiced(visit)) throw new BadRequestException("This visit's time is already on an invoice, so its times can't change");
    const data: Prisma.CareVisitUpdateInput = { startedAt, endedAt };
    if (dto.endedAt && visit.status === 'IN_PROGRESS') data.status = 'COMPLETED';
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.values) data.values = (await this.mergeValues(visit.values as Record<string, unknown>, dto.values)) as Prisma.InputJsonValue;
    await this.prisma.careVisit.update({ where: { id }, data });
    if (endedAt) await this.syncTimeEntry(id);
    return this.view(user, id);
  }

  /** End a visit in progress (now, or at endedAt) and create its time entry. */
  @Post('visits/:id/end')
  @Action('edit')
  async end(@Req() req: Request, @Param('id') id: string, @Body() dto: EndVisitDto) {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    if (visit.status !== 'IN_PROGRESS') throw new BadRequestException('This visit has already ended');
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    if (endedAt <= visit.startedAt) throw new BadRequestException('The end must be after the start');
    const data: Prisma.CareVisitUpdateInput = { endedAt, status: 'COMPLETED' };
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.values) data.values = (await this.mergeValues(visit.values as Record<string, unknown>, dto.values)) as Prisma.InputJsonValue;
    await this.prisma.careVisit.update({ where: { id }, data });
    await this.syncTimeEntry(id);
    return this.view(user, id);
  }

  /** Delete a visit and its time entry (not when that time is already invoiced). */
  @Delete('visits/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const visit = await this.find(req.user as UserContext, id);
    if (this.invoiced(visit)) throw new BadRequestException("This visit's time is already on an invoice, so it can't be deleted");
    await this.prisma.$transaction(async (tx) => {
      await tx.careVisit.delete({ where: { id } });
      if (visit.timeEntryId) await tx.timeEntry.deleteMany({ where: { id: visit.timeEntryId } });
    });
    return { deleted: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Own: my visits. All: visits at organizations I reach. */
  private async scope(user: UserContext): Promise<Prisma.CareVisitWhereInput> {
    if (this.access.level(user, 'visits') !== 'all') return { userId: user.id };
    const reach = await this.access.clientIdFilter(user);
    return reach ? { clientId: reach } : {};
  }

  private async assertClient(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Organization not found');
  }

  private async find(user: UserContext, id: string) {
    const visit = await this.prisma.careVisit.findFirst({ where: { AND: [{ id }, await this.scope(user)] }, include: INCLUDE });
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  private invoiced(v: { timeEntry: { invoiceLineItemId: string | null; tenantInvoiceLineItemId: string | null } | null }) {
    return !!(v.timeEntry?.invoiceLineItemId || v.timeEntry?.tenantInvoiceLineItemId);
  }

  private async checklistForm() {
    await ensureCareForms(this.prisma);
    const form = await this.prisma.form.findFirst({ where: careForm('VISIT'), select: { id: true } });
    if (!form) throw new NotFoundException('Visit log form missing');
    return { formId: form.id, sections: await this.structure.sections(form.id) };
  }

  private async mergeValues(stored: Record<string, unknown>, submitted: Record<string, unknown>) {
    const { sections } = await this.checklistForm();
    const fields = sections.flatMap((s) => s.fields);
    try {
      return mergeFormValues(fields, stored ?? {}, submitted);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid value');
    }
  }

  /** Create or update the finished visit's time entry (worker, organization, start and end). */
  private async syncTimeEntry(id: string) {
    const v = await this.prisma.careVisit.findUniqueOrThrow({ where: { id }, include: { ...INCLUDE, timeEntry: { select: { id: true, invoiceLineItemId: true, tenantInvoiceLineItemId: true } } } });
    if (!v.endedAt) return;
    if (v.timeEntry && (v.timeEntry.invoiceLineItemId || v.timeEntry.tenantInvoiceLineItemId)) return;
    const data = {
      userId: v.userId,
      clientId: v.clientId,
      startedAt: v.startedAt,
      stoppedAt: v.endedAt,
      durationMin: minutes(v.startedAt, v.endedAt),
      description: `Visit: ${v.client.name}`,
    };
    if (v.timeEntry) {
      await this.prisma.timeEntry.update({ where: { id: v.timeEntry.id }, data });
    } else {
      const te = await this.prisma.timeEntry.create({ data: { ...data, isBillable: true }, select: { id: true } });
      await this.prisma.careVisit.update({ where: { id }, data: { timeEntryId: te.id } });
    }
  }

  private async view(user: UserContext, id: string): Promise<CareVisitDto> {
    const v = await this.prisma.careVisit.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    const { formId, sections } = await this.checklistForm();
    const fields = sections.flatMap((s) => s.fields);
    const canEdit = isAdminRole(user.role) || (allows(user, 'visits', 'edit') && (v.userId === user.id || this.access.level(user, 'visits') === 'all'));
    return {
      ...listItem(v),
      notes: v.notes,
      values: liveValues(fields, v.values),
      sections: sections.filter((s) => s.fields.length),
      formId,
      timeEntryId: v.timeEntryId,
      invoiced: this.invoiced(v),
      canEdit,
    };
  }
}
