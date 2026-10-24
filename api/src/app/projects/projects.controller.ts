import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param,
  Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProjectTaskSource } from '@prisma/client';
import { asanaBoardGids, asanaSectionGids, sameGidList } from '../asana/asana-link.util';
import { AsanaSyncService } from '../asana/asana-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { SyncProjectContactsDto } from './dto/project-contact.dto';
import { SyncProjectTasksDto } from './dto/project-task.dto';
import { UpdateAsanaTaskBillablesDto, UpdateProjectDto } from './dto/update-project.dto';
import { syncProjectContacts } from './project-contacts.util';
import { activeTasksInclude, projectInclude, syncProjectTasks } from './project-tasks.util';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
    private readonly asanaSync: AsanaSyncService,
    private readonly access: AccessService,
  ) {}

  /** A project the user may reach, or 404 (same answer as a missing project). */
  private async reachable(req: Request, id: string) {
    const scope = await this.access.projectFilter(req.user as UserContext);
    const project = await this.prisma.project.findFirst({ where: { AND: [{ id }, scope ?? {}] } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** Creating and deleting projects needs Projects at 'all'. */
  private requireAll(req: Request) {
    if (this.access.level(req.user as UserContext, 'projects') !== 'all') throw new ForbiddenException('You can only work on your own projects');
  }

  /** Also the project picker for time, expenses and invoices, so those areas can list (their reachable) projects. */
  @Get()
  @Area('projects', 'time', 'expenses', 'invoices')
  @ApiQuery({ name: 'clientId', required: false })
  async list(@Req() req: Request, @Query('clientId') clientId?: string) {
    const scope = await this.access.projectFilter(req.user as UserContext);
    return this.prisma.project.findMany({
      where: { AND: [clientId ? { clientId } : {}, scope ?? {}] },
      include: activeTasksInclude,
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateProjectDto) {
    this.requireAll(req);
    const clientId = dto.clientId || null;
    if (clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: clientId } });
      if (!client) throw new NotFoundException('Client not found');
    }

    const project = await this.prisma.project.create({
      data: {
        clientId,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        // Personal projects (no client) default to non-billable.
        isBillable: dto.isBillable ?? !!clientId,
        isActive: dto.isActive ?? true,
        color: dto.color ?? null,
      },
      include: projectInclude,
    });
    await this.storageFolders.ensureProjectFolder(project.clientId, project.id);
    return project;
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    await this.reachable(req, id);
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    const existing = await this.reachable(req, id);
    if (!existing) throw new NotFoundException('Project not found');

    const nextBoardGids =
      dto.asanaProjectGids !== undefined
        ? dto.asanaProjectGids ?? []
        : dto.asanaProjectGid !== undefined
          ? dto.asanaProjectGid
            ? [dto.asanaProjectGid]
            : []
          : asanaBoardGids(existing);
    const nextSectionGids =
      dto.asanaSectionGids !== undefined
        ? dto.asanaSectionGids ?? []
        : dto.asanaSectionGid !== undefined
          ? dto.asanaSectionGid
            ? [dto.asanaSectionGid]
            : []
          : asanaSectionGids(existing);
    const asanaLinkChanged =
      !sameGidList(nextBoardGids, asanaBoardGids(existing)) ||
      !sameGidList(nextSectionGids, asanaSectionGids(existing));

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.clientId !== undefined && { clientId: dto.clientId || null }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.isBillable !== undefined && { isBillable: dto.isBillable }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.asanaProjectGid !== undefined && { asanaProjectGid: dto.asanaProjectGid }),
        ...((dto.asanaProjectGids !== undefined || dto.asanaProjectGid !== undefined) && {
          asanaProjectGids: nextBoardGids,
        }),
        ...(dto.asanaProjectName !== undefined && { asanaProjectName: dto.asanaProjectName }),
        ...(dto.asanaSectionGid !== undefined && { asanaSectionGid: dto.asanaSectionGid }),
        ...((dto.asanaSectionGids !== undefined || dto.asanaSectionGid !== undefined) && {
          asanaSectionGids: nextSectionGids,
        }),
        ...(dto.asanaSectionName !== undefined && { asanaSectionName: dto.asanaSectionName }),
      },
      include: projectInclude,
    });

    // Time entries carry their project's client; keep them in step when the project moves to another client.
    if (dto.clientId !== undefined && (dto.clientId || null) !== existing.clientId) {
      await this.prisma.timeEntry.updateMany({ where: { projectId: id }, data: { clientId: dto.clientId || null } });
    }

    if (dto.isBillable === false) {
      await this.prisma.projectTask.updateMany({
        where: { projectId: id },
        data: { isBillable: false },
      });
    }

    if (asanaLinkChanged && nextSectionGids.length > 0) {
      return this.asanaSync.syncProjectTasks(id);
    }

    const asanaFieldsSent =
      dto.asanaProjectGid !== undefined ||
      dto.asanaProjectGids !== undefined ||
      dto.asanaSectionGid !== undefined ||
      dto.asanaSectionGids !== undefined;
    if (asanaFieldsSent && (nextBoardGids.length === 0 || nextSectionGids.length === 0)) {
      await this.prisma.projectTask.updateMany({
        where: { projectId: id, source: ProjectTaskSource.ASANA },
        data: { isActive: false },
      });
    }

    return project;
  }

  @Action('edit')
  @Post(':id/asana/sync')
  async syncAsanaTasks(@Req() req: Request, @Param('id') id: string) {
    const existing = await this.reachable(req, id);
    if (!existing) throw new NotFoundException('Project not found');
    return this.asanaSync.syncProjectTasks(id);
  }

  @Patch(':id/asana-tasks')
  async updateAsanaTaskBillables(@Req() req: Request, @Param('id') id: string,
    @Body() dto: UpdateAsanaTaskBillablesDto,
  ) {
    const existing = await this.reachable(req, id);
    if (!existing) throw new NotFoundException('Project not found');

    for (const task of dto.tasks) {
      await this.prisma.projectTask.updateMany({
        where: { id: task.id, projectId: id, source: ProjectTaskSource.ASANA },
        data: { isBillable: existing.isBillable ? task.isBillable : false },
      });
    }

    return this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }

  @Put(':id/tasks')
  async syncTasks(@Req() req: Request, @Param('id') id: string, @Body() dto: SyncProjectTasksDto) {
    const existing = await this.reachable(req, id);
    if (!existing) throw new NotFoundException('Project not found');
    await syncProjectTasks(this.prisma, id, dto.tasks);
    return this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }

  @Put(':id/contacts')
  async syncContacts(@Req() req: Request, @Param('id') id: string, @Body() dto: SyncProjectContactsDto) {
    const existing = await this.reachable(req, id);
    if (!existing) throw new NotFoundException('Project not found');
    await syncProjectContacts(this.prisma, id, dto.contacts);
    return this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    this.requireAll(req);
    const existing = await this.reachable(req, id);
    if (!existing) throw new NotFoundException('Project not found');
    await this.storageFolders.removeProjectTree(existing.clientId, id);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }
}
