import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import type { VisitScheduledVsActualRowDto } from '@upstart/back-office/shared';
import { AccessGuard, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { minutesBetween, personName } from './visit-view.util';

const PERSON = { select: { id: true, firstName: true, lastName: true, name: true, email: true } } as const;

/** Visit reports (Reports area): planned visit hours against hours worked, per team member and client. */
@ApiTags('visits')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('reports')
@Controller('visit-reports')
export class VisitReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Visits planned to start in [from, to], within the clients the user reaches. ?clientId= one client. */
  @Get('scheduled-vs-actual')
  async scheduledVsActual(
    @Req() req: Request,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('clientId') clientId?: string,
  ): Promise<VisitScheduledVsActualRowDto[]> {
    const user = req.user as UserContext;
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('from and to are required');
    const reach = await this.access.clientIds(user);
    const clientWhere = clientId ? (reach === null || reach.includes(clientId) ? clientId : '__none__') : reach === null ? undefined : { in: reach };
    const visits = await this.prisma.visit.findMany({
      where: { status: { not: 'CANCELLED' }, userId: { not: null }, startAt: { gte: start, lte: end }, ...(clientWhere ? { clientId: clientWhere } : {}) },
      select: { startAt: true, endAt: true, startedAt: true, endedAt: true, status: true, clientId: true, client: { select: { name: true } }, user: PERSON },
    });
    const rows = new Map<string, VisitScheduledVsActualRowDto>();
    const now = new Date();
    for (const v of visits) {
      if (!v.user) continue;
      const key = `${v.user.id}|${v.clientId}`;
      let r = rows.get(key);
      if (!r) {
        r = { teamMemberId: v.user.id, teamMemberName: personName(v.user), clientId: v.clientId, clientName: v.client.name, scheduledMin: 0, visitedMin: 0, visitCount: 0, missedVisits: 0 };
        rows.set(key, r);
      }
      r.scheduledMin += minutesBetween(v.startAt, v.endAt);
      r.visitCount += 1;
      if (v.startedAt && v.endedAt) r.visitedMin += minutesBetween(v.startedAt, v.endedAt);
      if (v.status === 'SCHEDULED' && v.endAt < now) r.missedVisits += 1;
    }
    return [...rows.values()].sort((a, b) => a.teamMemberName.localeCompare(b.teamMemberName) || a.clientName.localeCompare(b.clientName));
  }
}
