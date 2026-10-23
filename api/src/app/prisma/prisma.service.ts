import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { tenantExtension } from '../tenancy/prisma-tenant.extension';

/**
 * The app's Prisma client. Every query is tenant-scoped by the extension (see tenancy/).
 * The constructor returns the extended client; it connects lazily on first query.
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
    return this.$extends(tenantExtension) as unknown as this;
  }
}
