import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Logger, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Request } from 'express';
import type { ClientVisitDto, VisitDetailDto, VisitFormDto, VisitLogFormDto } from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { FormStructureService } from '../forms/form-structure.service';
import { liveValues } from '../forms/form-fields.util';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { canChangePlan, canWorkVisit, visitScope } from './visit-access.util';
import { minutesBetween, PERSON, personRef, repeatLabel, VISIT_FORMS_INCLUDE, VISIT_INCLUDE, visitForms, visitView, type VisitRow } from './visit-view.util';
import { addDaysToDate, formatVisitStart, isValidTimeZone, localDate, visitInstants, weekdayOf } from './zoned-time.util';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** How far ahead a repeating series has visits at first; looking further ahead generates more. */
const INITIAL_WEEKS = 8;
const MAX_AHEAD_DAYS = 400;

class RepeatDto {
  /** 0 = Sunday … 6 = Saturday. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays!: number[];
  /** Last local date (inclusive); omitted = keeps going. */
  @IsOptional() @Matches(DATE) until?: string;
}

export class CreateVisitDto {
  @IsString() clientId!: string;
  /** Omitted or null = open visit. */
  @IsOptional() @IsString() userId?: string | null;
  @IsString() visitTypeId!: string;
  @Matches(DATE) date!: string;
  @Matches(TIME) startTime!: string;
  @Matches(TIME) endTime!: string;
  /** The planner's IANA time zone, e.g. America/Los_Angeles. */
  @IsString() timezone!: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @ValidateNested() @Type(() => RepeatDto) repeat?: RepeatDto;
}

export class UpdateVisitDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() userId?: string | null;
  @IsOptional() @IsString() visitTypeId?: string;
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @Matches(TIME) startTime?: string;
  @IsOptional() @Matches(TIME) endTime?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string | null;
  /** Actual times. Both given on a visit that isn't finished finishes it (logged afterwards). */
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
}

export class FinishVisitDto {
  /** Default now. */
  @IsOptional() @IsDateString() endedAt?: string;
}

/**
 * Schedule (core): visits per client and team member (or open), one-off or repeating weekly. The plan (when, who,
 * what) changes only by an admin or whoever scheduled it (canChangePlan). The visit log (actual times, notes, forms)
 * is filled in by the team member on it or an admin (canWorkVisit); a start and end finish it and create a time entry
 * so the hours flow into invoicing. Forms attached to the visit's type land on the client's Records tab.
 * Schedule: Own = the user's own visits (they can only plan their own); All = everyone's, at the clients they reach.
 */
@ApiTags('visits')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('schedule')
@Controller('visits')
export class VisitsController {
  private readonly logger = new Logger(VisitsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly delivery: NotificationDeliveryService,
    private readonly structure: FormStructureService,
  ) {}

  /** Visits starting in [from, to). Repeating series are filled in up to `to` first. ?userId=open: open visits. */
  @Get()
  async list(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('clientId') clientId?: string,
    @Query('userId') userId?: string,
  ) {
    const user = req.user as UserContext;
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('from and to are required');
    await this.extendSeries(end);
    const rows = await this.prisma.visit.findMany({
      where: {
        AND: [
          await visitScope(this.access, user),
          { startAt: { gte: start, lt: end } },
          clientId ? { clientId } : {},
          userId === 'open' ? { userId: null } : userId ? { userId } : {},
        ],
      },
      orderBy: { startAt: 'asc' },
      include: VISIT_INCLUDE,
    });
    return rows.map(visitView);
  }

