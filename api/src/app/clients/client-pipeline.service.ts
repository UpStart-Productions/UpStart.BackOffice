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
export class ClientPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notify: PipelineTrackerNotifyService,
  ) {}

  async listForClient(clientId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { trackedClientId: clientId, archivedAt: null },
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

  async addToPipeline(actor: UserContext, clientId: string, pipelineId: string) {
    if (!allows(actor, 'pipeline', 'create')) {
      throw new ForbiddenException('Your role cannot add pipeline cards.');
    }

    const level = this.access.level(actor, 'clients');
    if (level === null) throw new NotFoundException('Client not found');
    const reach = await this.access.clientIds(actor);
    if (reach !== null && !reach.includes(clientId)) throw new NotFoundException('Client not found');
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId },
      select: { id: true, name: true },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const existing = await this.prisma.lead.findFirst({
      where: { trackedClientId: clientId, pipelineId, archivedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`This client is already on ${pipeline.name}.`);
    }

    const lane = await firstLane(this.prisma, pipelineId);
    const lead = await this.prisma.lead.create({
      data: {
        ...laneFields(lane),
        organization: client.name,
        trackedClientId: client.id,
        clientId: client.id,
      },
      select: { id: true, pipelineId: true, stageId: true },
    });

    const laneName = await this.notify.laneName(lead.stageId);
    await this.notify.notifyClientAdded(actor, client, pipeline.name, laneName);

    return {
      id: lead.id,
      pipelineId: lead.pipelineId,
      pipelineName: pipeline.name,
      stageId: lead.stageId,
      stageName: laneName,
    };
  }
}
