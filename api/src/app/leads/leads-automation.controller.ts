import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactType } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationNoteDto } from './dto/automation-note.dto';
import { AutomationMoveDto } from './dto/automation-move.dto';
import { plainTextToQuillHtml } from './lead-note.util';
import { findByLaneName } from '../pipelines/lane-name.util';
import { createLeadActivityNote } from './lead-activity.util';
import { laneFields } from '../pipelines/pipeline-lanes.util';
import { adminAppBaseUrl } from '../notifications/notification-delivery.service';

const adminBaseUrl = adminAppBaseUrl;

/**
 * Narrow, read/append-only endpoints for the weekly pipeline-outreach
 * automation (and similar service-to-service jobs). Guarded by
 * ServiceKeyGuard (x-api-key) — deliberately separate from the
 * role-guarded CRUD in LeadsController so automation keys
 * can never edit/delete arbitrary lead fields or other resources.
 *
 * Registered BEFORE LeadsController in LeadsModule so that
 * /leads/automation/* matches before LeadsController's /leads/:id.
 */
@ApiTags('leads')
@UseGuards(ServiceKeyGuard)
@Controller('leads/automation')
export class LeadsAutomationController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List new leads (cards in the first lane of their pipeline), ordered so leads that have never been
   * picked (lastContactDate is null) come first, then by oldest
   * lastContactDate. The caller should pick randomly from the leading
   * group of "least recently picked" entries.
   */
  @Get('new-leads')
  async listNewLeads() {
    const pipelines = await this.prisma.pipeline.findMany({
      select: { stages: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } } },
    });
    const firstLaneIds = pipelines.flatMap((p) => p.stages.map((s) => s.id));
    const leads = await this.prisma.lead.findMany({
      where: { stageId: { in: firstLaneIds }, archivedAt: null },
      orderBy: [
        { lastContactDate: { sort: 'asc', nulls: 'first' } },
        { organization: 'asc' },
      ],
      select: {
        id: true,
        organization: true,
        primaryContact: true,
        contactRole: true,
        email: true,
        phone: true,
        website: true,
        category: true,
        serviceInterests: true,
        nextAction: true,
        lastContactDate: true,
      },
    });

    return leads.map((lead) => ({
      ...lead,
      officeUrl: `${adminBaseUrl()}/pipeline/${lead.id}`,
    }));
  }

  /**
   * Attach a research note (as a NOTE artifact) to a lead and stamp
   * lastContactDate to mark it as "picked" for the dedup logic above.
   */
  @Post(':id/research-note')
  async addResearchNote(@Param('id') id: string, @Body() dto: AutomationNoteDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const pickedDate = dto.pickedDate ? new Date(dto.pickedDate) : new Date();
    const title = dto.title ?? `Research Note - ${pickedDate.toISOString().slice(0, 10)}`;

    const html = plainTextToQuillHtml(dto.content);

    const [artifact, updatedLead] = await this.prisma.$transaction([
      this.prisma.artifact.create({
        data: {
          leadId: id,
          type: ArtifactType.NOTE,
          title,
          content: html,
        },
      }),
      this.prisma.lead.update({
        where: { id },
        data: { lastContactDate: pickedDate },
      }),
    ]);

    return {
      leadId: updatedLead.id,
      organization: updatedLead.organization,
      officeUrl: `${adminBaseUrl()}/pipeline/${updatedLead.id}`,
      lastContactDate: updatedLead.lastContactDate,
      artifactId: artifact.id,
    };
  }

  /**
   * Move a card to another lane of its own pipeline, by lane name.
   * Optionally attaches a plain-text note with the move.
   */
  @Patch(':id/stage')
  async moveToStage(@Param('id') id: string, @Body() dto: AutomationMoveDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!lead.pipelineId) throw new BadRequestException('This card is not on a pipeline.');

    const stages = await this.prisma.pipelineStage.findMany({
      where: { pipelineId: lead.pipelineId },
      select: { id: true, pipelineId: true, legacyKey: true, name: true },
    });
    const stage = findByLaneName(stages, dto.stageName);
    if (!stage) throw new BadRequestException(`No lane named "${dto.stageName}" on this card's pipeline.`);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.note && dto.noteAs === 'activity') {
        await createLeadActivityNote(tx, lead, dto.noteTitle ?? `Moved to ${stage.name}`, dto.note);
      } else if (dto.note) {
        await tx.artifact.create({
          data: {
            leadId: id,
            type: ArtifactType.NOTE,
            title: dto.noteTitle ?? `Moved to ${stage.name}`,
            content: plainTextToQuillHtml(dto.note),
          },
        });
      }
      return tx.lead.update({
        where: { id },
        data: {
          ...laneFields({ pipelineId: stage.pipelineId, stageId: stage.id, legacyKey: stage.legacyKey }),
          ...(dto.nextAction !== undefined && {
            nextAction: dto.nextAction.trim() || null,
            nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : new Date(),
          }),
        },
      });
    });

    return {
      leadId: updated.id,
      stageId: stage.id,
      stageName: stage.name,
      officeUrl: `${adminBaseUrl()}/pipeline/${updated.id}`,
    };
  }
}
