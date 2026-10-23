/**
 * Cross-tenant isolation, run against a real Postgres engine (pglite) with the real Prisma client
 * and the real tenant extension. Skipped unless @electric-sql/pglite(+socket) are installed AND
 * TENANT_TEST_SCHEMA_SQL points at a SQL file for the current schema:
 *   npx prisma migrate diff --from-empty --to-schema apps/api/prisma/schema.prisma --script > /tmp/schema.sql
 *   TENANT_TEST_SCHEMA_SQL=/tmp/schema.sql npx vitest run --root api tenant-isolation
 */
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantExtension } from './prisma-tenant.extension';
import { runUnscoped, runWithTenant } from './tenant-context';

const SQL = process.env.TENANT_TEST_SCHEMA_SQL;
const PORT = 54329;

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

describe.skipIf(!SQL || !pglite || !socket)('tenant isolation (real Postgres)', () => {
  let server: any;
  let raw: PrismaClient;
  let prisma: ReturnType<PrismaClient['$extends']> & PrismaClient;
  const A = 'tenant-a';
  const B = 'tenant-b';
  const inA = <T>(fn: () => T) => runWithTenant(A, fn);
  const inB = <T>(fn: () => T) => runWithTenant(B, fn);

  beforeAll(async () => {
    const db = new pglite!.PGlite();
    await db.exec(readFileSync(SQL as string, 'utf8'));
    server = new socket!.PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
    await server.start();
    raw = new PrismaClient({
      adapter: new PrismaPg({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 1 }),
    });
    prisma = raw.$extends(tenantExtension) as never;
    await runUnscoped(async () => {
      await raw.tenant.create({ data: { id: A, name: 'A', slug: 'a' } });
      await raw.tenant.create({ data: { id: B, name: 'B', slug: 'b' } });
    });
  }, 60_000);

  afterAll(async () => {
    await raw?.$disconnect();
    await server?.stop();
  });

  it('refuses to run with no tenant in context', async () => {
    await expect(prisma.client.findMany()).rejects.toThrow(/Tenant required/);
  });

  it('lets two tenants use the same unique code', async () => {
    const a = await inA(() => prisma.client.create({ data: { name: 'Acme A', code: 'ACME' } }));
    const b = await inB(() => prisma.client.create({ data: { name: 'Acme B', code: 'ACME' } }));
    expect(a.tenantId).toBe(A);
    expect(b.tenantId).toBe(B);
    // Same tenant + same code is still a duplicate (skipDuplicates avoids a SQL error, which would drop pglite's single connection).
    const dup = await inA(() => prisma.client.createMany({ data: [{ name: 'dup', code: 'ACME' }], skipDuplicates: true }));
    expect(dup.count).toBe(0);
  });

  it('scopes reads, counts and lookups by id', async () => {
    const bClient = await inB(() => prisma.client.findFirstOrThrow({ where: { code: 'ACME' } }));
    expect(await inA(() => prisma.client.findMany())).toHaveLength(1);
    expect(await inA(() => prisma.client.count())).toBe(1);
    expect(await inA(() => prisma.client.findFirst({ where: { id: bClient.id } }))).toBeNull();
    expect(await inA(() => prisma.client.findUnique({ where: { id: bClient.id } }))).toBeNull();
  });

  it("cannot update or delete another tenant's rows", async () => {
    const bClient = await inB(() => prisma.client.findFirstOrThrow({ where: { code: 'ACME' } }));
    await expect(inA(() => prisma.client.update({ where: { id: bClient.id }, data: { name: 'hacked' } }))).rejects.toThrow();
    expect((await inA(() => prisma.client.updateMany({ where: { id: bClient.id }, data: { name: 'hacked' } }))).count).toBe(0);
    expect((await inA(() => prisma.client.deleteMany({ where: { id: bClient.id } }))).count).toBe(0);
    expect((await inB(() => prisma.client.findUniqueOrThrow({ where: { id: bClient.id } }))).name).toBe('Acme B');
  });

  it('ignores a caller-supplied tenantId and cannot move rows between tenants', async () => {
    const forged = await inA(() => prisma.client.create({ data: { name: 'Forged', code: 'FORGE', tenantId: B } as never }));
    expect(forged.tenantId).toBe(A);
    await inA(() => prisma.client.update({ where: { id: forged.id }, data: { tenantId: B } as never }));
    expect((await runUnscoped(() => raw.client.findUniqueOrThrow({ where: { id: forged.id } }))).tenantId).toBe(A);
  });

  it('injects the tenant into nested creates', async () => {
    const c = await inA(() =>
      prisma.contact.create({ data: { firstName: 'Pat', emails: { create: { email: 'pat@example.com', isPrimary: true } } } }),
    );
    const email = await runUnscoped(() => raw.contactEmail.findFirstOrThrow({ where: { contactId: c.id } }));
    expect(email.tenantId).toBe(A);
  });

  it('handles relation-style (checked) creates', async () => {
    const client = await inA(() => prisma.client.findFirstOrThrow({ where: { code: 'ACME' } }));
    const p = await inA(() => prisma.project.create({ data: { name: 'Site', client: { connect: { id: client.id } } } }));
    expect(p.tenantId).toBe(A);
  });

  it('keeps per-tenant singleton settings separate (upsert)', async () => {
    await inA(() => prisma.organizationProfile.upsert({ where: { tenantId: A }, create: { city: 'Org A' }, update: { city: 'Org A' } }));
    await inB(() => prisma.organizationProfile.upsert({ where: { tenantId: B }, create: { city: 'Org B' }, update: { city: 'Org B' } }));
    expect((await inA(() => prisma.organizationProfile.findFirstOrThrow())).city).toBe('Org A');
    expect((await inB(() => prisma.organizationProfile.findFirstOrThrow())).city).toBe('Org B');
  });

  it('scopes createMany and aggregates', async () => {
    await inA(() => prisma.tag.createMany({ data: [{ name: 'x', nameKey: 'x' }, { name: 'y', nameKey: 'y' }] }));
    await inB(() => prisma.tag.createMany({ data: [{ name: 'x', nameKey: 'x' }] }));
    expect(await inA(() => prisma.tag.count())).toBe(2);
    expect(await inB(() => prisma.tag.count())).toBe(1);
    const g = await inA(() => prisma.tag.groupBy({ by: ['nameKey'], _count: true }));
    expect(g).toHaveLength(2);
  });

  it('runUnscoped sees everything', async () => {
    const all = await runUnscoped(() => raw.client.findMany());
    expect(all.map((c) => c.tenantId)).toEqual(expect.arrayContaining([A, B]));
  });
});