  /** Team members who can be given visits (pickers). */
  @Get('team-members')
  async teamMembers() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'USER'] } },
      select: PERSON.select,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });
    return users.map((u) => ({ ...personRef(u), email: u.email, firstName: u.firstName, lastName: u.lastName }));
  }

  /**
   * A client's Visits tab: visits that happened or should have (started, finished, or planned and already over),
   * newest first, each with its forms. Cancelled visits are left out. Upcoming ones come from the list above.
   */
  @Get('client/:clientId/history')
  async clientHistory(@Req() req: Request, @Param('clientId') clientId: string): Promise<ClientVisitDto[]> {
    const user = req.user as UserContext;
    const now = new Date();
    const rows = await this.prisma.visit.findMany({
      where: {
        AND: [
          await visitScope(this.access, user),
          { clientId },
          { OR: [{ status: { in: ['IN_PROGRESS', 'COMPLETED'] } }, { status: 'SCHEDULED', endAt: { lt: now } }] },
        ],
      },
      orderBy: { startAt: 'desc' },
      take: 500,
      include: { ...VISIT_INCLUDE, ...VISIT_FORMS_INCLUDE },
    });
    return rows.map((v) => ({ ...visitView(v as unknown as VisitRow), forms: visitForms(v) }));
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string): Promise<VisitDetailDto> {
    const user = req.user as UserContext;
    await this.find(user, id);
    return this.detail(user, id);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateVisitDto) {
    const user = req.user as UserContext;
    if (!isValidTimeZone(dto.timezone)) throw new BadRequestException('Unknown time zone');
    const teamMemberId = await this.checkTeamMember(user, dto.userId ?? null);
    await this.assertClient(user, dto.clientId);
    await this.assertVisitType(dto.visitTypeId);
    const notes = dto.notes?.trim() || null;
    let firstId: string;
    if (dto.repeat) {
      const weekdays = [...new Set(dto.repeat.weekdays)].sort((a, b) => a - b);
      if (dto.repeat.until && dto.repeat.until < dto.date) throw new BadRequestException('Repeat until must be after the first day');
      const series = await this.prisma.visitSeries.create({
        data: {
          clientId: dto.clientId, userId: teamMemberId, visitTypeId: dto.visitTypeId, weekdays, startTime: dto.startTime, endTime: dto.endTime,
          timezone: dto.timezone, startDate: dto.date, endDate: dto.repeat.until ?? null, generatedUntil: addDaysToDate(dto.date, -1), notes,
        },
      });
      const ids = await this.generate(series.id, addDaysToDate(dto.date, INITIAL_WEEKS * 7 - 1), user.id);
      if (!ids.length) throw new BadRequestException('No days match that repeat rule');
      firstId = ids[0];
    } else {
      const { startAt, endAt } = visitInstants(dto.date, dto.startTime, dto.endTime, dto.timezone);
      const row = await this.prisma.visit.create({
        data: { clientId: dto.clientId, userId: teamMemberId, visitTypeId: dto.visitTypeId, startAt, endAt, timezone: dto.timezone, notes, createdByUserId: user.id },
        select: { id: true },
      });
      firstId = row.id;
    }
    const visit = await this.prisma.visit.findUniqueOrThrow({ where: { id: firstId }, include: VISIT_INCLUDE });
    if (teamMemberId && teamMemberId !== user.id) await this.notifyAssigned(visit, user, !!dto.repeat);
    return { visit: visitView(visit), conflicts: teamMemberId ? await this.conflicts(teamMemberId, visit.id) : 0 };
  }

  /** Change one visit (a visit from a series keeps its series but is no longer regenerated). */
  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateVisitDto) {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    const changesPlan =
      dto.userId !== undefined || !!dto.clientId || !!dto.visitTypeId || !!(dto.date || dto.startTime || dto.endTime || dto.timezone);
    const changesLog = dto.notes !== undefined || !!dto.startedAt || !!dto.endedAt;
    if (changesPlan && !canChangePlan(user, visit)) throw new ForbiddenException('Only an admin or whoever scheduled this visit can change it');
    if (changesLog && !canWorkVisit(user, visit)) throw new ForbiddenException('Only the team member on this visit can fill in its log');
    const data: Prisma.VisitUncheckedUpdateInput = {};
    let teamMemberId = visit.userId;
    if (dto.userId !== undefined) {
      teamMemberId = await this.checkTeamMember(user, dto.userId);
      data.userId = teamMemberId;
    }
    if (dto.clientId && dto.clientId !== visit.clientId) {
      await this.assertClient(user, dto.clientId);
      data.clientId = dto.clientId;
    }
    if (dto.visitTypeId && dto.visitTypeId !== visit.visitTypeId) {
      await this.assertVisitType(dto.visitTypeId);
      data.visitTypeId = dto.visitTypeId;
    }
    if (dto.date || dto.startTime || dto.endTime || dto.timezone) {
      if (!dto.date || !dto.startTime || !dto.endTime || !dto.timezone) throw new BadRequestException('Send date, start time, end time and time zone together');
      if (!isValidTimeZone(dto.timezone)) throw new BadRequestException('Unknown time zone');
      Object.assign(data, visitInstants(dto.date, dto.startTime, dto.endTime, dto.timezone), { timezone: dto.timezone });
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.startedAt || dto.endedAt) {
      if (visit.status === 'CANCELLED') throw new BadRequestException('This visit is cancelled. Restore it first.');
      const startedAt = dto.startedAt ? new Date(dto.startedAt) : visit.startedAt;
      const endedAt = dto.endedAt ? new Date(dto.endedAt) : visit.endedAt;
      if (!startedAt) throw new BadRequestException('Give the start too');
      if (endedAt && endedAt <= startedAt) throw new BadRequestException('The end must be after the start');
      const changed = startedAt.getTime() !== visit.startedAt?.getTime() || (endedAt?.getTime() ?? null) !== (visit.endedAt?.getTime() ?? null);
      if (changed && invoiced(visit)) throw new BadRequestException("This visit's time is already on an invoice, so its times can't change");
      Object.assign(data, { startedAt, endedAt, status: endedAt ? 'COMPLETED' : 'IN_PROGRESS' });
    }
    await this.prisma.visit.update({ where: { id }, data });
    const updated = await this.prisma.visit.findUniqueOrThrow({ where: { id }, include: VISIT_INCLUDE });
    if (updated.endedAt) await this.syncTimeEntry(id);
    if (teamMemberId && teamMemberId !== user.id && teamMemberId !== visit.userId) await this.notifyAssigned(updated, user, false);
    return { visit: visitView(updated), conflicts: teamMemberId ? await this.conflicts(teamMemberId, id) : 0 };
  }

  /** Start the visit now (kept for a future mobile app; the web log just takes the times). An open visit becomes the starter's. */
  @Post(':id/start')
  @Action('edit')
  async start(@Req() req: Request, @Param('id') id: string): Promise<VisitDetailDto> {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    if (visit.userId ? !canWorkVisit(user, visit) : !canChangePlan(user, visit)) throw new ForbiddenException('Only the team member on this visit can start it');
    if (visit.status !== 'SCHEDULED') throw new BadRequestException(visit.status === 'CANCELLED' ? 'This visit is cancelled' : 'This visit has already started');
    const teamMemberId = visit.userId ?? user.id;
    const running = await this.prisma.visit.findFirst({ where: { userId: teamMemberId, status: 'IN_PROGRESS' }, select: { id: true } });
    if (running) throw new ConflictException('There is already a visit in progress. Finish it first.');
    await this.prisma.visit.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), userId: teamMemberId } });
    return this.detail(user, id);
  }

  /** Finish a visit in progress (now, or at endedAt) and create its time entry (kept for a future mobile app). */
  @Post(':id/finish')
  @Action('edit')
  async finish(@Req() req: Request, @Param('id') id: string, @Body() dto: FinishVisitDto): Promise<VisitDetailDto> {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    if (!canWorkVisit(user, visit)) throw new ForbiddenException('Only the team member on this visit can finish it');
    if (visit.status !== 'IN_PROGRESS' || !visit.startedAt) throw new BadRequestException('This visit is not in progress');
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    if (endedAt <= visit.startedAt) throw new BadRequestException('The end must be after the start');
    await this.prisma.visit.update({ where: { id }, data: { endedAt, status: 'COMPLETED' } });
    await this.syncTimeEntry(id);
    return this.detail(user, id);
  }

  @Post(':id/cancel')
  @Action('edit')
  async cancel(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    if (!canChangePlan(user, visit)) throw new ForbiddenException('Only an admin or whoever scheduled this visit can cancel it');
    if (visit.status !== 'SCHEDULED') throw new BadRequestException('Only a visit that hasn\'t started can be cancelled');
    await this.prisma.visit.update({ where: { id }, data: { status: 'CANCELLED' } });
    return visitView(await this.prisma.visit.findUniqueOrThrow({ where: { id }, include: VISIT_INCLUDE }));
  }

  @Post(':id/restore')
  @Action('edit')
  async restore(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    if (!canChangePlan(user, visit)) throw new ForbiddenException('Only an admin or whoever scheduled this visit can restore it');
    if (visit.status !== 'CANCELLED') throw new BadRequestException('This visit is not cancelled');
    await this.prisma.visit.update({ where: { id }, data: { status: 'SCHEDULED' } });
    return visitView(await this.prisma.visit.findUniqueOrThrow({ where: { id }, include: VISIT_INCLUDE }));
  }

  /**
   * Delete one visit and its time entry (not when that time is invoiced), or (?following=true) this and every later
   * visit of its series that hasn't been worked, ending the series. Forms filled in on it stay on the client.
   */
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string, @Query('following') following?: string) {
    const user = req.user as UserContext;
    const visit = await this.find(user, id);
    if (!canChangePlan(user, visit)) throw new ForbiddenException('Only an admin or whoever scheduled this visit can delete it');
    if (following === 'true' && visit.seriesId) {
      const series = await this.prisma.visitSeries.findUniqueOrThrow({ where: { id: visit.seriesId } });
      const day = localDate(visit.startAt, series.timezone);
      const res = await this.prisma.visit.deleteMany({
        where: { seriesId: series.id, startAt: { gte: visit.startAt }, status: { in: ['SCHEDULED', 'CANCELLED'] } },
      });
      await this.prisma.visitSeries.update({ where: { id: series.id }, data: { endDate: addDaysToDate(day, -1) } });
      return { deleted: res.count };
    }
    if (invoiced(visit)) throw new BadRequestException("This visit's time is already on an invoice, so it can't be deleted");
    await this.prisma.$transaction(async (tx) => {
      await tx.visit.delete({ where: { id } });
      if (visit.timeEntryId) await tx.timeEntry.deleteMany({ where: { id: visit.timeEntryId } });
    });
    return { deleted: 1 };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async find(user: UserContext, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { AND: [{ id }, await visitScope(this.access, user)] },
      include: { ...VISIT_INCLUDE, timeEntry: { select: { invoiceLineItemId: true, tenantInvoiceLineItemId: true } } },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  private async assertClient(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Client not found');
    const exists = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Client not found');
  }

  private async assertVisitType(id: string) {
    const type = await this.prisma.visitType.findFirst({ where: { id, isActive: true }, select: { id: true } });
    if (!type) throw new BadRequestException('Pick a visit type');
  }

  /** Own-level users can only plan their own visits; the team member must be active. */
  private async checkTeamMember(user: UserContext, userId: string | null): Promise<string | null> {
    if (this.access.level(user, 'schedule') !== 'all') {
      if (userId !== user.id) throw new ForbiddenException('Your role can only plan your own visits');
      return user.id;
    }
    if (!userId) return null;
    const member = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, role: { in: ['ADMIN', 'USER'] } }, select: { id: true } });
    if (!member) throw new BadRequestException('Pick an active team member');
    return member.id;
  }

  /** Other planned visits of this team member that overlap this one. */
  private async conflicts(userId: string, visitId: string): Promise<number> {
    const v = await this.prisma.visit.findUniqueOrThrow({ where: { id: visitId }, select: { startAt: true, endAt: true } });
    return this.prisma.visit.count({
      where: { userId, status: { not: 'CANCELLED' }, id: { not: visitId }, startAt: { lt: v.endAt }, endAt: { gt: v.startAt } },
    });
  }

  /** Create the series' visits from the day after generatedUntil through `until` (local dates). Returns new ids. */
  private async generate(seriesId: string, until: string, createdByUserId: string | null): Promise<string[]> {
    const s = await this.prisma.visitSeries.findUniqueOrThrow({ where: { id: seriesId } });
    // Visits added later (looking ahead) keep whoever planned the series.
    if (!createdByUserId) {
      const first = await this.prisma.visit.findFirst({ where: { seriesId, createdByUserId: { not: null } }, select: { createdByUserId: true } });
      createdByUserId = first?.createdByUserId ?? null;
    }
    const last = s.endDate && s.endDate < until ? s.endDate : until;
    const ids: string[] = [];
    for (let day = addDaysToDate(s.generatedUntil, 1); day <= last; day = addDaysToDate(day, 1)) {
      if (!s.weekdays.includes(weekdayOf(day))) continue;
      const { startAt, endAt } = visitInstants(day, s.startTime, s.endTime, s.timezone);
      const row = await this.prisma.visit.create({
        data: { clientId: s.clientId, userId: s.userId, visitTypeId: s.visitTypeId, seriesId: s.id, startAt, endAt, timezone: s.timezone, notes: s.notes, createdByUserId },
        select: { id: true },
      });
      ids.push(row.id);
    }
    if (last > s.generatedUntil) await this.prisma.visitSeries.update({ where: { id: s.id }, data: { generatedUntil: last } });
    return ids;
  }

  /** Make sure every open-ended or longer series has visits up to `end` (capped a year or so ahead). */
  private async extendSeries(end: Date) {
    const cap = new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000);
    const target = end < cap ? end : cap;
    const series = await this.prisma.visitSeries.findMany({ select: { id: true, timezone: true, generatedUntil: true, endDate: true } });
    for (const s of series) {
      const until = localDate(target, s.timezone);
      if (s.generatedUntil >= until || (s.endDate && s.generatedUntil >= s.endDate)) continue;
      await this.generate(s.id, until, null);
    }
  }

  /** Create or update the finished visit's time entry (team member, client, actual start and end). */
  private async syncTimeEntry(id: string) {
    const v = await this.prisma.visit.findUniqueOrThrow({
      where: { id },
      include: { ...VISIT_INCLUDE, timeEntry: { select: { id: true, invoiceLineItemId: true, tenantInvoiceLineItemId: true } } },
    });
    if (!v.startedAt || !v.endedAt || !v.userId) return;
    if (invoiced(v)) return;
    const data = {
      userId: v.userId,
      clientId: v.clientId,
      startedAt: v.startedAt,
      stoppedAt: v.endedAt,
      durationMin: minutesBetween(v.startedAt, v.endedAt),
      description: `${v.visitType.name}: ${v.client.name}`,
    };
    if (v.timeEntry) {
      await this.prisma.timeEntry.update({ where: { id: v.timeEntry.id }, data });
    } else {
      const te = await this.prisma.timeEntry.create({ data: { ...data, isBillable: true }, select: { id: true } });
      await this.prisma.visit.update({ where: { id }, data: { timeEntryId: te.id } });
    }
  }

  private async detail(user: UserContext, id: string): Promise<VisitDetailDto> {
    const v = await this.prisma.visit.findUniqueOrThrow({
      where: { id },
      include: {
        ...VISIT_INCLUDE,
        timeEntry: { select: { invoiceLineItemId: true, tenantInvoiceLineItemId: true } },
        ...VISIT_FORMS_INCLUDE,
      },
    });
    return {
      ...visitView(v as unknown as VisitRow),
      forms: await this.logForms(visitForms(v)),
      timeEntryId: v.timeEntryId,
      invoiced: invoiced(v),
      canWork: canWorkVisit(user, v),
    };
  }

  /** The visit log fills its forms in place: each form's questions and this visit's answers. */
  private async logForms(forms: VisitFormDto[]): Promise<VisitLogFormDto[]> {
    const ids = forms.map((f) => f.recordId).filter((id): id is string => !!id);
    const records = ids.length ? await this.prisma.formResponse.findMany({ where: { id: { in: ids } }, select: { id: true, values: true } }) : [];
    return Promise.all(
      forms.map(async (f) => {
        const sections = await this.structure.sections(f.formId, { filledOnly: true });
        const stored = records.find((r) => r.id === f.recordId)?.values ?? {};
        return { ...f, sections, values: liveValues(sections.flatMap((s) => s.fields), stored) };
      }),
    );
  }

  private async notifyAssigned(visit: VisitRow, actor: UserContext, repeating: boolean) {
    if (!visit.userId) return;
    try {
      const when = formatVisitStart(visit.startAt, visit.timezone);
      const who = actor.firstName ?? actor.email;
      const repeat = repeating && visit.series ? `, repeating ${repeatLabel(visit.series.weekdays).toLowerCase()}` : '';
      await this.delivery.deliver({
        userId: visit.userId,
        type: 'visit_assigned',
        title: `You have a ${repeating ? 'repeating ' : ''}visit with ${visit.client.name}`,
        body: `${who} put you on the schedule for a ${visit.visitType.name} visit at ${visit.client.name}, ${repeating ? 'starting ' : ''}${when}${repeat}. It's on your Schedule.`,
        meta: { entityType: 'visit', entityId: visit.id, route: ['visits', visit.id], actionLabel: 'Open visit' },
      });
    } catch (err) {
      this.logger.warn(`Visit notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function invoiced(v: { timeEntry: { invoiceLineItemId: string | null; tenantInvoiceLineItemId: string | null } | null }) {
  return !!(v.timeEntry?.invoiceLineItemId || v.timeEntry?.tenantInvoiceLineItemId);
}
