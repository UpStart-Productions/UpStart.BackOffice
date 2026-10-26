/**
 * Pipelines and lanes against a real Postgres engine (pglite), through the real tenant extension.
 * Skipped unless pglite is installed and TENANT_TEST_SCHEMA_SQL points at the schema:
 *   npx prisma migrate diff --from-empty --to-schema apps/api/prisma/schema.prisma --script > /tmp/schema.sql
 *   TENANT_TEST_SCHEMA_SQL=/tmp/schema.sql npx vitest run --root api pipelines.db
 */
import { readFileSync } from 'node:fs';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantExtension } from '../tenancy/prisma-tenant.extension';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { firstLane, laneFields, laneForLegacy } from './pipeline-lanes.util';
import { PipelinesService } from './pipelines.service';

const SQL = process.env.TENANT_TEST_SCHEMA_SQL;
const PORT = 54333;

let pglite: { PGlite: any } | null = null;
let socket: { PGLiteSocketServer: any } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pglite = require('@electric-sql/pglite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  socket = require('@electric-sql/pglite-socket');
} catch {
  /* optional */
}

describe.skipIf(!SQL || !pglite || !socket)('pipelines (real Postgres)', () => {
  let server: any;
  let raw: PrismaClient;
  let prisma: PrismaClient;
  let svc: PipelinesService;
  const T = 'tenant-p';
  const U = 'tenant-q';
  const inT = <R>(fn: () => R) => runWithTenant(T, fn);

  beforeAll(async () => {
    const db = new pglite!.PGlite();
    await db.exec(readFileSync(SQL as string, 'utf8'));
    server = new socket!.PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
    await server.start();
    raw = new PrismaClient({
      adapter: new PrismaPg({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 1 }),
    });
    prisma = raw.$extends(tenantExtension) as never;
    svc = new PipelinesService(prisma as never);
    await runUnscoped(async () => {
      await raw.tenant.create({ data: { id: T, name: 'P', slug: 'p' } });
      await raw.tenant.create({ data: { id: U, name: 'Q', slug: 'q' } });
    });
  }, 60_000);

  afterAll(async () => {
    await raw?.$disconnect();
    await server?.stop();
  });

  it('gives a tenant with no pipeline the four starter lanes, once', async () => {
    const first = await inT(() => svc.list());
    const again = await inT(() => svc.list());
    expect(first).toHaveLength(1);
    expect(first[0].stages.map((s) => s.name)).toEqual(['New Lead', 'Discovery', 'Proposal Sent', 'On Hold']);
    expect(again).toHaveLength(1);
    // Another tenant sees none of it.
    expect(await runWithTenant(U, () => prisma.pipelineStage.count())).toBe(0);
  });

  it('adds, renames and reorders lanes', async () => {
    const [p] = await inT(() => svc.list());
    const added = await inT(() => svc.addLane(p.id, { name: 'Engaged', color: 'info' }));
    expect(added.sortOrder).toBe(4);
    await inT(() => svc.updateLane(added.id, { name: 'Talking' }));
    const ids = [added.id, ...p.stages.map((s) => s.id)];
    await inT(() => svc.reorderLanes(p.id, ids));
    const [after] = await inT(() => svc.list());
    expect(after.stages.map((s) => s.name)).toEqual(['Talking', 'New Lead', 'Discovery', 'Proposal Sent', 'On Hold']);
    await expect(inT(() => svc.reorderLanes(p.id, ids.slice(1)))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves cards when a lane with cards is removed, and refuses without a target', async () => {
    const [p] = await inT(() => svc.list());
    const [talking, newLead] = p.stages;
    const lead = await inT(() =>
      prisma.lead.create({ data: { organization: 'Fam', pipelineId: p.id, stageId: talking.id } }),
    );
    await expect(inT(() => svc.deleteLane(talking.id))).rejects.toBeInstanceOf(ConflictException);
    const res = await inT(() => svc.deleteLane(talking.id, newLead.id));
    expect(res).toEqual({ deleted: true, moved: 1 });
    const moved = await inT(() => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(moved.stageId).toBe(newLead.id);
    expect(moved.stage).toBe('NEW_LEAD'); // legacy mirror follows a lane that has one
  });

  it("won't remove a pipeline's last lane, a pipeline with cards, or the last pipeline", async () => {
    const extra = await inT(() => svc.createPipeline('Partners'));
    const lanes = await inT(() => prisma.pipelineStage.findMany({ where: { pipelineId: extra.id }, orderBy: { sortOrder: 'asc' } }));
    for (const l of lanes.slice(1)) await inT(() => svc.deleteLane(l.id));
    await expect(inT(() => svc.deleteLane(lanes[0].id))).rejects.toBeInstanceOf(BadRequestException);

    await inT(() => prisma.lead.create({ data: { organization: 'Archived one', pipelineId: extra.id, stageId: lanes[0].id, archivedAt: new Date() } }));
    await expect(inT(() => svc.deletePipeline(extra.id))).rejects.toBeInstanceOf(ConflictException);
    await inT(() => prisma.lead.deleteMany({ where: { pipelineId: extra.id } }));
    expect(await inT(() => svc.deletePipeline(extra.id))).toEqual({ deleted: true });

    const [only] = await inT(() => svc.list());
    await expect(inT(() => svc.deletePipeline(only.id))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('finds lanes for new cards: first lane, or the lane from an old stage', async () => {
    const [p] = await inT(() => svc.list());
    const first = await inT(() => firstLane(prisma));
    expect(first).toMatchObject({ pipelineId: p.id, stageId: p.stages[0].id });
    const disc = await inT(() => laneForLegacy(prisma, 'DISCOVERY'));
    expect(disc.legacyKey).toBe('DISCOVERY');
    // When no lane carries that legacy key, fall back to the first lane.
    await inT(() => prisma.pipelineStage.updateMany({ where: { legacyKey: 'ON_HOLD' }, data: { legacyKey: null } }));
    const gone = await inT(() => laneForLegacy(prisma, 'ON_HOLD'));
    expect(gone.stageId).toBe(p.stages[0].id);
    expect(laneFields({ pipelineId: 'p', stageId: 's', legacyKey: null })).toEqual({ pipelineId: 'p', stageId: 's' });
  });
});
