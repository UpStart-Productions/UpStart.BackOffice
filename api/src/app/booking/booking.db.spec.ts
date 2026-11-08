/**
 * A booking updates the guest's open card on the booking type's pipeline instead of adding a second card.
 * Real Postgres engine (pglite), through the real tenant extension. Skipped unless pglite is installed and
 * TENANT_TEST_SCHEMA_SQL points at the schema:
 *   npx prisma migrate diff --from-empty --to-schema apps/api/prisma/schema.prisma --script > /tmp/schema.sql
 *   TENANT_TEST_SCHEMA_SQL=/tmp/schema.sql npx vitest run --root api booking.db
 */
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { BookingType, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tenantExtension } from '../tenancy/prisma-tenant.extension';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { createStarterPipeline } from '../pipelines/pipeline-lanes.util';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const SQL = process.env.TENANT_TEST_SCHEMA_SQL;
const PORT = 54334;

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

describe.skipIf(!SQL || !pglite || !socket)('booking → pipeline card (real Postgres)', () => {
  let server: any;
  let raw: PrismaClient;
  let prisma: PrismaClient;
  let svc: BookingService;
  const T = 'tenant-b';
  const U = 'tenant-c';
  const inT = <R>(fn: () => R) => runWithTenant(T, fn);

  // The starter pipeline's lanes in tenant T, plus a second pipeline.
  let sales: { id: string; lanes: string[] };
  let other: { id: string; lane: string };

  const startAt = new Date('2026-11-20T17:00:00.000Z');

  function bookingType(): BookingType {
    return {
      name: 'Demo',
      publicPageUrl: 'https://example.test/book',
      pipelineNoteTitle: null,
      leadStageId: sales.lanes[1],
      leadStage: 'DISCOVERY',
      leadSource: 'INBOUND',
    } as BookingType;
  }

  function dto(guestEmail: string, extra: Partial<CreateBookingDto> = {}): CreateBookingDto {
    return { startAt: startAt.toISOString(), guestName: 'Pat Guest', guestEmail, ...extra } as CreateBookingDto;
  }

  /** What a booking does to the pipeline: the card it created or updated. */
  function book(guestEmail: string, extra: Partial<CreateBookingDto> = {}) {
    return inT(() =>
      prisma.$transaction((tx) =>
        (svc as unknown as { createLead: (...a: unknown[]) => Promise<{ id: string }> }).createLead(
          tx,
          dto(guestEmail, extra),
          startAt,
          bookingType(),
        ),
      ),
    );
  }

  const card = (id: string) =>
    inT(() => prisma.lead.findUniqueOrThrow({ where: { id }, include: { artifacts: { select: { title: true } } } }));
  const cardCount = () => inT(() => prisma.lead.count());

  beforeAll(async () => {
    const db = new pglite!.PGlite();
    await db.exec(readFileSync(SQL as string, 'utf8'));
    server = new socket!.PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
    await server.start();
    raw = new PrismaClient({
      adapter: new PrismaPg({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 1 }),
    });
    prisma = raw.$extends(tenantExtension) as never;
    svc = new BookingService(prisma as never, {} as never, {} as never);
    await runUnscoped(async () => {
      await raw.tenant.create({ data: { id: T, name: 'B', slug: 'b' } });
      await raw.tenant.create({ data: { id: U, name: 'C', slug: 'c' } });
    });
    await inT(() => createStarterPipeline(prisma as never));
    await runWithTenant(U, () => createStarterPipeline(prisma as never));
    const p = await inT(() =>
      prisma.pipeline.findFirstOrThrow({ include: { stages: { orderBy: { sortOrder: 'asc' } } } }),
    );
    sales = { id: p.id, lanes: p.stages.map((s) => s.id) };
    const o = await inT(() =>
      prisma.pipeline.create({ data: { name: 'Partners', sortOrder: 1, stages: { create: [{ name: 'Intro' }] } }, include: { stages: true } }),
    );
    other = { id: o.id, lane: o.stages[0].id };
  }, 60_000);

  afterAll(async () => {
    await raw?.$disconnect();
    await server?.stop();
  });

  beforeEach(async () => {
    await runUnscoped(async () => {
      await raw.artifact.deleteMany({});
      await raw.lead.deleteMany({});
      await raw.contactEmail.deleteMany({});
      await raw.contact.deleteMany({});
    });
  });

  it("updates the open card whose email matches (any case): moves it, sets next step, adds the notes", async () => {
    const existing = await inT(() =>
      prisma.lead.create({
        data: {
          organization: 'Hope Center',
          email: 'Pat@Hope.ORG',
          pipelineId: sales.id,
          stageId: sales.lanes[0],
          nextAction: 'Send intro',
        },
      }),
    );
    const result = await book('pat@hope.org', { guestMessage: 'Looking forward to it' });

    expect(result.id).toBe(existing.id);
    expect(await cardCount()).toBe(1);
    const updated = await card(existing.id);
    expect(updated).toMatchObject({
      organization: 'Hope Center',
      pipelineId: sales.id,
      stageId: sales.lanes[1],
      nextAction: 'Demo scheduled',
      nextActionDate: startAt,
    });
    expect(updated.lastContactDate).not.toBeNull();
    expect(updated.artifacts.map((a) => a.title).sort()).toEqual(['Demo note', 'Demo — 2026-11-20']);
  });

  it("matches on the card's person's email", async () => {
    const person = await inT(() =>
      prisma.contact.create({ data: { firstName: 'Pat', emails: { create: [{ email: 'pat@work.org' }, { email: 'pat@home.org' }] } } }),
    );
    const existing = await inT(() =>
      prisma.lead.create({
        data: { organization: 'Hope Center', primaryContactId: person.id, pipelineId: sales.id, stageId: sales.lanes[0] },
      }),
    );
    const result = await book('PAT@home.org');
    expect(result.id).toBe(existing.id);
    expect(await cardCount()).toBe(1);
  });

  it('creates a new card when nothing matches, exactly as before', async () => {
    await inT(() =>
      prisma.lead.create({ data: { organization: 'Someone Else', email: 'other@x.org', pipelineId: sales.id, stageId: sales.lanes[0] } }),
    );
    const result = await book('new@guest.org', { guestOrg: 'New Org' });
    expect(await cardCount()).toBe(2);
    expect(await card(result.id)).toMatchObject({
      organization: 'New Org',
      primaryContact: 'Pat Guest',
      email: 'new@guest.org',
      source: 'INBOUND',
      pipelineId: sales.id,
      stageId: sales.lanes[1],
      nextAction: 'Demo scheduled',
    });
  });

  it('ignores archived cards and cards on other pipelines', async () => {
    const archived = await inT(() =>
      prisma.lead.create({
        data: { organization: 'Old', email: 'pat@hope.org', pipelineId: sales.id, stageId: sales.lanes[0], archivedAt: new Date() },
      }),
    );
    const elsewhere = await inT(() =>
      prisma.lead.create({ data: { organization: 'Partner', email: 'pat@hope.org', pipelineId: other.id, stageId: other.lane } }),
    );
    const result = await book('pat@hope.org');
    expect([archived.id, elsewhere.id]).not.toContain(result.id);
    expect(await cardCount()).toBe(3);
    expect((await card(elsewhere.id)).stageId).toBe(other.lane);
  });

  it("never matches another tenant's card", async () => {
    const theirs = await runWithTenant(U, async () => {
      const lane = await prisma.pipelineStage.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } });
      return prisma.lead.create({
        data: { organization: 'Theirs', email: 'pat@hope.org', pipelineId: lane.pipelineId, stageId: lane.id },
      });
    });
    const result = await book('pat@hope.org');
    expect(result.id).not.toBe(theirs.id);
    expect(await cardCount()).toBe(1);
    const untouched = await runWithTenant(U, () => prisma.lead.findUniqueOrThrow({ where: { id: theirs.id } }));
    expect(untouched.nextAction).toBeNull();
  });

  it('with several matching cards, updates the most recently updated one', async () => {
    const older = await inT(() =>
      prisma.lead.create({ data: { organization: 'A', email: 'pat@hope.org', pipelineId: sales.id, stageId: sales.lanes[0] } }),
    );
    const newer = await inT(() =>
      prisma.lead.create({ data: { organization: 'B', email: 'pat@hope.org', pipelineId: sales.id, stageId: sales.lanes[0] } }),
    );
    await inT(() => prisma.lead.update({ where: { id: older.id }, data: { updatedAt: new Date('2026-01-01') } }));
    const result = await book('pat@hope.org');
    expect(result.id).toBe(newer.id);
    expect(await cardCount()).toBe(2);
  });
});
