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
export class InvoicePipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notify: PipelineTrackerNotifyService,
  ) {}

  async listForInvoice(invoiceId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { invoiceId, archivedAt: null },
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

  async addToPipeline(actor: UserContext, invoiceId: string, pipelineId: string) {
    if (!allows(actor, 'pipeline', 'create')) {
      throw new ForbiddenException('Your role cannot add pipeline cards.');
    }

    const level = this.access.level(actor, 'invoices');
    if (level === null) throw new NotFoundException('Invoice not found');
    const clientIds = await this.access.clientIdFilter(actor);
    const own = level === 'own' ? await this.access.ownInvoiceWhere(actor) : {};
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        AND: [own, clientIds ? { OR: [{ clientId: clientIds }, { clientId: null }] } : {}],
      },
      select: {
        id: true,
        displayNumber: true,
        clientId: true,
        billToName: true,
        client: { select: { name: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const pipeline = await this.prisma.pipeline.findFirst({ where: { id: pipelineId }, select: { id: true, name: true } });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const existing = await this.prisma.lead.findFirst({
      where: { invoiceId, pipelineId, archivedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`This invoice is already on ${pipeline.name}.`);
    }

    const lane = await firstLane(this.prisma, pipelineId);
    const orgName = [invoice.client?.name ?? invoice.billToName ?? 'Invoice', invoice.displayNumber]
      .filter(Boolean)
      .join(' · ');

    const lead = await this.prisma.lead.create({
      data: {
        ...laneFields(lane),
        organization: orgName,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
      },
      select: { id: true, pipelineId: true, stageId: true },
    });

    const laneName = await this.notify.laneName(lead.stageId);
    await this.notify.notifyInvoiceAdded(actor, invoice, pipeline.name, laneName);

    return {
      id: lead.id,
      pipelineId: lead.pipelineId,
      pipelineName: pipeline.name,
      stageId: lead.stageId,
      stageName: laneName,
    };
  }
}
