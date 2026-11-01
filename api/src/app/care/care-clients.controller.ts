import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  CARE_FORM_MODULE,
  CARE_RECORD_KINDS,
  isAdminRole,
  type CareClientFormDto,
  type CareClientListItemDto,
  type CareClientOverviewDto,
  type CareStatus,
} from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { CareAccessService } from './care-access.service';
import { byCareKind, careForm, careKind, ensureCareForms } from './care-forms.util';
import { SetCareStatusDto } from './care.dto';

/**
 * Clients in care: who is in care (Care → Clients) and one client's Care tab. Open to anyone with a Care area
 * (Care forms, Visits or Schedule); each part shows only what that role may see. Clients reach applies.
 * Adding a client to care and changing the status needs Edit on the Care profile.
 */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('care', 'visits', 'schedule')
@Controller('care/clients')
export class CareClientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly care: CareAccessService,
    private readonly access: AccessService,
  ) {}

  /** Clients in care (any status) the user reaches, with the next shift and last visit they may see. */
  @Get()
  async list(@Req() req: Request): Promise<CareClientListItemDto[]> {
    const user = req.user as UserContext;
    const reach = await this.care.clientIds(user);
    const clients = await this.prisma.client.findMany({
      where: { careStatus: { not: null }, ...(reach === null ? {} : { id: { in: reach } }) },
      select: { id: true, name: true, careStatus: true },
      orderBy: { name: 'asc' },
    });
    if (!clients.length) return [];
    const ids = clients.map((c) => c.id);
    await ensureCareForms(this.prisma);
    const profile = await this.prisma.form.findFirst({ where: careForm('CARE_PROFILE'), select: { id: true } });
    const profiles = profile
      ? await this.prisma.formResponse.findMany({ where: { formId: profile.id, clientId: { in: ids } }, select: { clientId: true } })
      : [];
    const withProfile = new Set(profiles.map((p) => p.clientId));

    const nextShift = new Map<string, { at: Date; worker: string | null }>();
    const shiftScope = this.scope(user, 'schedule');
    if (shiftScope) {
      const shifts = await this.prisma.careShift.findMany({
        where: { AND: [shiftScope, { clientId: { in: ids }, status: 'SCHEDULED', startAt: { gte: new Date() } }] },
        orderBy: { startAt: 'asc' },
        select: { clientId: true, startAt: true, user: { select: { firstName: true, lastName: true, name: true, email: true } } },
        take: 2000,
      });
      for (const s of shifts) {
        if (!nextShift.has(s.clientId)) nextShift.set(s.clientId, { at: s.startAt, worker: s.user ? personName(s.user) : null });
      }
    }

    const lastVisit = new Map<string, Date>();
    const visitScope = this.scope(user, 'visits');
    if (visitScope) {
      const visits = await this.prisma.careVisit.groupBy({
        by: ['clientId'],
        where: { AND: [visitScope, { clientId: { in: ids } }] },
        _max: { startedAt: true },
      });
      for (const v of visits) if (v._max.startedAt) lastVisit.set(v.clientId, v._max.startedAt);
    }

    return clients.map((c) => ({
      clientId: c.id,
      name: c.name,
      careStatus: c.careStatus as CareStatus,
      hasCareProfile: withProfile.has(c.id),
      nextShiftAt: nextShift.get(c.id)?.at.toISOString() ?? null,
      nextShiftWorker: nextShift.get(c.id)?.worker ?? null,
      lastVisitAt: lastVisit.get(c.id)?.toISOString() ?? null,
    }));
  }

  /** One client's Care tab: status and the Intake form / Care profile the user's role can open. */
  @Get(':clientId')
  async overview(@Req() req: Request, @Param('clientId') clientId: string): Promise<CareClientOverviewDto> {
    const user = req.user as UserContext;
    const client = await this.reachableClient(user, clientId);
    return this.view(user, client);
  }

  /** Add to care (ACTIVE), pause, end, or take out of care (null). Records, visits and shifts are kept. */
  @Put(':clientId/status')
  @Action('view')
  async setStatus(@Req() req: Request, @Param('clientId') clientId: string, @Body() dto: SetCareStatusDto): Promise<CareClientOverviewDto> {
    const user = req.user as UserContext;
    await this.reachableClient(user, clientId);
    if (!(await this.canManage(user))) throw new ForbiddenException("Your role can't change who is in care");
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { careStatus: dto.status ?? null },
      select: { id: true, careStatus: true },
    });
    return this.view(user, client);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async reachableClient(user: UserContext, clientId: string) {
    await this.care.assertClient(user, clientId);
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, careStatus: true } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  /** Edit on the Care profile (admins always). */
  private async canManage(user: UserContext): Promise<boolean> {
    if (isAdminRole(user.role)) return true;
    await ensureCareForms(this.prisma);
    const profile = await this.prisma.form.findFirst({ where: careForm('CARE_PROFILE') });
    return !!profile && (await this.care.formAccess(user, profile)) === 'edit';
  }

  /** Own: the user's own visits or shifts. All: everyone's (Clients reach is applied by the caller). Null: no access. */
  private scope(user: UserContext, area: 'visits' | 'schedule'): { userId?: string } | null {
    const level = this.access.level(user, area);
    if (!level) return null;
    return level === 'all' ? {} : { userId: user.id };
  }

  private async view(user: UserContext, client: { id: string; careStatus: string | null }): Promise<CareClientOverviewDto> {
    await ensureCareForms(this.prisma);
    const roleId = await this.care.roleId(user);
    const forms = await this.prisma.form.findMany({
      where: { module: CARE_FORM_MODULE, key: { in: CARE_RECORD_KINDS } },
      include: { responses: { where: { clientId: client.id }, select: { id: true, updatedAt: true } } },
    });
    const out: CareClientFormDto[] = [];
    for (const f of byCareKind(forms)) {
      const myAccess = await this.care.formAccess(user, f, roleId);
      if (!myAccess) continue;
      out.push({
        formId: f.id,
        kind: careKind(f),
        name: f.name,
        myAccess,
        recordId: f.responses[0]?.id ?? null,
        updatedAt: f.responses[0]?.updatedAt.toISOString() ?? null,
      });
    }
    return {
      clientId: client.id,
      careStatus: (client.careStatus as CareStatus | null) ?? null,
      forms: out,
      canManage: await this.canManage(user),
    };
  }
}

function personName(u: { firstName: string | null; lastName: string | null; name: string | null; email: string }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
}
