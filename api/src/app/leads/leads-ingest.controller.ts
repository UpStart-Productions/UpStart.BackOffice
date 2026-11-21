import {
  BadRequestException, Body, Controller, HttpCode, HttpStatus, NotFoundException, Post, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactType, LeadStage } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { IngestLeadDto } from './dto/ingest-lead.dto';
import { firstLane, Lane, laneFields, laneForLegacy, PipelineDb } from '../pipelines/pipeline-lanes.util';
import { plainTextToQuillHtml } from './lead-note.util';
import { findByLaneName } from '../pipelines/lane-name.util';
import { createLeadActivityNote } from './lead-activity.util';
import { splitPersonName } from './lead-links.util';
import { captureToPipeline } from '../capture-points/capture.util';
import { dateOnlyOf, dateOnlyPlusDays, tenantTimeZone } from '../common/date-only.util';

/** The lane named in the payload, or the default lead lane when no pipeline is named. */
async function ingestLane(db: PipelineDb, dto: IngestLeadDto): Promise<Lane> {
  if (!dto.pipelineName) return laneForLegacy(db, LeadStage.DISCOVERY);
  const pipelines = await db.pipeline.findMany({ select: { id: true, name: true } });
  const pipeline = findByLaneName(pipelines, dto.pipelineName);
  if (!pipeline) throw new BadRequestException(`No pipeline named "${dto.pipelineName}".`);
  if (!dto.stageName) return firstLane(db, pipeline.id);
  const stages = await db.pipelineStage.findMany({
    where: { pipelineId: pipeline.id },
    select: { id: true, name: true, pipelineId: true, legacyKey: true },
  });
  const stage = findByLaneName(stages, dto.stageName);
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
    const primaryContact = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || dto.name?.trim() || undefined;
    if (dto.capturePointId) return this.capture(dto, primaryContact);
    const organization = dto.organization?.trim() || primaryContact || dto.email;
    if (!organization) throw new BadRequestException('Send organization, a name or an email.');
    // Date-only fields store the local day (like dates typed in the app), not a raw timestamp.
    // A plain "YYYY-MM-DD" is already a day; a full timestamp becomes its day in the tenant's time zone.
    const auditDate      = dto.auditDate && /^\d{4}-\d{2}-\d{2}$/.test(dto.auditDate.trim())
      ? new Date(`${dto.auditDate.trim()}T00:00:00.000Z`)
      : dateOnlyOf(dto.auditDate ? new Date(dto.auditDate) : new Date(), await tenantTimeZone(this.prisma));
    const nextActionDate = dto.nextActionDate ? new Date(dto.nextActionDate) : dateOnlyPlusDays(auditDate, 3, 'UTC');

    const lead = await this.prisma.$transaction(async (tx) => {
      const lane = await ingestLane(tx, dto);
      const created = await tx.lead.create({
        data: {
          ...laneFields(lane),
          organization,
          phone:           dto.phone,
          website:         dto.website,
          email:           dto.email,
          primaryContact:  primaryContact ?? undefined,
          contactFirstName: dto.firstName?.trim() || splitPersonName(primaryContact, null)?.firstName || undefined,
          contactLastName:  dto.firstName?.trim() ? dto.lastName?.trim() || undefined : splitPersonName(primaryContact, null)?.lastName ?? undefined,
          contactRole:     dto.role,
          source:          'Inbound',
          serviceInterests: dto.serviceInterests ?? [],
          nextAction:      dto.nextAction ?? 'Follow up on donor readiness audit',
          nextActionDate,
          lastContactDate: auditDate,
          artifacts: {
            create: [
              ...(dto.note
                ? dto.noteAs === 'activity'
                  ? []
                  : [{
                      type:    ArtifactType.NOTE,
                      title:   dto.noteTitle ?? 'Details',
                      content: plainTextToQuillHtml(dto.note),
                    }]
                : [{
                    type:    ArtifactType.NOTE,
                    title:   'Lead Source',
                    content: `Created automatically from Donor Readiness Audit submission.\nAudit date: ${auditDate.toISOString().slice(0, 10)}\nWebsite audited: ${dto.website ?? ''}`,
                  }]),
              ...(dto.auditReportUrl ? [{
                type:  ArtifactType.LINK,
                title: 'Donor Readiness Audit Report',
                url:   dto.auditReportUrl,
              }] : []),
            ],
          },
        },
      });
      if (dto.note && dto.noteAs === 'activity') {
        await createLeadActivityNote(tx, created, dto.noteTitle ?? 'Details', dto.note);
      }
      return created;
    });

    return { duplicate: false, leadId: lead.id, organization: lead.organization };
  }

  /** Through a capture point: its lane, and someone already on that pipeline gets the touch logged, not a new card. */
  private async capture(dto: IngestLeadDto, name: string | undefined) {
    const cp = await this.prisma.capturePoint.findUnique({
      where: { id: dto.capturePointId },
      select: { id: true, name: true, stageId: true, isActive: true },
    });
    if (!cp) throw new NotFoundException('No capture point with that id.');
    if (!cp.isActive) return { skipped: true, reason: 'Capture point is turned off' };
    if (!name && !dto.email && !dto.organization) throw new BadRequestException('Send a name, an email or an organization.');
    const result = await this.prisma.$transaction((tx) =>
      captureToPipeline(tx, cp, {
        name,
        email: dto.email,
        phone: dto.phone,
        organization: dto.organization,
        website: dto.website,
        message: dto.note,
        subject: dto.noteTitle,
      }),
    );
    return { duplicate: result.matched, leadId: result.leadId };
  }
}
