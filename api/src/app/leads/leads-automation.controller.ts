import {
  Body, Controller, Get, NotFoundException, Param, Post, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactType, LeadStage } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationNoteDto } from './dto/automation-note.dto';

const OFFICE_BASE_URL = 'https://office.heyupstart.com';

/**
 * Narrow, read/append-only endpoints for the weekly pipeline-outreach
 * automation (and similar service-to-service jobs). Guarded by
 * ServiceKeyGuard (x-api-key) — deliberately separate from the
 * StaffAuthGuard-protected CRUD in LeadsController so automation keys
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
   * List NEW_LEAD pipeline entries, ordered so leads that have never been
   * picked (lastContactDate is null) come first, then by oldest
   * lastContactDate. The caller should pick randomly from the leading
   * group of "least recently picked" entries.
   */
  @Get('new-leads')
  async listNewLeads() {
    const leads = await this.prisma.lead.findMany({
      where: { stage: LeadStage.NEW_LEAD },
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
      officeUrl: `${OFFICE_BASE_URL}/pipeline/${lead.id}`,
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

    // Quill-compatible delta: a single text insert preserves line breaks
    // and renders as plain paragraphs in the admin NOTE editor.
    const delta = JSON.stringify({ ops: [{ insert: `${dto.content}\n` }] });

    const [artifact, updatedLead] = await this.prisma.$transaction([
      this.prisma.artifact.create({
        data: {
          leadId: id,
          type: ArtifactType.NOTE,
          title,
          content: delta,
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
      officeUrl: `${OFFICE_BASE_URL}/pipeline/${updatedLead.id}`,
      lastContactDate: updatedLead.lastContactDate,
      artifactId: artifact.id,
    };
  }
}
