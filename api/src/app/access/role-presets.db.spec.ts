/**
 * Preset roles against a real Postgres engine (pglite), through the real tenant extension.
 * Skipped unless pglite is installed and TENANT_TEST_SCHEMA_SQL points at the schema (see tenant-isolation.spec.ts).
 */
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ROLE_PRESETS } from '@upstart/back-office/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantExtension } from '../tenancy/prisma-tenant.extension';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { ensurePresetRoles } from './role-presets.util';

const SQL = process.env.TENANT_TEST_SCHEMA_SQL;
const PORT = 54335;

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

describe.skipIf(!SQL || !pglite || !socket)('preset roles (real Postgres)', () => {
  let server: any;
  let raw: PrismaClient;
  let prisma: PrismaClient;

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
      await raw.tenant.create({ data: { id: 'a', name: 'A', slug: 'a' } });
      await raw.tenant.create({ data: { id: 'b', name: 'B', slug: 'b' } });
    });
  }, 60_000);

  afterAll(async () => {
    await raw?.$disconnect();
    await server?.stop();
  });

  it('gives each tenant the same presets once, scoped to that tenant', async () => {
    await runWithTenant('a', () => ensurePresetRoles(prisma));
    await runWithTenant('a', () => ensurePresetRoles(prisma));
    await runWithTenant('b', () => ensurePresetRoles(prisma));
    const a = await runWithTenant('a', () => prisma.role.findMany({ orderBy: { name: 'asc' } }));
    const b = await runWithTenant('b', () => prisma.role.findMany({ orderBy: { name: 'asc' } }));
    expect(a.map((r) => r.key).sort()).toEqual(ROLE_PRESETS.map((p) => p.key).sort());
    expect(b.map((r) => r.name)).toEqual(a.map((r) => r.name));
    expect(a.find((r) => r.key === 'team-member')?.actions).toEqual(ROLE_PRESETS.find((p) => p.key === 'team-member')?.actions);
  });

  it("doesn't touch a tenant's own role with a preset's name, or edits to a preset", async () => {
    await runUnscoped(() => raw.tenant.create({ data: { id: 'c', name: 'C', slug: 'c' } }));
    await runWithTenant('c', () => prisma.role.create({ data: { name: 'manager', permissions: { time: 'own' } } }));
    await runWithTenant('c', () => ensurePresetRoles(prisma));
    const managers = await runWithTenant('c', () => prisma.role.findMany({ where: { name: { equals: 'manager', mode: 'insensitive' } } }));
    expect(managers).toHaveLength(1);
    expect(managers[0].permissions).toEqual({ time: 'own' });

    await runWithTenant('a', () => prisma.role.updateMany({ where: { key: 'coordinator' }, data: { actions: { inbox: { delete: true } } } }));
    await runWithTenant('a', () => ensurePresetRoles(prisma));
    const coord = await runWithTenant('a', () => prisma.role.findFirstOrThrow({ where: { key: 'coordinator' } }));
    expect(coord.actions).toEqual({ inbox: { delete: true } });
  });
});
