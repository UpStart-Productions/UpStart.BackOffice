import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  @Get()
  async list() {
    return this.prisma.client.findMany({ orderBy: { name: 'asc' } });
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
    });
    await this.storageFolders.ensureClientFolders(client.id);
    return client;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
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
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.storageFolders.removeClientTree(id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }
}
