import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { clientIdsMatchingDimensions } from '../dimensions/dimensions.util';

export function insensitiveContains(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

/** Client ids where dimension values (tags, services, products, focus) match q. */
export async function clientIdsMatchingServiceOrProduct(
  prisma: PrismaService,
  tenantId: string,
  q: string,
): Promise<string[]> {
  return clientIdsMatchingDimensions(prisma, tenantId, q);
}

/** Lead ids where serviceInterests array entries match q (substring). */
export async function leadIdsMatchingServiceInterests(
  prisma: PrismaService,
  tenantId: string,
  q: string,
): Promise<string[]> {
  const pattern = `%${q}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT l."id"
    FROM "Lead" l
    WHERE l."tenantId" = ${tenantId}
    AND EXISTS (
      SELECT 1 FROM unnest(l."serviceInterests") AS si WHERE si ILIKE ${pattern}
    )
  `);
  return rows.map((r) => r.id);
}

/** Shared OR clauses for matching a CRM Contact person record. */
export function contactTextOr(q: string, linkedClientIdsFromCatalog: string[]) {
  const ic = insensitiveContains(q);
  return [
    { firstName: ic },
    { lastName: ic },
    { title: ic },
    { phone: ic },
    { emails: { some: { email: { contains: q.toLowerCase() } } } },
    { accountLinks: { some: { client: { name: ic } } } },
    ...(linkedClientIdsFromCatalog.length
      ? [{ accountLinks: { some: { clientId: { in: linkedClientIdsFromCatalog } } } }]
      : []),
  ];
}
