import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { NotificationAudienceService } from './notification-audience.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { CreateNotificationInput } from './notification.types';
import { PrismaService } from '../prisma/prisma.service';

function actorLabel(actor: UserContext): string {
  const fromParts = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
  return fromParts || actor.name?.trim() || actor.email;
}

type TrackerMeta = {
  entityType: string;
  entityId: string;
  route: string[];
  actionLabel: string;
};

@Injectable()
export class PipelineTrackerNotifyService {
  constructor(
    private readonly audience: NotificationAudienceService,
    private readonly delivery: NotificationDeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  async notifyInvoiceAdded(
    actor: UserContext,
    invoice: { id: string; displayNumber: string },
    pipelineName: string,
    laneName: string,
  ): Promise<void> {
    const title = `Invoice ${invoice.displayNumber} added to ${pipelineName}`;
    const body = `${actorLabel(actor)} added this invoice to ${pipelineName} (${laneName}).`;
    await this.send(
      actor,
      'pipeline_invoice_added',
      title,
      body,
      { entityType: 'invoice', entityId: invoice.id, route: ['invoices', invoice.id], actionLabel: 'Open invoice' },
    );
  }

  async notifyInvoiceMoved(
    actor: UserContext,
    invoice: { id: string; displayNumber: string },
    pipelineName: string,
    fromLane: string,
    toLane: string,
  ): Promise<void> {
    const title = `Invoice ${invoice.displayNumber} moved on ${pipelineName}`;
    const body = `${actorLabel(actor)} moved this invoice from ${fromLane} to ${toLane}.`;
    await this.send(
      actor,
      'pipeline_invoice_moved',
      title,
      body,
      { entityType: 'invoice', entityId: invoice.id, route: ['invoices', invoice.id], actionLabel: 'Open invoice' },
    );
  }

  async notifyClientAdded(
    actor: UserContext,
    client: { id: string; name: string },
    pipelineName: string,
    laneName: string,
  ): Promise<void> {
    const title = `${client.name} added to ${pipelineName}`;
    const body = `${actorLabel(actor)} added this client to ${pipelineName} (${laneName}).`;
    await this.send(
      actor,
      'pipeline_client_added',
      title,
      body,
      { entityType: 'client', entityId: client.id, route: ['clients', client.id], actionLabel: 'Open client' },
    );
  }

  async notifyClientMoved(
    actor: UserContext,
    client: { id: string; name: string },
    pipelineName: string,
    fromLane: string,
    toLane: string,
  ): Promise<void> {
    const title = `${client.name} moved on ${pipelineName}`;
    const body = `${actorLabel(actor)} moved this client from ${fromLane} to ${toLane}.`;
    await this.send(
      actor,
      'pipeline_client_moved',
      title,
      body,
      { entityType: 'client', entityId: client.id, route: ['clients', client.id], actionLabel: 'Open client' },
    );
  }

  async notifyProjectAdded(
    actor: UserContext,
    project: { id: string; name: string },
    pipelineName: string,
    laneName: string,
  ): Promise<void> {
    const title = `Project ${project.name} added to ${pipelineName}`;
    const body = `${actorLabel(actor)} added this project to ${pipelineName} (${laneName}).`;
    await this.send(
      actor,
      'pipeline_project_added',
      title,
      body,
      { entityType: 'project', entityId: project.id, route: ['projects', project.id, 'edit'], actionLabel: 'Open project' },
    );
  }

  async notifyProjectMoved(
    actor: UserContext,
    project: { id: string; name: string },
    pipelineName: string,
    fromLane: string,
    toLane: string,
  ): Promise<void> {
    const title = `Project ${project.name} moved on ${pipelineName}`;
    const body = `${actorLabel(actor)} moved this project from ${fromLane} to ${toLane}.`;
    await this.send(
      actor,
      'pipeline_project_moved',
      title,
      body,
      { entityType: 'project', entityId: project.id, route: ['projects', project.id, 'edit'], actionLabel: 'Open project' },
    );
  }

  async laneName(stageId: string | null | undefined): Promise<string> {
    if (!stageId) return 'a lane';
    const stage = await this.prisma.pipelineStage.findUnique({ where: { id: stageId }, select: { name: true } });
    return stage?.name ?? 'a lane';
  }

  async pipelineName(pipelineId: string | null | undefined): Promise<string> {
    if (!pipelineId) return 'a pipeline';
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId }, select: { name: true } });
    return pipeline?.name ?? 'Pipeline';
  }

  private async send(actor: UserContext, type: NotificationType, title: string, body: string, meta: TrackerMeta) {
    const userIds = await this.audience.userIdsWithAreaAccess('pipeline', 'any', { excludeUserId: actor.id });
    if (!userIds.length) return;
    const tenantId = actor.tenantId ?? undefined;
    const inputs: CreateNotificationInput[] = userIds.map((userId) => ({
      userId,
      ...(tenantId ? { tenantId } : {}),
      type,
      title,
      body,
      meta: {
        ...meta,
        actorUserId: actor.id,
        actorLabel: actorLabel(actor),
      },
    }));
    await this.delivery.deliverMany(inputs);
  }
}
