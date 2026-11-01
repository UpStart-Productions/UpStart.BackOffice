import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import type { CareScheduledVsActualRowDto } from '@upstart/back-office/shared';
import { AccessGuard, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';

const PERSON = { select: { id: true, firstName: true, lastName: true, name: true, email: true } } as const;
const nameOf = (u: { firstName: string | null; lastName: string | null; name: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
const minutes = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

/** Care reports (Reports area): scheduled shift hours against visited hours, per worker and client. */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('reports')
@Controller('care/reports')
export class CareReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Shifts starting and finished visits started in [from, to], within the clients the user reaches. ?clientId= one client. */
  @Get('scheduled-vs-actual')
  async scheduledVsActual(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('clientId') clientId?: string,
  ): Promise<CareScheduledVsActualRowDto[]> {
    const user = req.user as UserContext;
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('from and to are required');
    const reach = await this.access.clientIds(user);
    const clientWhere = clientId ? (reach === null || reach.includes(clientId) ? clientId : '__none__') : reach === null ? undefined : { in: reach };
    const [shifts, visits] = await Promise.all([
      this.prisma.careShift.findMany({
        where: { status: 'SCHEDULED', userId: { not: null }, startAt: { gte: start, lte: end }, ...(clientWhere ? { clientId: clientWhere } : {}) },
        select: { startAt: true, endAt: true, clientId: true, client: { select: { name: true } }, user: PERSON, visit: { select: { id: true } } },
      }),
      this.prisma.careVisit.findMany({
        where: { status: 'COMPLETED', startedAt: { gte: start, lte: end }, ...(clientWhere ? { clientId: clientWhere } : {}) },
        select: { startedAt: true, endedAt: true, shiftId: true, clientId: true, client: { select: { name: true } }, user: PERSON },
      }),
    ]);
    const rows = new Map<string, CareScheduledVsActualRowDto>();
    const row = (u: { id: string; firstName: string | null; lastName: string | null; name: string | null; email: string }, c: { id: string; name: string }) => {
      const key = `${u.id}|${c.id}`;
      let r = rows.get(key);
      if (!r) {
        r = { workerId: u.id, workerName: nameOf(u), clientId: c.id, clientName: c.name, scheduledMin: 0, visitedMin: 0, shiftCount: 0, missedShifts: 0, unscheduledVisits: 0 };
        rows.set(key, r);
      }
      return r;
    };
    const now = new Date();
    for (const s of shifts) {
      if (!s.user) continue;
      const r = row(s.user, { id: s.clientId, name: s.client.name });
      r.scheduledMin += minutes(s.startAt, s.endAt);
      r.shiftCount += 1;
      if (!s.visit && s.endAt < now) r.missedShifts += 1;
    }
    for (const v of visits) {
      const r = row(v.user, { id: v.clientId, name: v.client.name });
      if (v.endedAt) r.visitedMin += minutes(v.startedAt, v.endedAt);
      if (!v.shiftId) r.unscheduledVisits += 1;
    }
    return [...rows.values()].sort((a, b) => a.workerName.localeCompare(b.workerName) || a.clientName.localeCompare(b.clientName));
  }
}
