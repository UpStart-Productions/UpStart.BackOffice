import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { findLane, laneFields, type Lane, type PipelineDb } from '../pipelines/pipeline-lanes.util';

type CopyDb = PipelineDb &
  Pick<Prisma.TransactionClient, 'lead' | 'leadContact' | 'pipeline' | 'pipelineStage'>;

const leadScalars = {
  organization: true,
  primaryContact: true,
  contactRole: true,
  email: true,
  phone: true,
  website: true,
  source: true,
  warmConnection: true,
  warmConnectionContactId: true,
  category: true,
  serviceInterests: true,
  nextAction: true,
  nextActionDate: true,
  lastContactDate: true,
  clientId: true,
  invoiceId: true,
  trackedClientId: true,
  projectId: true,
  primaryContactId: true,
} as const;

/** Duplicate a pipeline card only — same account link and people, no new Client row. */
export async function copyLeadCard(
  db: CopyDb,
  sourceId: string,
  pipelineId: string,
  stageId: string,
) {
  const source = await db.lead.findUnique({ where: { id: sourceId }, select: leadScalars });
  if (!source) throw new NotFoundException('Lead not found');

  const lane = await findLane(db, stageId);
  if (!lane || lane.pipelineId !== pipelineId) {
    throw new BadRequestException('Lane does not belong to that pipeline.');
  }
  await assertPipelineExists(db, pipelineId);
  await assertTrackerSlotFree(db, source, pipelineId);

  const created = await db.lead.create({
    data: {
      ...laneFields(lane as Lane),
      organization: source.organization,
      primaryContact: source.primaryContact,
      contactRole: source.contactRole,
      email: source.email,
      phone: source.phone,
      website: source.website,
      source: source.source,
      warmConnection: source.warmConnection,
      warmConnectionContactId: source.warmConnectionContactId,
      category: source.category,
      serviceInterests: source.serviceInterests,
      nextAction: source.nextAction,
      nextActionDate: source.nextActionDate,
      lastContactDate: source.lastContactDate,
      clientId: source.clientId,
      invoiceId: source.invoiceId,
      trackedClientId: source.trackedClientId,
      projectId: source.projectId,
      primaryContactId: source.primaryContactId,
    },
  });

  const roster = await db.leadContact.findMany({
    where: { leadId: sourceId },
    select: { contactId: true },
  });
  if (roster.length) {
    await db.leadContact.createMany({
      data: roster.map((r) => ({ leadId: created.id, contactId: r.contactId })),
    });
  }

  return created.id;
}

async function assertPipelineExists(db: CopyDb, pipelineId: string) {
  const pipeline = await db.pipeline.findFirst({ where: { id: pipelineId }, select: { id: true, name: true } });
  if (!pipeline) throw new NotFoundException('Pipeline not found');
  return pipeline;
}

async function assertTrackerSlotFree(
  db: CopyDb,
  source: {
    invoiceId: string | null;
    trackedClientId: string | null;
    projectId: string | null;
  },
  pipelineId: string,
) {
  const pipeline = await db.pipeline.findFirst({ where: { id: pipelineId }, select: { name: true } });
  const pipelineName = pipeline?.name ?? 'that pipeline';
  if (source.invoiceId) {
    const existing = await db.lead.findFirst({
      where: { invoiceId: source.invoiceId, pipelineId, archivedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`This invoice is already on ${pipelineName}.`);
  }
  if (source.trackedClientId) {
    const existing = await db.lead.findFirst({
      where: { trackedClientId: source.trackedClientId, pipelineId, archivedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`This client is already on ${pipelineName}.`);
  }
  if (source.projectId) {
    const existing = await db.lead.findFirst({
      where: { projectId: source.projectId, pipelineId, archivedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`This project is already on ${pipelineName}.`);
  }
}
