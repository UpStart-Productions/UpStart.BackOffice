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
import { Request } from 'express';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { UserContext } from '../common/app.types';
import { resolveTimeEntryBillable } from '../projects/project-tasks.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { ImportTimesheetDto } from './dto/import-timesheet.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import {
  compareNames,
  parseTimesheetCsv,
  startedStoppedAt,
} from './timesheet-csv.util';

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
  projectTask: { select: { id: true, name: true, isBillable: true, source: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
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
  projectTask: { select: { id: true, name: true, isBillable: true, source: true } },
};

@ApiTags('time-entries')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async list(
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.prisma.timeEntry.findMany({
      where: {
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
    });
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

    const projects = await this.prisma.project.findMany({
      where: { isActive: true },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { where: { isActive: true } },
      },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of rows) {
        const project = projects.find(
          (p) => compareNames(p.name, row.project) && compareNames(p.client.name, row.client),
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
        } else if (project.tasks.length > 0) {
          throw new BadRequestException(
            `Task is required for project "${row.project}" (${row.date})`,
          );
        }

        const isBillable = await resolveTimeEntryBillable(
          this.prisma,
          project.id,
          projectTaskId,
          row.isBillable,
        );
        const { startedAt, stoppedAt } = startedStoppedAt(row.date, row.durationHours);
        const durationMin = Math.round(row.durationHours * 60);

        await tx.timeEntry.create({
          data: {
            userId: user.id,
            projectId: project.id,
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
    if (!dto.stoppedAt) {
      await this.assertNoRunningTimer(user.id);
    }
    const startedAt = new Date(dto.startedAt);
    const stoppedAt = dto.stoppedAt ? new Date(dto.stoppedAt) : undefined;
    const durationMin = stoppedAt ? computeDurationMin(startedAt, stoppedAt) : undefined;
    const isBillable = await resolveTimeEntryBillable(
      this.prisma,
      dto.projectId,
      dto.projectTaskId,
      dto.isBillable,
    );

    return this.prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: dto.projectId,
        projectTaskId: dto.projectTaskId,
        description: dto.description,
        startedAt,
        stoppedAt,
        durationMin,
        isBillable,
        hourlyRate: dto.hourlyRate,
      },
      include: entryIncludeWithoutUser,
    });
  }

  @Post(':id/restart')
  async restart(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserContext;
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
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

  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
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
  async get(@Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      include: entryInclude,
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    return entry;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Time entry not found');

    const projectId = dto.projectId ?? entry.projectId;
    const projectTaskId = dto.projectTaskId !== undefined ? dto.projectTaskId : entry.projectTaskId ?? undefined;
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : entry.startedAt;
    const stoppedAt = dto.stoppedAt ? new Date(dto.stoppedAt) : entry.stoppedAt ?? undefined;
    const durationMin = stoppedAt ? computeDurationMin(startedAt, stoppedAt) : undefined;
    const isBillable = await resolveTimeEntryBillable(
      this.prisma,
      projectId,
      projectTaskId,
      dto.isBillable ?? entry.isBillable,
    );

    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.projectTaskId !== undefined && { projectTaskId: dto.projectTaskId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startedAt !== undefined && { startedAt }),
        ...(dto.stoppedAt !== undefined && { stoppedAt, durationMin }),
        ...(dto.isBillable !== undefined || dto.projectTaskId !== undefined || dto.projectId !== undefined
          ? { isBillable }
          : {}),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
      include: entryIncludeWithoutUser,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
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
