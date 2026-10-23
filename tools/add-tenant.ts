/**
 * Create a tenant and its primary inbound-email alias.
 *   npx tsx tools/add-tenant.ts <slug> "<Display Name>" [--domains purplenest.org,example.com]
 * Then add its first admin: npx tsx tools/add-admin-user.ts --tenant <slug>
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { runUnscoped } from '../api/src/app/tenancy/tenant-context';
import { disconnect, rawPrisma } from './lib/tenant-prisma';

async function main() {
  const [slugArg, nameArg] = process.argv.slice(2);
  const slug = slugArg?.trim().toLowerCase();
  const name = nameArg?.trim();
  if (!slug || !name || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Usage: add-tenant.ts <slug> "<Display Name>" [--domains a.com,b.com]  (slug: a-z, 0-9, -)');
  }
  const di = process.argv.indexOf('--domains');
  const internalDomains = di >= 0 ? (process.argv[di + 1] ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean) : [];

  await runUnscoped(async () => {
    if (await rawPrisma.tenant.findUnique({ where: { slug } })) throw new Error(`Tenant "${slug}" already exists`);
    const tenant = await rawPrisma.tenant.create({ data: { name, slug, internalDomains } });
    // Inbound capture address: <slug>@in.<domain>. Pick a different one later in Settings > Email capture.
    const taken = await rawPrisma.inboundAlias.findUnique({ where: { alias: slug } });
    if (!taken) await rawPrisma.inboundAlias.create({ data: { alias: slug, tenantId: tenant.id, isPrimary: true } });
    console.log(`Created tenant "${name}" (id ${tenant.id}, slug ${slug})${taken ? ` - alias "${slug}" was taken, set one in Settings` : ''}`);
  });
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => disconnect());
