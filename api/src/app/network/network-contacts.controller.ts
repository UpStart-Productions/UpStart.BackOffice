import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNetworkContactDto, CreateNetworkContactBodyDto } from './dto/create-network-contact.dto';
import { UpdateNetworkContactDto } from './dto/update-network-contact.dto';

@ApiTags('network')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('network/contacts')
export class NetworkContactsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'companyId', required: false })
  async list(@Query('companyId') companyId?: string) {
    return this.prisma.networkContact.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
    });
  }

  @Post()
  async create(@Body() dto: CreateNetworkContactBodyDto) {
    const company = await this.prisma.networkCompany.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException('Network company not found');

    const isPrimary = dto.isPrimary ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.networkContact.updateMany({
          where: { companyId: dto.companyId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.networkContact.create({
        data: {
          companyId: dto.companyId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          title: dto.title?.trim() || null,
          email: dto.email,
          phone: dto.phone,
          linkedInUrl: dto.linkedInUrl?.trim() || null,
          isPrimary,
          lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : undefined,
        },
      });
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const contact = await this.prisma.networkContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Network contact not found');
    return contact;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNetworkContactDto) {
    const existing = await this.prisma.networkContact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Network contact not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.networkContact.updateMany({
          where: { companyId: existing.companyId, isPrimary: true, NOT: { id } },
          data: { isPrimary: false },
        });
      }

      return tx.networkContact.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName?.trim() || null }),
          ...(dto.title !== undefined && { title: dto.title?.trim() || null }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.linkedInUrl !== undefined && { linkedInUrl: dto.linkedInUrl?.trim() || null }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
          ...(dto.lastContactDate !== undefined && {
            lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : null,
          }),
        },
      });
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.networkContact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Network contact not found');
    await this.prisma.networkContact.delete({ where: { id } });
    return { deleted: true };
  }
}
