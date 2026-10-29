import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Logger, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Request } from 'express';
import { WEEKDAY_SHORT, type CareShiftDto } from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { personRef } from './care-visits.controller';
import { addDaysToDate, formatShiftStart, isValidTimeZone, localDate, shiftInstants, weekdayOf } from './zoned-time.util';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** How far ahead a repeating series has shifts at first; looking further ahead generates more. */
const INITIAL_WEEKS = 8;
const MAX_AHEAD_DAYS = 400;

class RepeatDto {
  /** 0 = Sunday … 6 = Saturday. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays!: number[];
  /** Last local date (inclusive); omitted = keeps going. */
  @IsOptional() @Matches(DATE) until?: string;
}

export class CreateShiftDto {
  @IsString() clientId!: string;
  /** Omitted or null = open shift. */
  @IsOptional() @IsString() userId?: string | null;
  @Matches(DATE) date!: string;
  @Matches(TIME) startTime!: string;
  @Matches(TIME) endTime!: string;
  /** The planner's IANA time zone, e.g. America/Los_Angeles. */
  @IsString() timezone!: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @ValidateNested() @Type(() => RepeatDto) repeat?: RepeatDto;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() userId?: string | null;
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @Matches(TIME) startTime?: string;
  @IsOptional() @Matches(TIME) endTime?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
}

const INCLUDE = {
  client: { select: { name: true } },
  user: { select: { id: true, firstName: true, lastName: true, name: true, email: true, avatarUrl: true } },
  series: { select: { weekdays: true } },
  visit: { select: { id: true, status: true } },
} as const;
type Row = Prisma.CareShiftGetPayload<{ include: typeof INCLUDE }>;

