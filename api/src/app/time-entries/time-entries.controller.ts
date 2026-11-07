import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Request } from 'express';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { resolveTimeEntryBillable } from '../projects/project-tasks.util';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId, runUnscoped } from '../tenancy/tenant-context';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { ImportTimesheetDto } from './dto/import-timesheet.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import {
  compareNames,
  parseTimesheetCsv,
  startedStoppedAt,
} from './timesheet-csv.util';
import {
  assertTimeEntryTaskIds,
  enrichTimeEntry,
  resolveTimeEntryTaskIds,
  syncTimeEntryWorkTasks,
  timeEntryWorkTasksInclude,
} from './time-entry-work-tasks.util';
import { ATTRIBUTION_INCLUDE, withAttribution } from '../common/record-attribution';
import { AccessGuard, Area, Action } from '../access/access.guard';

function computeDurationMin(startedAt: Date, stoppedAt: Date): number {
  return Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60000);
}

const entryInclude = {
  project: {
    select: {
      id: true,
      name: true,
      isBillable: true,
      client: { select: { id: true, name: true } },
    },
  },
  client: { select: { id: true, name: true } },
  projectTask: { select: { id: true, name: true, isBillable: true, source: true } },
  task: {
    select: {
      id: true,
      name: true,
      parent: { select: { id: true, name: true } },
    },
  },
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  /** Care: the visit this time came from (Reports can show visit time only). */
  careVisit: { select: { id: true } },
  workTasks: timeEntryWorkTasksInclude,
  ...ATTRIBUTION_INCLUDE,
};

const entryIncludeWithoutUser = {
  project: {
    select: {
      id: true,
      name: true,
      isBillable: true,
      client: { select: { id: true, name: true } },
    },
  },
  client: { select: { id: true, name: true } },
  projectTask: { select: { id: true, name: true, isBillable: true, source: true } },
  task: {
    select: {
      id: true,
      name: true,
      parent: { select: { id: true, name: true } },
    },
  },
  workTasks: timeEntryWorkTasksInclude,
  ...ATTRIBUTION_INCLUDE,
};

function presentEntry<T extends Parameters<typeof enrichTimeEntry>[0]>(entry: T) {
  return withAttribution(enrichTimeEntry(entry), entry);
}

