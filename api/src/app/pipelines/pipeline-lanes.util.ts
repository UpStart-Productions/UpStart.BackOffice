import type { LeadStage, Prisma } from '@prisma/client';

/** What the lane helpers need from a Prisma client or transaction. */
export type PipelineDb = Pick<Prisma.TransactionClient, 'pipeline' | 'pipelineStage'>;

export type Lane = { pipelineId: string; stageId: string; legacyKey: LeadStage | null };

/** Lanes a brand-new tenant starts with. Names only; rename, reorder or delete them on the board. */
export const STARTER_LANES: ReadonlyArray<{ name: string; color: string; legacyKey: LeadStage }> = [
  { name: 'New Lead', color: 'success', legacyKey: 'NEW_LEAD' },
  { name: 'Discovery', color: 'info', legacyKey: 'DISCOVERY' },
  { name: 'Proposal Sent', color: 'warn', legacyKey: 'PROPOSAL_SENT' },
  { name: 'On Hold', color: 'secondary', legacyKey: 'ON_HOLD' },
];

const laneSelect = { id: true, pipelineId: true, legacyKey: true } as const;
const toLane = (s: { id: string; pipelineId: string; legacyKey: LeadStage | null }): Lane => ({
  pipelineId: s.pipelineId,
  stageId: s.id,
  legacyKey: s.legacyKey,
});

/** A new tenant's first pipeline, with the starter lanes. Called once, at tenant setup. */
export async function createStarterPipeline(db: PipelineDb): Promise<void> {
  await db.pipeline.create({
    data: {
      name: 'Pipeline',
      sortOrder: 0,
      stages: { create: STARTER_LANES.map((l, i) => ({ ...l, sortOrder: i })) },
    },
  });
}

/** The first lane of a pipeline (default: the tenant's first pipeline). */
export async function firstLane(db: PipelineDb, pipelineId?: string | null): Promise<Lane> {
  const stage = await db.pipelineStage.findFirst({
    where: pipelineId ? { pipelineId } : {},
    orderBy: pipelineId ? [{ sortOrder: 'asc' }] : [{ pipeline: { sortOrder: 'asc' } }, { pipeline: { createdAt: 'asc' } }, { sortOrder: 'asc' }],
    select: laneSelect,
  });
  if (!stage) throw new Error(pipelineId ? `Pipeline ${pipelineId} has no lanes` : 'This tenant has no pipeline lanes');
  return toLane(stage);
}

/** The lane that came from an old fixed stage (first pipeline first), else the default first lane. */
export async function laneForLegacy(db: PipelineDb, key: LeadStage): Promise<Lane> {
  const stage = await db.pipelineStage.findFirst({
    where: { legacyKey: key },
    orderBy: [{ pipeline: { sortOrder: 'asc' } }, { pipeline: { createdAt: 'asc' } }],
    select: laneSelect,
  });
  return stage ? toLane(stage) : firstLane(db);
}

/** A lane by id, or null if it isn't one of this tenant's lanes. */
export async function findLane(db: PipelineDb, stageId: string): Promise<Lane | null> {
  const stage = await db.pipelineStage.findUnique({ where: { id: stageId }, select: laneSelect });
  return stage ? toLane(stage) : null;
}

/** Lead columns for a lane. Keeps the legacy `stage` mirror in step when the lane has one. */
export function laneFields(lane: Lane): { pipelineId: string; stageId: string; stage?: LeadStage } {
  return { pipelineId: lane.pipelineId, stageId: lane.stageId, ...(lane.legacyKey ? { stage: lane.legacyKey } : {}) };
}
