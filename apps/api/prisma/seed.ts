import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding...');

  const devUser = await prisma.user.upsert({
    where: { email: 'admin@upstart.test' },
    update: { role: 'ADMIN', isSuper: true, isActive: true, hourlyRate: 150 },
    create: {
      email: 'admin@upstart.test',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isSuper: true,
      isActive: true,
      hourlyRate: 150,
    },
  });
  console.log(`User: ${devUser.email}`);

  const jeff = await prisma.user.upsert({
    where: { email: 'jeff@heyupstart.com' },
    update: { role: 'ADMIN', isSuper: true, isActive: true, hourlyRate: 150 },
    create: {
      email: 'jeff@heyupstart.com',
      firstName: 'Jeff',
      lastName: 'Denton',
      name: 'Jeff Denton',
      role: 'ADMIN',
      isSuper: true,
      isActive: true,
      hourlyRate: 150,
    },
  });
  console.log(`User: ${jeff.email}`);

  const client = await prisma.client.upsert({
    where: { code: 'SMPL' },
    update: {},
    create: {
      name: 'Sample Client',
      code: 'SMPL',
      email: 'billing@sampleclient.com',
    },
  });
  console.log(`Client: ${client.name}`);

  await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      clientId: client.id,
      name: 'Website Redesign',
      hourlyRate: 150,
      isBillable: true,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
