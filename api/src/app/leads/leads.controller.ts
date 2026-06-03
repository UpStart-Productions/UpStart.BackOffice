import {
  Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Query, UseGuards, ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  @Get()
  async list(@Query('stage') stage?: LeadStage) {
    return this.prisma.lead.findMany({
      where: stage ? { stage } : undefined,
      orderBy: { organization: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateLeadDto) {
    return this.prisma.lead.create({
      data: {
        organization: dto.organization,
        primaryContact: dto.primaryContact,
        contactRole: dto.contactRole,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        stage: dto.stage ?? 'NEW_LEAD',
        source: dto.source,
        warmConnection: dto.warmConnection,
        category: dto.category,
        serviceInterests: dto.serviceInterests ?? [],
        nextAction: dto.nextAction,
        nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : undefined,
        lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : undefined,
        notes: dto.notes,
      },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { artifacts: { orderBy: { createdAt: 'desc' } } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    return this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.organization !== undefined && { organization: dto.organization }),
        ...(dto.primaryContact !== undefined && { primaryContact: dto.primaryContact }),
        ...(dto.contactRole !== undefined && { contactRole: dto.contactRole }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.stage !== undefined && { stage: dto.stage }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.warmConnection !== undefined && { warmConnection: dto.warmConnection }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.serviceInterests !== undefined && { serviceInterests: dto.serviceInterests }),
        ...(dto.nextAction !== undefined && { nextAction: dto.nextAction }),
        ...(dto.nextActionDate !== undefined && { nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : null }),
        ...(dto.lastContactDate !== undefined && { lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /** Convert a lead to a Client. Creates the client record, links artifacts, marks lead as ACTIVE_CLIENT. */
  @Post(':id/convert')
  async convert(@Param('id') id: string, @Body() dto: ConvertLeadDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.convertedClientId) throw new ConflictException('Lead already converted to a client');

    const code = dto.code.toUpperCase();
    const existing = await this.prisma.client.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Client code "${code}" is already in use`);

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: lead.organization,
          code,
          email: lead.email ?? undefined,
          phone: lead.phone ?? undefined,
          website: lead.website ?? undefined,
          category: lead.category ?? undefined,
          isActive: true,
        },
      });

      await this.storageFolders.ensureClientFolders(client.id);

      // Link artifacts to client (keep leadId for history)
      await tx.artifact.updateMany({
        where: { leadId: id },
        data: { clientId: client.id },
      });

      await tx.lead.update({
        where: { id },
        data: { stage: LeadStage.ACTIVE_CLIENT, convertedClientId: client.id },
      });

      return client;
    });
  }
}
