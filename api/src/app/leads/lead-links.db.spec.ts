/**
 * Lead -> Account/Contact linking against a real Postgres engine (pglite), through the real tenant
 * extension. Skipped unless pglite is installed and TENANT_TEST_SCHEMA_SQL points at the schema:
 *   npx prisma migrate diff --from-empty --to-schema apps/api/prisma/schema.prisma --script > /tmp/schema.sql
 *   TENANT_TEST_SCHEMA_SQL=/tmp/schema.sql npx vitest run --root api lead-links.db
 */
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantExtension } from '../tenancy/prisma-tenant.extension';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { applyLeadEditsToLinks, ensureLeadLinks } from './lead-links.util';

const SQL = process.env.TENANT_TEST_SCHEMA_SQL;
const PORT = 54331;

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

describe.skipIf(!SQL || !pglite || !socket)('lead links (real Postgres)', () => {
  let server: any;
  let raw: PrismaClient;
  let prisma: PrismaClient;
  const T = 'tenant-l';
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
    await runUnscoped(() => raw.tenant.create({ data: { id: T, name: 'L', slug: 'l' } }));
  }, 60_000);

  afterAll(async () => {
    await raw?.$disconnect();
    await server?.stop();
  });

  it('gives a new lead a Prospect Account and a Contact with its email', async () => {
    const lead = await inT(() =>
      prisma.lead.create({ data: { organization: 'Acme', primaryContact: 'Ana Lee', email: 'Ana@Acme.com', contactRole: 'Owner', phone: '555' } }),
    );
    const links = await inT(() => ensureLeadLinks(prisma, lead.id));

    const account = await inT(() => prisma.client.findUniqueOrThrow({ where: { id: links.clientId } }));
    expect(account).toMatchObject({ name: 'Acme', journey: 'PROSPECT', code: null, tenantId: T });
    const contact = await inT(() =>
      prisma.contact.findUniqueOrThrow({ where: { id: links.primaryContactId! }, include: { emails: true, accountLinks: true } }),
    );
    expect(contact).toMatchObject({ firstName: 'Ana', lastName: 'Lee', phone: '555', tenantId: T });
    expect(contact.emails.map((e) => e.email)).toEqual(['ana@acme.com']);
    expect(contact.accountLinks).toMatchObject([{ clientId: account.id, role: 'Owner', isPrimary: true }]);
    const saved = await inT(() => prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(saved).toMatchObject({ clientId: account.id, primaryContactId: contact.id });
  });

  it('reuses the Account (case-insensitive name) and the Contact (same email) for a second lead', async () => {
    const second = await inT(() =>
      prisma.lead.create({ data: { organization: 'ACME', primaryContact: 'Ana L.', email: 'ana@acme.com' } }),
    );
    const links = await inT(() => ensureLeadLinks(prisma, second.id));
    expect(await inT(() => prisma.client.count({ where: { name: { equals: 'acme', mode: 'insensitive' } } }))).toBe(1);
    expect(await inT(() => prisma.contact.count())).toBe(1);
    const first = await inT(() => prisma.lead.findFirstOrThrow({ where: { organization: 'Acme' } }));
    expect(links).toEqual({ clientId: first.clientId, primaryContactId: first.primaryContactId });
  });

  it('is idempotent and a lead with no person gets an Account only', async () => {
    const lead = await inT(() => prisma.lead.create({ data: { organization: 'Solo Org' } }));
    const a = await inT(() => ensureLeadLinks(prisma, lead.id));
    const b = await inT(() => ensureLeadLinks(prisma, lead.id));
    expect(a.primaryContactId).toBeNull();
    expect(b).toEqual(a);
    expect(await inT(() => prisma.client.count({ where: { name: 'Solo Org' } }))).toBe(1);
  });

  it('pushes form edits to the Contact and carries a rename to the Account', async () => {
    const lead = await inT(() => prisma.lead.findFirstOrThrow({ where: { organization: 'Acme' } }));
    await inT(() =>
      applyLeadEditsToLinks(
        prisma,
        { id: lead.id, clientId: lead.clientId, primaryContactId: lead.primaryContactId },
        'Acme',
        { organization: 'Acme Corp', primaryContact: 'Ana Maria Lee', phone: '777', email: 'ana@acmecorp.com', contactRole: 'CEO' },
      ),
    );
    const account = await inT(() => prisma.client.findUniqueOrThrow({ where: { id: lead.clientId! } }));
    expect(account.name).toBe('Acme Corp');
    const contact = await inT(() =>
      prisma.contact.findUniqueOrThrow({
        where: { id: lead.primaryContactId! },
        include: { emails: { orderBy: { createdAt: 'asc' } }, accountLinks: true },
      }),
    );
    expect(contact).toMatchObject({ firstName: 'Ana', lastName: 'Maria Lee', phone: '777' });
    expect(contact.emails.find((e) => e.isPrimary)?.email).toBe('ana@acmecorp.com');
    expect(contact.emails).toHaveLength(2);
    expect(contact.accountLinks[0].role).toBe('CEO');
  });
});
