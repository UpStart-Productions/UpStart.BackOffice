import { Prisma } from '@prisma/client';
import { ORG_FOCUS_CATEGORIES, type OrgFocusCategory } from '@upstart/back-office/shared';
import type { PrismaService } from '../prisma/prisma.service';

export function insensitiveContains(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

/** Focus enum values whose code or spaced label matches the query (substring). */
export function focusCategoriesMatchingQuery(q: string): OrgFocusCategory[] {
  const lower = q.trim().toLowerCase();
  if (!lower) return [];
  const out = new Set<OrgFocusCategory>();
  for (const value of ORG_FOCUS_CATEGORIES) {
    const code = value.toLowerCase();
    const label = value.replace(/_/g, ' ').toLowerCase();
    if (code.includes(lower) || label.includes(lower)) out.add(value);
  }
  return [...out];
}

/** Client ids where services or products array entries match q (substring). */
export async function clientIdsMatchingServiceOrProduct(
  prisma: PrismaService,
  tenantId: string,
  q: string,
): Promise<string[]> {
  const pattern = `%${q}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT c."id"
    FROM "Client" c
    WHERE c."tenantId" = ${tenantId}
    AND (
      EXISTS (SELECT 1 FROM unnest(c."services") AS svc WHERE svc ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM unnest(c."products") AS prod WHERE prod ILIKE ${pattern})
    )
  `);
  return rows.map((r) => r.id);
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
    { tags: { some: { tag: { name: ic, scope: 'CRM' as const } } } },
    { accountLinks: { some: { client: { name: ic } } } },
    ...(linkedClientIdsFromCatalog.length
      ? [{ accountLinks: { some: { clientId: { in: linkedClientIdsFromCatalog } } } }]
      : []),
  ];
}
