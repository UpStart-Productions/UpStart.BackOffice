import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { generatePortalToken } from '../portal/portal-token.util';
import { toStaffClientView } from '../portal/portal-client.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const clientSelect = {
  id: true,
  name: true,
  code: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  website: true,
  notes: true,
  category: true,
  isActive: true,
  portalEnabled: true,
  portalToken: true,
  portalTokenCreatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  @Get()
  async list() {
    const clients = await this.prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        website: true,
        notes: true,
        category: true,
        isActive: true,
        portalEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return clients;
  }

  @Post()
  async create(@Body() dto: CreateClientDto) {
    const client = await this.prisma.client.create({
      data: {
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
      select: clientSelect,
    });
    await this.storageFolders.ensureClientFolders(client.id);
    return toStaffClientView(client);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: clientSelect,
    });
    if (!client) throw new NotFoundException('Client not found');
    return toStaffClientView(client);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    const client = await this.prisma.client.update({
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
      select: clientSelect,
    });
    return toStaffClientView(client);
  }

  @Post(':id/portal/enable')
  async enablePortal(@Param('id') id: string) {
    const existing = await this.prisma.client.findUnique({ where: { id }, select: clientSelect });
    if (!existing) throw new NotFoundException('Client not found');

    const portalToken = existing.portalToken ?? generatePortalToken();
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        portalEnabled: true,
        portalToken,
        ...(!existing.portalToken ? { portalTokenCreatedAt: new Date() } : {}),
      },
      select: clientSelect,
    });
    return toStaffClientView(client);
  }

  @Post(':id/portal/disable')
  async disablePortal(@Param('id') id: string) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');

    const client = await this.prisma.client.update({
      where: { id },
      data: { portalEnabled: false },
      select: clientSelect,
    });
    return toStaffClientView(client);
  }

  @Post(':id/portal/regenerate')
  async regeneratePortal(@Param('id') id: string) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        portalToken: generatePortalToken(),
        portalTokenCreatedAt: new Date(),
        portalEnabled: true,
      },
      select: clientSelect,
    });
    return toStaffClientView(client);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.storageFolders.removeClientTree(id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }
}
