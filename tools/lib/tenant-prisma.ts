/**
 * Shared Prisma client for CLI tools. Same tenant scoping as the API: every query is limited to
 * one tenant, chosen with `--tenant <slug>` (default: upstart). Wrap each tool's main() in runForTenant().
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { tenantExtension } from '../../api/src/app/tenancy/prisma-tenant.extension';
import { runUnscoped, runWithTenant } from '../../api/src/app/tenancy/tenant-context';

// Load .env here: this module builds the DB client at import time, before a tool's own dotenv call runs.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export const DEFAULT_TENANT_SLUG = 'upstart';

/** Unscoped client: only for tenant lookups and cross-tenant admin work. */
export const rawPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Tenant-scoped client. Queries throw unless run inside runForTenant(). */
export const prisma = rawPrisma.$extends(tenantExtension);

export function tenantSlugFromArgs(argv = process.argv): string {
  const i = argv.indexOf('--tenant');
  return (i >= 0 && argv[i + 1]) || DEFAULT_TENANT_SLUG;
}

export async function runForTenant(main: (tenant: { id: string; slug: string; name: string }) => Promise<void>) {
  const slug = tenantSlugFromArgs();
  const tenant = await runUnscoped(() => rawPrisma.tenant.findUnique({ where: { slug } }));
  if (!tenant) throw new Error(`Tenant "${slug}" not found. Create it with tools/add-tenant.ts.`);
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  await runWithTenant(tenant.id, () => main(tenant));
}

export async function disconnect() {
  await rawPrisma.$disconnect();
}
