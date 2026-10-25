/**
 * Mark (or unmark) a user as a super user (platform operator who can switch tenants).
 *   npx tsx tools/set-super.ts jeff@heyupstart.com          # make super
 *   npx tsx tools/set-super.ts jeff@heyupstart.com --off    # remove
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { runUnscoped } from '../api/src/app/tenancy/tenant-context';
import { disconnect, rawPrisma } from './lib/tenant-prisma';

async function main() {
  const email = process.argv[2]?.trim();
  if (!email || email.startsWith('--')) throw new Error('Usage: set-super.ts <email> [--off]');
  const isSuper = !process.argv.includes('--off');
  // The same email can have a row in several tenants; prefer the operator row, else require one match.
  const rows = await runUnscoped(() => rawPrisma.user.findMany({ where: { email }, orderBy: { createdAt: 'asc' } }));
  if (!rows.length) throw new Error(`No user with email ${email}`);
  const user = rows.find((r) => r.isSuper) ?? rows.find((r) => r.tenantId === null) ?? (rows.length === 1 ? rows[0] : null);
  if (!user) throw new Error(`${email} has a user in ${rows.length} tenants; cannot tell which one to change.`);
  await runUnscoped(() => rawPrisma.user.update({ where: { id: user.id }, data: { isSuper } }));
  console.log(`${email}: isSuper = ${isSuper}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => disconnect());
