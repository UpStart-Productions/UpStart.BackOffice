import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProjectTaskSource } from '@prisma/client';
import { AsanaSyncService } from '../asana/asana-sync.service';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { SyncProjectContactsDto } from './dto/project-contact.dto';
import { SyncProjectTasksDto } from './dto/project-task.dto';
import { UpdateAsanaTaskBillablesDto, UpdateProjectDto } from './dto/update-project.dto';
import { syncProjectContacts } from './project-contacts.util';
import { activeTasksInclude, projectInclude, syncProjectTasks } from './project-tasks.util';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
    private readonly asanaSync: AsanaSyncService,
  ) {}

  @Get()
  @ApiQuery({ name: 'clientId', required: false })
  async list(@Query('clientId') clientId?: string) {
    return this.prisma.project.findMany({
      where: clientId ? { clientId } : undefined,
      include: activeTasksInclude,
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateProjectDto) {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const project = await this.prisma.project.create({
      data: {
        clientId: dto.clientId,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        isBillable: dto.isBillable ?? true,
        isActive: dto.isActive ?? true,
      },
      include: projectInclude,
    });
    await this.storageFolders.ensureProjectFolder(project.clientId, project.id);
    return project;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');

    const asanaLinkChanged =
      (dto.asanaProjectGid !== undefined && dto.asanaProjectGid !== existing.asanaProjectGid) ||
      (dto.asanaSectionGid !== undefined && dto.asanaSectionGid !== existing.asanaSectionGid);

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.clientId !== undefined && { clientId: dto.clientId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.isBillable !== undefined && { isBillable: dto.isBillable }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.asanaProjectGid !== undefined && { asanaProjectGid: dto.asanaProjectGid }),
        ...(dto.asanaProjectName !== undefined && { asanaProjectName: dto.asanaProjectName }),
        ...(dto.asanaSectionGid !== undefined && { asanaSectionGid: dto.asanaSectionGid }),
        ...(dto.asanaSectionName !== undefined && { asanaSectionName: dto.asanaSectionName }),
      },
      include: projectInclude,
    });

    if (dto.isBillable === false) {
      await this.prisma.projectTask.updateMany({
        where: { projectId: id },
        data: { isBillable: false },
      });
    }

    if (asanaLinkChanged && project.asanaSectionGid) {
      return this.asanaSync.syncProjectTasks(id);
    }

    if (
      dto.asanaProjectGid === null ||
      dto.asanaSectionGid === null
    ) {
      await this.prisma.projectTask.updateMany({
        where: { projectId: id, source: ProjectTaskSource.ASANA },
        data: { isActive: false },
      });
    }

    return project;
  }

  @Post(':id/asana/sync')
  async syncAsanaTasks(@Param('id') id: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    return this.asanaSync.syncProjectTasks(id);
  }

  @Patch(':id/asana-tasks')
  async updateAsanaTaskBillables(
    @Param('id') id: string,
    @Body() dto: UpdateAsanaTaskBillablesDto,
  ) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
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
  async syncTasks(@Param('id') id: string, @Body() dto: SyncProjectTasksDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    await syncProjectTasks(this.prisma, id, dto.tasks);
    return this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }

  @Put(':id/contacts')
  async syncContacts(@Param('id') id: string, @Body() dto: SyncProjectContactsDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    await syncProjectContacts(this.prisma, id, dto.contacts);
    return this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    await this.storageFolders.removeProjectTree(existing.clientId, id);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }
}