export function repeatLabel(weekdays: number[]): string {
  const days = [...weekdays].sort((a, b) => a - b);
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Every weekday';
  return `Every ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
}

function view(r: Row): CareShiftDto {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    worker: r.user ? personRef(r.user) : null,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    status: r.status,
    notes: r.notes,
    seriesId: r.seriesId,
    repeatLabel: r.series ? repeatLabel(r.series.weekdays) : null,
    visitId: r.visit?.id ?? null,
    visitStatus: r.visit?.status ?? null,
  };
}

/**
 * Care → Schedule: shifts per organization and worker (or open), one-off or repeating weekly.
 * Schedule: Own = the user's own shifts (they can only plan for themselves); All = everyone's, within the
 * organizations they reach. Workers are notified when a shift is assigned to them.
 */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('schedule')
@Controller('care')
export class CareShiftsController {
  private readonly logger = new Logger(CareShiftsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  /** Shifts starting in [from, to). Repeating series are filled in up to `to` first. */
  @Get('shifts')
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
    const rows = await this.prisma.careShift.findMany({
      where: {
        AND: [
          await this.scope(user),
          { startAt: { gte: start, lt: end } },
          clientId ? { clientId } : {},
          userId === 'open' ? { userId: null } : userId ? { userId } : {},
        ],
      },
      orderBy: { startAt: 'asc' },
      include: INCLUDE,
    });
    return rows.map(view);
  }

  @Get('shifts/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    return view(await this.find(req.user as UserContext, id));
  }

  @Post('shifts')
  async create(@Req() req: Request, @Body() dto: CreateShiftDto) {
    const user = req.user as UserContext;
    if (!isValidTimeZone(dto.timezone)) throw new BadRequestException('Unknown time zone');
    const workerId = await this.checkWorker(user, dto.userId ?? null);
    await this.assertClient(user, dto.clientId);
    const notes = dto.notes?.trim() || null;
    let first: { id: string } | null = null;
    if (dto.repeat) {
      const weekdays = [...new Set(dto.repeat.weekdays)].sort((a, b) => a - b);
      if (dto.repeat.until && dto.repeat.until < dto.date) throw new BadRequestException('Repeat until must be after the first day');
      const series = await this.prisma.careShiftSeries.create({
        data: {
          clientId: dto.clientId, userId: workerId, weekdays, startTime: dto.startTime, endTime: dto.endTime,
          timezone: dto.timezone, startDate: dto.date, endDate: dto.repeat.until ?? null,
          generatedUntil: addDaysToDate(dto.date, -1), notes,
        },
      });
      const horizon = addDaysToDate(dto.date, INITIAL_WEEKS * 7 - 1);
      const ids = await this.generate(series.id, horizon);
      if (!ids.length) throw new BadRequestException('No days match that repeat rule');
      first = { id: ids[0] };
    } else {
      const { startAt, endAt } = shiftInstants(dto.date, dto.startTime, dto.endTime, dto.timezone);
      first = await this.prisma.careShift.create({
        data: { clientId: dto.clientId, userId: workerId, startAt, endAt, timezone: dto.timezone, notes },
        select: { id: true },
      });
    }
    const shift = await this.prisma.careShift.findUniqueOrThrow({ where: { id: first.id }, include: INCLUDE });
    if (workerId && workerId !== user.id) await this.notifyAssigned(shift, user, !!dto.repeat);
    return { shift: view(shift), conflicts: workerId ? await this.conflicts(workerId, shift.id) : 0 };
  }

  /** Change one shift (a shift from a series keeps its series but is no longer regenerated). */
  @Put('shifts/:id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    const user = req.user as UserContext;
    const shift = await this.find(user, id);
    const data: Prisma.CareShiftUncheckedUpdateInput = {};
    let workerId = shift.userId;
    if (dto.userId !== undefined) {
      workerId = await this.checkWorker(user, dto.userId);
      data.userId = workerId;
    }
    if (dto.clientId && dto.clientId !== shift.clientId) {
      await this.assertClient(user, dto.clientId);
      data.clientId = dto.clientId;
    }
    if (dto.date || dto.startTime || dto.endTime || dto.timezone) {
      if (!dto.date || !dto.startTime || !dto.endTime || !dto.timezone) throw new BadRequestException('Send date, start time, end time and time zone together');
      if (!isValidTimeZone(dto.timezone)) throw new BadRequestException('Unknown time zone');
      Object.assign(data, shiftInstants(dto.date, dto.startTime, dto.endTime, dto.timezone), { timezone: dto.timezone });
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    await this.prisma.careShift.update({ where: { id }, data });
    const updated = await this.prisma.careShift.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    if (workerId && workerId !== user.id && workerId !== shift.userId) await this.notifyAssigned(updated, user, false);
    return { shift: view(updated), conflicts: workerId ? await this.conflicts(workerId, id) : 0 };
  }

  @Post('shifts/:id/cancel')
  @Action('edit')
  async cancel(@Req() req: Request, @Param('id') id: string) {
    await this.find(req.user as UserContext, id);
    await this.prisma.careShift.update({ where: { id }, data: { status: 'CANCELLED' } });
    return view(await this.prisma.careShift.findUniqueOrThrow({ where: { id }, include: INCLUDE }));
  }

  @Post('shifts/:id/restore')
  @Action('edit')
  async restore(@Req() req: Request, @Param('id') id: string) {
    await this.find(req.user as UserContext, id);
    await this.prisma.careShift.update({ where: { id }, data: { status: 'SCHEDULED' } });
    return view(await this.prisma.careShift.findUniqueOrThrow({ where: { id }, include: INCLUDE }));
  }

  /** Delete one shift, or (?following=true) this and every later shift of its series, ending the series. */
  @Delete('shifts/:id')
  async remove(@Req() req: Request, @Param('id') id: string, @Query('following') following?: string) {
    const shift = await this.find(req.user as UserContext, id);
    if (following === 'true' && shift.seriesId) {
      const series = await this.prisma.careShiftSeries.findUniqueOrThrow({ where: { id: shift.seriesId } });
      const day = localDate(shift.startAt, series.timezone);
      // Shifts with a visit stay: the visit happened.
      const res = await this.prisma.careShift.deleteMany({ where: { seriesId: series.id, startAt: { gte: shift.startAt }, visit: { is: null } } });
      await this.prisma.careShiftSeries.update({ where: { id: series.id }, data: { endDate: addDaysToDate(day, -1) } });
      return { deleted: res.count };
    }
    if (shift.visit) throw new BadRequestException('This shift has a visit. Cancel the shift instead.');
    await this.prisma.careShift.delete({ where: { id } });
    return { deleted: 1 };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async scope(user: UserContext): Promise<Prisma.CareShiftWhereInput> {
    if (this.access.level(user, 'schedule') !== 'all') return { userId: user.id };
    const reach = await this.access.clientIdFilter(user);
    return reach ? { clientId: reach } : {};
  }

  private async find(user: UserContext, id: string) {
    const shift = await this.prisma.careShift.findFirst({ where: { AND: [{ id }, await this.scope(user)] }, include: INCLUDE });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  private async assertClient(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Organization not found');
    const exists = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Organization not found');
  }

  /** Own-level users can only plan their own shifts; the worker must be an active team member. */
  private async checkWorker(user: UserContext, userId: string | null): Promise<string | null> {
    if (this.access.level(user, 'schedule') !== 'all') {
      if (userId !== user.id) throw new ForbiddenException('Your role can only plan your own shifts');
      return user.id;
    }
    if (!userId) return null;
    const worker = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, role: { in: ['ADMIN', 'USER'] } }, select: { id: true } });
    if (!worker) throw new BadRequestException('Pick an active team member');
    return worker.id;
  }

  /** Other scheduled shifts of this worker that overlap this one. */
  private async conflicts(userId: string, shiftId: string): Promise<number> {
    const s = await this.prisma.careShift.findUniqueOrThrow({ where: { id: shiftId }, select: { startAt: true, endAt: true } });
    return this.prisma.careShift.count({
      where: { userId, status: 'SCHEDULED', id: { not: shiftId }, startAt: { lt: s.endAt }, endAt: { gt: s.startAt } },
    });
  }

  /** Create the series' shifts from the day after generatedUntil through `until` (local dates). Returns new ids. */
  private async generate(seriesId: string, until: string): Promise<string[]> {
    const s = await this.prisma.careShiftSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const last = s.endDate && s.endDate < until ? s.endDate : until;
    const ids: string[] = [];
    for (let day = addDaysToDate(s.generatedUntil, 1); day <= last; day = addDaysToDate(day, 1)) {
      if (!s.weekdays.includes(weekdayOf(day))) continue;
      const { startAt, endAt } = shiftInstants(day, s.startTime, s.endTime, s.timezone);
      const row = await this.prisma.careShift.create({
        data: { clientId: s.clientId, userId: s.userId, seriesId: s.id, startAt, endAt, timezone: s.timezone, notes: s.notes },
        select: { id: true },
      });
      ids.push(row.id);
    }
    if (last > s.generatedUntil) await this.prisma.careShiftSeries.update({ where: { id: s.id }, data: { generatedUntil: last } });
    return ids;
  }

  /** Make sure every open-ended or longer series has shifts up to `end` (capped a year or so ahead). */
  private async extendSeries(end: Date) {
    const cap = new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000);
    const target = end < cap ? end : cap;
    const series = await this.prisma.careShiftSeries.findMany({ select: { id: true, timezone: true, generatedUntil: true, endDate: true } });
    for (const s of series) {
      const until = localDate(target, s.timezone);
      if (s.generatedUntil >= until || (s.endDate && s.generatedUntil >= s.endDate)) continue;
      await this.generate(s.id, until);
    }
  }

  private async notifyAssigned(shift: Row, actor: UserContext, repeating: boolean) {
    if (!shift.userId) return;
    try {
      const when = formatShiftStart(shift.startAt, shift.timezone);
      await this.delivery.deliver({
        userId: shift.userId,
        type: 'care_shift_assigned',
        title: `${repeating ? 'New repeating shift' : 'New shift'}: ${shift.client.name}`,
        body: `${when}${repeating && shift.series ? ` (${repeatLabel(shift.series.weekdays).toLowerCase()})` : ''}. Assigned by ${actor.firstName ?? actor.email}.`,
        meta: { entityType: 'care_shift', entityId: shift.id, route: ['care', 'schedule'], actionLabel: 'Open schedule' },
      });
    } catch (err) {
      this.logger.warn(`Shift notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
