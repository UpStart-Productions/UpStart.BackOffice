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

  const user = await prisma.user.upsert({
    where: { email: email.trim() },
    update: {
      role: 'ADMIN',
      isActive: true,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      clientId: null,
    },
    create: {
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`Admin user created/updated: ${user.email} (id: ${user.id})`);
}

runForTenant(main)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => disconnect());
