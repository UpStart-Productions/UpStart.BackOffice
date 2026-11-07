import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allows } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { AccessService } from '../access/access.service';
import { firstLane, laneFields } from '../pipelines/pipeline-lanes.util';
import { PipelineTrackerNotifyService } from '../notifications/pipeline-tracker-notify.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notify: PipelineTrackerNotifyService,
  ) {}

  async listForProject(projectId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { projectId, archivedAt: null },
      select: {
        id: true,
        pipelineId: true,
        stageId: true,
        pipeline: { select: { id: true, name: true } },
        pipelineStage: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return leads.map((l) => ({
      id: l.id,
      pipelineId: l.pipelineId,
      pipelineName: l.pipeline?.name ?? '',
      stageId: l.stageId,
      stageName: l.pipelineStage?.name ?? '',
    }));
  }

  async addToPipeline(actor: UserContext, projectId: string, pipelineId: string) {
    if (!allows(actor, 'pipeline', 'create')) {
      throw new ForbiddenException('Your role cannot add pipeline cards.');
    }

    const level = this.access.level(actor, 'projects');
    if (level === null) throw new NotFoundException('Project not found');
    const scope = await this.access.projectFilter(actor);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...(scope ?? {}) },
      select: {
        id: true,
        name: true,
        clientId: true,
        client: { select: { name: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId },
      select: { id: true, name: true },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const existing = await this.prisma.lead.findFirst({
      where: { projectId, pipelineId, archivedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`This project is already on ${pipeline.name}.`);
    }

    const lane = await firstLane(this.prisma, pipelineId);
    const orgName = project.client?.name ? `${project.client.name} · ${project.name}` : project.name;

    const lead = await this.prisma.lead.create({
      data: {
        ...laneFields(lane),
        organization: orgName,
        projectId: project.id,
        clientId: project.clientId,
      },
      select: { id: true, pipelineId: true, stageId: true },
    });

    const laneName = await this.notify.laneName(lead.stageId);
    await this.notify.notifyProjectAdded(actor, project, pipeline.name, laneName);

    return {
      id: lead.id,
      pipelineId: lead.pipelineId,
      pipelineName: pipeline.name,
      stageId: lead.stageId,
      stageName: laneName,
    };
  }
}
