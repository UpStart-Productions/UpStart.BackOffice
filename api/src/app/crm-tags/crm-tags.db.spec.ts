/**
 * CRM tags against a real Postgres engine (pglite), through the real tenant extension.
 * Skipped unless pglite is installed and TENANT_TEST_SCHEMA_SQL points at the schema:
 *   npx prisma migrate diff --from-empty --to-schema apps/api/prisma/schema.prisma --script > /tmp/schema.sql
 *   TENANT_TEST_SCHEMA_SQL=/tmp/schema.sql npx vitest run --root api crm-tags.db
 */
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantExtension } from '../tenancy/prisma-tenant.extension';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { hasTagWhere, setClientTags, setContactTags } from './crm-tags.util';

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

describe.skipIf(!SQL || !pglite || !socket)('CRM tags (real Postgres)', () => {
  let server: any;
  let raw: PrismaClient;
  let prisma: PrismaClient;
  const T = 'tenant-t';
  const U = 'tenant-u';
  const inT = <R>(fn: () => R) => runWithTenant(T, fn);
  const inU = <R>(fn: () => R) => runWithTenant(U, fn);

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
      await raw.tenant.create({ data: { id: T, name: 'T', slug: 't' } });
      await raw.tenant.create({ data: { id: U, name: 'U', slug: 'u' } });
    });
  }, 60_000);

  afterAll(async () => {
    await raw?.$disconnect();
    await server?.stop();
  });

  it('shares one tag between organizations and people, case-insensitively', async () => {
    const org = await inT(() => prisma.client.create({ data: { name: 'Acme', journey: 'NONE' } }));
    const person = await inT(() => prisma.contact.create({ data: { firstName: 'Ann' } }));
    await inT(() => setClientTags(prisma as never, org.id, ['Partner', 'Vendor']));
    await inT(() => setContactTags(prisma as never, person.id, ['partner']));

    const tags = await inT(() => prisma.tag.findMany({ where: { scope: 'CRM' }, orderBy: { name: 'asc' } }));
    expect(tags.map((t) => t.name)).toEqual(['Partner', 'Vendor']);
    const partners = await inT(() => prisma.contact.findMany({ where: hasTagWhere('PARTNER') }));
    expect(partners.map((p) => p.id)).toEqual([person.id]);
  });

  it('replaces tags exactly and keeps CRM tags apart from task tags', async () => {
    await inT(() => prisma.tag.create({ data: { name: 'Partner', nameKey: 'partner', scope: 'TASK' } }));
    const org = await inT(() => prisma.client.create({ data: { name: 'Beta' } }));
    await inT(() => setClientTags(prisma as never, org.id, ['Partner', 'Vendor']));
    await inT(() => setClientTags(prisma as never, org.id, ['Vendor']));
    const names = await inT(() =>
      prisma.clientTag.findMany({ where: { clientId: org.id }, select: { tag: { select: { name: true, scope: true } } } }),
    );
    expect(names).toEqual([{ tag: { name: 'Vendor', scope: 'CRM' } }]);
    expect(await inT(() => prisma.tag.count({ where: { nameKey: 'partner' } }))).toBe(2);
  });

  it('keeps each tenant\'s tags to itself', async () => {
    const org = await inU(() => prisma.client.create({ data: { name: 'Gamma' } }));
    await inU(() => setClientTags(prisma as never, org.id, ['Partner']));
    expect(await inU(() => prisma.tag.count({ where: { scope: 'CRM' } }))).toBe(1);
    expect(await inT(() => prisma.clientTag.count({ where: { clientId: org.id } }))).toBe(0);
  });
});
