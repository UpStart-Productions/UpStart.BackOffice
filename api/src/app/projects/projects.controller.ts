import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'clientId', required: false })
  async list(@Query('clientId') clientId?: string) {
    return this.prisma.project.findMany({
      where: clientId ? { clientId } : undefined,
      include: { client: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
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
  async get(@Param('id') id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true, code: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
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
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }
}
