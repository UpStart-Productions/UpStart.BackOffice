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
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';

function computeDurationMin(startedAt: Date, stoppedAt: Date): number {
  return Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60000);
}

const entryInclude = {
  project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
  projectTask: { select: { id: true, name: true, isBillable: true, source: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
};

const entryIncludeWithoutUser = {
  project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
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
