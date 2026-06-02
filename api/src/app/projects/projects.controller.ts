import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContext } from '../workspace/workspace.types';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('workspaces/:workspaceSlug/projects')
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  private workspace(req: Request) {
    return (req as Request & { workspace?: WorkspaceContext }).workspace!;
  }

  @Get()
  @ApiQuery({ name: 'clientId', required: false })
  async list(@Req() req: Request, @Query('clientId') clientId?: string) {
    const ws = this.workspace(req);
    return this.prisma.project.findMany({
      where: { workspaceId: ws.id, ...(clientId ? { clientId } : {}) },
      include: { client: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateProjectDto) {
    const ws = this.workspace(req);
    return this.prisma.project.create({
      data: {
        workspaceId: ws.id,
        clientId: dto.clientId,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        isBillable: dto.isBillable ?? true,
        isActive: dto.isActive ?? true,
      },
      include: { client: { select: { id: true, name: true, code: true } } },
    });
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const project = await this.prisma.project.findFirst({
      where: { id, workspaceId: ws.id },
      include: { client: { select: { id: true, name: true, code: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    const ws = this.workspace(req);
    const existing = await this.prisma.project.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw new NotFoundException('Project not found');
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.clientId !== undefined && { clientId: dto.clientId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.isBillable !== undefined && { isBillable: dto.isBillable }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { client: { select: { id: true, name: true, code: true } } },
    });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const existing = await this.prisma.project.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw new NotFoundException('Project not found');
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }
}
