import {
  Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Query, UseGuards, ConflictException,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArtifactType, LeadStage, LeadSource } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { ServiceKeyService } from '../service-keys/service-key.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { IngestLeadDto } from './dto/ingest-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
    private readonly serviceKeys: ServiceKeyService,
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

  /**
   * Ingest a lead from the Donor Readiness Audit Lambda.
   * Protected by x-webhook-secret header (AuditWebhookGuard).
   * Deduplicates by normalized website domain — if a lead already exists for
   * this domain, returns 200 with { duplicate: true, leadId } and does nothing.
   */
  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceKeyGuard)
  async ingest(@Body() dto: IngestLeadDto) {
    const domain = this._normalizeDomain(dto.website);

    // Dedup: check for any existing lead with the same website domain
    const existing = await this.prisma.lead.findFirst({
      where: { website: { contains: domain } },
      select: { id: true, organization: true },
    });
    if (existing) {
      return { duplicate: true, leadId: existing.id, organization: existing.organization };
    }

    const primaryContact = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined;
    const auditDate = dto.auditDate ? new Date(dto.auditDate) : new Date();
    const nextActionDate = new Date(auditDate);
    nextActionDate.setDate(nextActionDate.getDate() + 3);

    const lead = await this.prisma.lead.create({
      data: {
        organization: dto.organization,
        website: dto.website,
        email: dto.email,
        primaryContact: primaryContact ?? undefined,
        contactRole: dto.role,
        source: LeadSource.INBOUND,
        stage: LeadStage.DISCOVERY,
        serviceInterests: dto.serviceInterests ?? [],
        nextAction: 'Follow up on donor readiness audit',
        nextActionDate,
        lastContactDate: auditDate,
        artifacts: {
          create: [
            // Source note — where this lead came from
            {
              type: ArtifactType.NOTE,
              title: 'Lead Source',
              content: `Created automatically from Donor Readiness Audit submission.\nAudit date: ${auditDate.toISOString().slice(0, 10)}\nWebsite audited: ${dto.website}`,
            },
            // Link to the audit PDF in S3
            {
              type: ArtifactType.LINK,
              title: 'Donor Readiness Audit Report',
              url: dto.auditReportKey,
            },
          ],
        },
      },
    });

    return { duplicate: false, leadId: lead.id, organization: lead.organization };
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

  private _normalizeDomain(url: string): string {
    try {
      const full = url.startsWith('http') ? url : `https://${url}`;
      return new URL(full).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  }
}
