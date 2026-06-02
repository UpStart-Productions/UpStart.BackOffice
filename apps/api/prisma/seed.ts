import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding...');

  // Create default workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'upstart' },
    update: {},
    create: { slug: 'upstart', name: 'UpStart Productions' },
  });
  console.log(`Workspace: ${workspace.name}`);

  // Create super admin user
  const user = await prisma.user.upsert({
    where: { email: 'admin@upstart.test' },
    update: {},
    create: {
      email: 'admin@upstart.test',
      firstName: 'Admin',
      lastName: 'User',
      isSuper: true,
      isActive: true,
    },
  });
  console.log(`User: ${user.email}`);

  // Add user to workspace as admin
  await prisma.workspaceUser.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'ADMIN',
      hourlyRate: 150,
    },
  });

  // Create a sample client
  const client = await prisma.client.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: 'SMPL' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'Sample Client',
      code: 'SMPL',
      email: 'billing@sampleclient.com',
    },
  });
  console.log(`Client: ${client.name}`);

  // Create a sample project
  await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      workspaceId: workspace.id,
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
