import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as readline from 'readline';
import { disconnect, prisma, runForTenant } from './lib/tenant-prisma';


const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const email = await ask('Email: ');
  const firstName = await ask('First name: ');
  const lastName = await ask('Last name: ');
  rl.close();

  // prisma is scoped to the tenant, so this finds only this tenant's row for the email.
  const data = {
    role: 'ADMIN' as const,
    isActive: true,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    clientId: null,
  };
  const existing = await prisma.user.findFirst({ where: { email: email.trim() } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data })
    : await prisma.user.create({ data: { email: email.trim(), ...data } });

  console.log(`Admin user created/updated: ${user.email} (id: ${user.id})`);
}

runForTenant(main)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => disconnect());
