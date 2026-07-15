import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Database seed — run manually when needed: `npm run dev:seed`
 *
 * Production does not run this automatically (see api/docker-entrypoint.sh).
 * Add idempotent upserts here for one-off data backfills or new-environment setup.
 */
async function main() {
  console.log('Seed: nothing configured.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
