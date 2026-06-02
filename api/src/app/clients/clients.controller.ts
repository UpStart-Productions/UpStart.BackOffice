import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContext } from '../workspace/workspace.types';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('workspaces/:workspaceSlug/clients')
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  private workspace(req: Request) {
    return (req as Request & { workspace?: WorkspaceContext }).workspace!;
  }

  @Get()
  async list(@Req() req: Request) {
    const ws = this.workspace(req);
    return this.prisma.client.findMany({
      where: { workspaceId: ws.id },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateClientDto) {
    const ws = this.workspace(req);
    return this.prisma.client.create({
      data: {
        workspaceId: ws.id,
        name: dto.name,
        code: dto.code.toUpperCase(),
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        website: dto.website,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const client = await this.prisma.client.findFirst({ where: { id, workspaceId: ws.id } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    const ws = this.workspace(req);
    const existing = await this.prisma.client.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw new NotFoundException('Client not found');
    return this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const existing = await this.prisma.client.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }
}
