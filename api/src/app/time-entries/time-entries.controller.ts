import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';

function computeDurationMin(startedAt: Date, stoppedAt: Date): number {
  return Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60000);
}

@ApiTags('time-entries')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
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
      include: {
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateTimeEntryDto) {
    const user = req.user as UserContext;
    const startedAt = new Date(dto.startedAt);
    const stoppedAt = dto.stoppedAt ? new Date(dto.stoppedAt) : undefined;
    const durationMin = stoppedAt ? computeDurationMin(startedAt, stoppedAt) : undefined;

    return this.prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: dto.projectId,
        description: dto.description,
        startedAt,
        stoppedAt,
        durationMin,
        isBillable: dto.isBillable ?? true,
        hourlyRate: dto.hourlyRate,
      },
      include: {
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
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
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    return entry;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Time entry not found');

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : entry.startedAt;
    const stoppedAt = dto.stoppedAt ? new Date(dto.stoppedAt) : entry.stoppedAt ?? undefined;
    const durationMin = stoppedAt ? computeDurationMin(startedAt, stoppedAt) : undefined;

    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startedAt !== undefined && { startedAt }),
        ...(dto.stoppedAt !== undefined && { stoppedAt, durationMin }),
        ...(dto.isBillable !== undefined && { isBillable: dto.isBillable }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Time entry not found');
    await this.prisma.timeEntry.delete({ where: { id } });
    return { deleted: true };
  }
}