@ApiTags('time-entries')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('time')
@Controller('time-entries')
export class TimeEntriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Which entries this user may reach. Time at 'own': their own entries, plus all entries on projects they lead.
   * Time at 'all': everyone's, limited to their assigned clients when Clients isn't 'all' (plus their own).
   */
  private async scope(user: UserContext): Promise<Prisma.TimeEntryWhereInput> {
    if (this.access.level(user, 'time') === 'own') return this.access.ownTimeWhere(user);
    const clientIds = await this.access.clientIdFilter(user);
    return clientIds ? { OR: [{ clientId: clientIds }, { userId: user.id }] } : {};
  }

  /**
   * The project and client an entry is logged against. Both are optional. With a project, its client is used;
   * without one, the client (if any) must be one the user can reach.
   */
  private async resolveLinks(user: UserContext, projectId: string | null, clientId: string | null) {
    if (projectId) {
      const scope = await this.access.projectFilter(user);
      const project = await this.prisma.project.findFirst({ where: { AND: [{ id: projectId }, scope ?? {}] }, select: { id: true, clientId: true } });
      if (!project) throw new NotFoundException('Project not found');
      return { projectId: project.id, clientId: project.clientId };
    }
    if (clientId) {
      const ids = await this.access.clientIds(user);
      if (ids && !ids.includes(clientId)) throw new NotFoundException('Client not found');
      const client = await this.prisma.client.findFirst({ where: { id: clientId }, select: { id: true } });
      if (!client) throw new NotFoundException('Client not found');
    }
    return { projectId: null, clientId: clientId || null };
  }

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async list(
    @Req() req: Request,
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = await this.scope(req.user as UserContext);
    return this.prisma.timeEntry.findMany({
      where: {
        AND: [scope],
        ...(projectId ? { projectId } : {}),
        ...(userId ? { userId } : {}),
        ...(from || to ? {
          startedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      include: entryInclude,
      orderBy: { startedAt: 'desc' },
    }).then((rows) => rows.map((row) => enrichTimeEntry(row)));
  }

  /** People whose time this user can view: themselves (plus people on projects they lead) at 'own', everyone at 'all'. */
  @Get('people')
  async people(@Req() req: Request) {
    const user = req.user as UserContext;
    const select = { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } as const;
    const rows =
      this.access.level(user, 'time') !== 'all'
        ? await this.prisma.user.findMany({
            where: { id: { in: [user.id, ...(await this.access.ledProjectPeopleIds(user))] } },
            select,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
          })
        : await this.prisma.user.findMany({
            where: { isActive: true, role: { in: ['ADMIN', 'USER'] } },
            select,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
          });
    if (this.access.level(user, 'time') === 'all') {
      // Super users' rows belong to no tenant: include the ones who have logged time here.
      const tenantId = currentTenantId();
      const supers = await runUnscoped(() =>
        this.prisma.user.findMany({ where: { isSuper: true, isActive: true, timeEntries: { some: { tenantId } } }, select }),
      );
      for (const s of supers) if (!rows.some((r) => r.id === s.id)) rows.push(s);
      rows.sort((a, b) => (a.firstName ?? '').localeCompare(b.firstName ?? '') || (a.lastName ?? '').localeCompare(b.lastName ?? '') || a.email.localeCompare(b.email));
    }
    return rows.map((u) => ({ ...u, avatarUrl: toPublicAssetUrl(u.avatarUrl) }));
  }

  @Get('days')
  @ApiQuery({ name: 'userId', required: false })
  async listDays(@Req() req: Request, @Query('userId') userId?: string) {
    const entries = await this.prisma.timeEntry.findMany({
      where: { AND: [await this.scope(req.user as UserContext), userId ? { userId } : {}] },
      select: { startedAt: true },
    });
    return entries.map((e) => e.startedAt.toISOString());
  }

  @Post('import')
  async importCsv(@Req() req: Request, @Body() dto: ImportTimesheetDto) {
    const user = req.user as UserContext;
    let csvText: string;
    try {
      csvText = Buffer.from(dto.fileBase64, 'base64').toString('utf-8');
    } catch {
      throw new BadRequestException('Invalid file data');
    }

    let rows;
    try {
      rows = parseTimesheetCsv(csvText);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid CSV');
    }

    const importClientIds = await this.access.clientIdFilter(user);
    const projects = await this.prisma.project.findMany({
      where: { isActive: true, ...(importClientIds ? { clientId: importClientIds } : {}) },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { where: { isActive: true } },
      },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of rows) {
        const project = projects.find(
          (p) => compareNames(p.name, row.project) && !!p.client && compareNames(p.client.name, row.client),
        );
        if (!project) {
          throw new BadRequestException(
            `No project "${row.project}" under client "${row.client}" (${row.date}). Create it in Back Office first.`,
          );
        }

        let projectTaskId: string | undefined;
        if (row.task) {
          const task = project.tasks.find((t) => compareNames(t.name, row.task));
          if (!task) {
            throw new BadRequestException(
              `No task "${row.task}" on project "${row.project}" (${row.date}). Add it under Project → Tasks.`,
            );
          }
          projectTaskId = task.id;
        }

        const isBillable = row.isBillable
          ? await resolveTimeEntryBillable(
              this.prisma,
              project.id,
              projectTaskId,
              true,
            )
          : false;
        const { startedAt, stoppedAt } = startedStoppedAt(row.date, row.durationHours);
        const durationMin = Math.round(row.durationHours * 60);

        await tx.timeEntry.create({
          data: {
            userId: user.id,
            projectId: project.id,
            clientId: project.client?.id ?? null,
            projectTaskId,
            description: row.description || undefined,
            startedAt,
            stoppedAt,
            durationMin,
            isBillable,
          },
        });
        count++;
      }
      return count;
    });

    return { imported: created, total: rows.length };
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateTimeEntryDto) {
    const user = req.user as UserContext;
    const links = await this.resolveLinks(user, dto.projectId || null, dto.clientId || null);
    if (!dto.stoppedAt) {
      await this.assertNoRunningTimer(user.id);
    }
    const startedAt = new Date(dto.startedAt);
    const stoppedAt = dto.stoppedAt ? new Date(dto.stoppedAt) : undefined;
    const durationMin = stoppedAt ? computeDurationMin(startedAt, stoppedAt) : undefined;
    const taskIds = resolveTimeEntryTaskIds(dto) ?? [];
    await assertTimeEntryTaskIds(this.prisma, links.projectId, taskIds);

    const isBillable = links.projectId
      ? await resolveTimeEntryBillable(this.prisma, links.projectId, dto.projectTaskId, dto.isBillable)
      : (dto.isBillable ?? true);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.timeEntry.create({
        data: {
          userId: user.id,
          projectId: links.projectId,
          clientId: links.clientId,
          projectTaskId: dto.projectTaskId,
          taskId: taskIds[0] ?? null,
          description: dto.description,
          startedAt,
          stoppedAt,
          durationMin,
          isBillable,
          hourlyRate: dto.hourlyRate,
        },
      });
      await syncTimeEntryWorkTasks(tx, row.id, taskIds);
      return tx.timeEntry.findUniqueOrThrow({ where: { id: row.id }, include: entryIncludeWithoutUser });
    });
    return enrichTimeEntry(created);
  }

  @Action('edit')
  @Post(':id/restart')
  async restart(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserContext;
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, ...(await this.scope(user)) } });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.userId !== user.id) throw new NotFoundException('Time entry not found');
    if (!entry.stoppedAt) {
      throw new BadRequestException('This entry is already running');
    }

    await this.assertNoRunningTimer(user.id);

    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        startedAt: new Date(),
        stoppedAt: null,
        durationMin: null,
      },
      include: entryIncludeWithoutUser,
    });
  }

  @Action('edit')
  @Post(':id/stop')
  async stop(@Req() req: Request, @Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.stoppedAt) throw new NotFoundException('Timer already stopped');

    const stoppedAt = new Date();
    const durationMin = computeDurationMin(entry.startedAt, stoppedAt);
    return this.prisma.timeEntry.update({
      where: { id },
      data: { stoppedAt, durationMin },
      include: entryIncludeWithoutUser,
    });
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, ...(await this.scope(req.user as UserContext)) },
      include: entryInclude,
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    return presentEntry(entry);
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    const user = req.user as UserContext;
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, ...(await this.scope(user)) } });
    if (!entry) throw new NotFoundException('Time entry not found');
    const linksChanged = dto.projectId !== undefined || dto.clientId !== undefined;
    const links = linksChanged
      ? await this.resolveLinks(
          user,
          dto.projectId !== undefined ? dto.projectId || null : entry.projectId,
          dto.clientId !== undefined ? dto.clientId || null : entry.clientId,
        )
      : { projectId: entry.projectId, clientId: entry.clientId };
    const projectId = links.projectId;
    const projectTaskId = dto.projectTaskId !== undefined ? dto.projectTaskId : entry.projectTaskId ?? undefined;
    const resolvedTaskIds = resolveTimeEntryTaskIds(dto);
    const taskIds =
      resolvedTaskIds !== undefined
        ? resolvedTaskIds
        : linksChanged && !projectId
          ? []
          : undefined;
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : entry.startedAt;
    const stoppedAt = dto.stoppedAt ? new Date(dto.stoppedAt) : entry.stoppedAt ?? undefined;
    const durationMin = stoppedAt ? computeDurationMin(startedAt, stoppedAt) : undefined;

    if (taskIds !== undefined) {
      await assertTimeEntryTaskIds(this.prisma, projectId, taskIds);
    }

    const isBillable = projectId
      ? await resolveTimeEntryBillable(this.prisma, projectId, projectTaskId, dto.isBillable ?? entry.isBillable)
      : (dto.isBillable ?? entry.isBillable);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({
        where: { id },
        data: {
          ...(linksChanged && {
            projectId: links.projectId,
            clientId: links.clientId,
            ...(links.projectId ? {} : { projectTaskId: null, taskId: null }),
          }),
          ...(dto.projectTaskId !== undefined && { projectTaskId: dto.projectTaskId }),
          ...(taskIds !== undefined && { taskId: taskIds[0] ?? null }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.startedAt !== undefined && { startedAt }),
          ...(dto.stoppedAt !== undefined && { stoppedAt, durationMin }),
          ...(dto.isBillable !== undefined || dto.projectTaskId !== undefined || linksChanged
            ? { isBillable }
            : {}),
          ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        },
      });
      if (taskIds !== undefined) {
        await syncTimeEntryWorkTasks(tx, id, taskIds);
      } else if (linksChanged && !projectId) {
        await syncTimeEntryWorkTasks(tx, id, []);
      }
      return tx.timeEntry.findUniqueOrThrow({ where: { id }, include: entryIncludeWithoutUser });
    });
    return presentEntry(updated);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!entry) throw new NotFoundException('Time entry not found');
    await this.prisma.timeEntry.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertNoRunningTimer(userId: string) {
    const running = await this.prisma.timeEntry.findFirst({
      where: { userId, stoppedAt: null },
    });
    if (running) {
      throw new ConflictException('Stop the current timer before starting another');
    }
  }
}
