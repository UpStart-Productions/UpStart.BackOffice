import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const email = await ask('Email: ');
  const firstName = await ask('First name: ');
  const lastName = await ask('Last name: ');
  rl.close();

  const user = await prisma.user.upsert({
    where: { email: email.trim() },
    update: { isSuper: true, isActive: true, firstName: firstName.trim(), lastName: lastName.trim() },
    create: { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), isSuper: true, isActive: true },
  });

  console.log(`Super user created/updated: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
