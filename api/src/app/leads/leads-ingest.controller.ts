import {
  BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactType, LeadSource, LeadStage } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { IngestLeadDto } from './dto/ingest-lead.dto';
import { firstLane, Lane, laneFields, laneForLegacy, PipelineDb } from '../pipelines/pipeline-lanes.util';
import { plainTextToQuillHtml } from './lead-note.util';

/** The lane named in the payload, or the default lead lane when no pipeline is named. */
async function ingestLane(db: PipelineDb, dto: IngestLeadDto): Promise<Lane> {
  if (!dto.pipelineName) return laneForLegacy(db, LeadStage.DISCOVERY);
  const pipeline = await db.pipeline.findFirst({
    where: { name: { equals: dto.pipelineName.trim(), mode: 'insensitive' } },
    select: { id: true },
  });
  if (!pipeline) throw new BadRequestException(`No pipeline named "${dto.pipelineName}".`);
  if (!dto.stageName) return firstLane(db, pipeline.id);
  const stage = await db.pipelineStage.findFirst({
    where: { pipelineId: pipeline.id, name: { equals: dto.stageName.trim(), mode: 'insensitive' } },
    select: { id: true, pipelineId: true, legacyKey: true },
  });
  if (!stage) throw new BadRequestException(`No lane named "${dto.stageName}" on pipeline "${dto.pipelineName}".`);
  return { pipelineId: stage.pipelineId, stageId: stage.id, legacyKey: stage.legacyKey };
}

@ApiTags('leads')
@Controller('leads')
export class LeadsIngestController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ingest a lead from an external service (e.g. Donor Readiness Audit Lambda, Mirador checkout).
   * pipelineName/stageName pick the lane; note replaces the audit note.
   * Protected by x-api-key header via ServiceKeyGuard — no Cognito JWT required.
   * Every call makes a new lead; nothing is matched to existing leads.
   */
  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceKeyGuard)
  async ingest(@Body() dto: IngestLeadDto) {
    const primaryContact = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined;
    const auditDate      = dto.auditDate ? new Date(dto.auditDate) : new Date();
    const nextActionDate = new Date(auditDate);
    nextActionDate.setDate(nextActionDate.getDate() + 3);

    const lead = await this.prisma.$transaction(async (tx) => {
      const lane = await ingestLane(tx, dto);
      const created = await tx.lead.create({
        data: {
          ...laneFields(lane),
          organization:    dto.organization,
          website:         dto.website,
          email:           dto.email,
          primaryContact:  primaryContact ?? undefined,
          contactRole:     dto.role,
          source:          LeadSource.INBOUND,
          serviceInterests: dto.serviceInterests ?? [],
          nextAction:      dto.nextAction ?? 'Follow up on donor readiness audit',
          nextActionDate,
          lastContactDate: auditDate,
          artifacts: {
            create: [
              dto.note
                ? {
                    type:    ArtifactType.NOTE,
                    title:   dto.noteTitle ?? 'Details',
                    content: plainTextToQuillHtml(dto.note),
                  }
                : {
                    type:    ArtifactType.NOTE,
                    title:   'Lead Source',
                    content: `Created automatically from Donor Readiness Audit submission.\nAudit date: ${auditDate.toISOString().slice(0, 10)}\nWebsite audited: ${dto.website ?? ''}`,
                  },
              ...(dto.auditReportUrl ? [{
                type:  ArtifactType.LINK,
                title: 'Donor Readiness Audit Report',
                url:   dto.auditReportUrl,
              }] : []),
            ],
          },
        },
      });
      return created;
    });

    return { duplicate: false, leadId: lead.id, organization: lead.organization };
  }
}
