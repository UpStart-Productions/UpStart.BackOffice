import {
  Body, Controller, HttpCode, HttpStatus, Post, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactType, LeadSource, LeadStage } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { IngestLeadDto } from './dto/ingest-lead.dto';

@ApiTags('leads')
@Controller('leads')
export class LeadsIngestController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ingest a lead from an external service (e.g. Donor Readiness Audit Lambda).
   * Protected by x-api-key header via ServiceKeyGuard — no Cognito JWT required.
   * Deduplicates by normalized website domain.
   */
  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceKeyGuard)
  async ingest(@Body() dto: IngestLeadDto) {
    const domain = this._normalizeDomain(dto.website);

    const existing = await this.prisma.lead.findFirst({
      where: { website: { contains: domain } },
      select: { id: true, organization: true },
    });
    if (existing) {
      return { duplicate: true, leadId: existing.id, organization: existing.organization };
    }

    const primaryContact = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined;
    const auditDate      = dto.auditDate ? new Date(dto.auditDate) : new Date();
    const nextActionDate = new Date(auditDate);
    nextActionDate.setDate(nextActionDate.getDate() + 3);

    const lead = await this.prisma.lead.create({
      data: {
        organization:    dto.organization,
        website:         dto.website,
        email:           dto.email,
        primaryContact:  primaryContact ?? undefined,
        contactRole:     dto.role,
        source:          LeadSource.INBOUND,
        stage:           LeadStage.DISCOVERY,
        serviceInterests: dto.serviceInterests ?? [],
        nextAction:      'Follow up on donor readiness audit',
        nextActionDate,
        lastContactDate: auditDate,
        artifacts: {
          create: [
            {
              type:    ArtifactType.NOTE,
              title:   'Lead Source',
              content: `Created automatically from Donor Readiness Audit submission.\nAudit date: ${auditDate.toISOString().slice(0, 10)}\nWebsite audited: ${dto.website}`,
            },
            {
              type:  ArtifactType.LINK,
              title: 'Donor Readiness Audit Report',
              url:   `https://donor-readiness-audit-jobs.s3.amazonaws.com/${dto.auditReportKey}`,
            },
          ],
        },
      },
    });

    return { duplicate: false, leadId: lead.id, organization: lead.organization };
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
