import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.user.count();
  if (count === 0) {
    console.log('No users found, running seed...');
    const { execSync } = await import('child_process');
    execSync('npx prisma db seed', { stdio: 'inherit' });
  } else {
    console.log(`Seed skipped (${count} user(s) exist).`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
