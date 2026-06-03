/**
 * Create S3/local folder placeholders for existing clients and projects.
 * Run: npx tsx tools/backfill-storage-folders.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { StorageFoldersService } from '../api/src/app/storage/storage-folders.service';
import { LocalStorageService } from '../api/src/app/storage/local-storage.service';
import { S3StorageService } from '../api/src/app/storage/s3-storage.service';
import type { StorageService } from '../api/src/app/storage/storage.interface';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const storage =
  process.env.STORAGE_PROVIDER === 's3' ? new S3StorageService() : new LocalStorageService();

const folders = new StorageFoldersService(storage as StorageService);

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  for (const client of clients) {
    await folders.ensureClientFolders(client.id);
    console.log(`Client folders: ${client.name} (${client.id})`);
  }

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, clientId: true },
  });
  for (const project of projects) {
    await folders.ensureProjectFolder(project.clientId, project.id);
    console.log(`Project folder: ${project.name} (${project.id})`);
  }

  const invoices = await prisma.invoice.findMany({
    select: { id: true, displayNumber: true, clientId: true },
  });
  console.log(
    `\n${invoices.length} invoice(s) in DB — PDFs are written on download/send/update, not by this script.`,
  );
  console.log('Backfill complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
