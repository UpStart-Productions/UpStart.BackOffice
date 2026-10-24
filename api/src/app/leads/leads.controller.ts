import {
  Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Query, UseGuards, ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { applyLeadEditsToLinks, ensureLeadLinks, leadPersonView } from './lead-links.util';
import { AccessGuard, Area } from '../access/access.guard';

/** What the pipeline needs to show about a lead's Account and person. */
const linkInclude = {
  client: { select: { id: true, name: true, journey: true } },
  contact: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      emails: { select: { email: true, isPrimary: true }, orderBy: { createdAt: 'asc' as const } },
    },
  },
} as const;

/** The lead with person fields read from its Contact, and the bulky contact row left out. */
function toLeadView<T extends { contact?: unknown; primaryContact: string | null; email: string | null; phone: string | null; contactRole: string | null }>(
  lead: T,
) {
  const { contact: _contact, ...rest } = lead;
  return { ...rest, ...leadPersonView(lead as never) };
}

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('pipeline')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  @Get()
  async list(@Query('stage') stage?: LeadStage) {
    const leads = await this.prisma.lead.findMany({
      where: stage ? { stage } : undefined,
      orderBy: { organization: 'asc' },
      include: linkInclude,
    });
    return leads.map(toLeadView);
  }

  @Post()
  async create(@Body() dto: CreateLeadDto) {
    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
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
        },
      });
      // Every pipeline item has an Account (a Prospect unless the name matches an existing one).
      await ensureLeadLinks(tx, created.id);
      return tx.lead.findUniqueOrThrow({ where: { id: created.id }, include: linkInclude });
    });
    return toLeadView(lead);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { artifacts: { orderBy: { createdAt: 'desc' } }, ...linkInclude },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return toLeadView(lead);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    const lead = await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
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
        },
      });
      const links = await ensureLeadLinks(tx, id);
      await applyLeadEditsToLinks(
        tx,
        { id, clientId: links.clientId, primaryContactId: links.primaryContactId },
        existing.organization,
        dto,
      );
      return tx.lead.findUniqueOrThrow({ where: { id }, include: linkInclude });
    });
    return toLeadView(lead);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Make the lead's Account a Client. Nothing is copied: the Account already holds the contacts,
   * timeline and files. The invoice code is optional and only needed once you invoice. Reversible
   * from the Account's Journey field.
   */
  @Post(':id/convert')
  async convert(@Param('id') id: string, @Body() dto: ConvertLeadDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const code = dto.code?.trim().toUpperCase();
    const client = await this.prisma.$transaction(async (tx) => {
      const { clientId } = await ensureLeadLinks(tx, id);
      if (code) {
        const taken = await tx.client.findFirst({ where: { code, id: { not: clientId } }, select: { id: true } });
        if (taken) throw new ConflictException(`Client code "${code}" is already in use`);
      }
      // The lead's files show on the Account too.
      await tx.artifact.updateMany({ where: { leadId: id, clientId: null }, data: { clientId } });
      return tx.client.update({
        where: { id: clientId },
        data: { journey: 'CLIENT', ...(code ? { code } : {}) },
      });
    });
    await this.storageFolders.ensureClientFolders(client.id);
    return client;
  }
}
