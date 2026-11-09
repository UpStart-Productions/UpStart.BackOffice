import type { DimensionEntity } from '@upstart/back-office/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { tagName } from '../crm-tags/crm-tags.util';
import { CLIENT_DIMENSION_KEYS, DIMENSION_TAG_KEY } from '@upstart/back-office/shared';
export type DimensionQueryDb =
  | Pick<PrismaClient, 'dimensionValue' | '$queryRaw'>
  | Pick<Prisma.TransactionClient, 'dimensionValue'>;

export type DimensionRow = { values: string[]; definition: { key: string } };

export async function fetchDimensionRowsForRecords(
  db: DimensionQueryDb,
  entity: DimensionEntity,
  recordIds: string[],
): Promise<Map<string, DimensionRow[]>> {
  if (!recordIds.length) return new Map();
  const rows = await db.dimensionValue.findMany({
    where: { recordId: { in: recordIds }, definition: { entity } },
    select: {
      recordId: true,
      values: true,
      definition: { select: { key: true } },
    },
  });
  const map = new Map<string, DimensionRow[]>();
  for (const row of rows) {
    const list = map.get(row.recordId) ?? [];
    list.push({ values: row.values, definition: row.definition });
    map.set(row.recordId, list);
  }
  return map;
}

function tagNamesFromRows(rows: DimensionRow[]): string[] {
  const row = rows.find((r) => r.definition.key === DIMENSION_TAG_KEY);
  return row ? [...row.values].sort((a, b) => a.localeCompare(b)) : [];
}

export async function contactTagsByIds(
  db: DimensionQueryDb,
  contactIds: string[],
): Promise<Map<string, string[]>> {
  const dimMap = await fetchDimensionRowsForRecords(db, 'CONTACT', contactIds);
  const out = new Map<string, string[]>();
  for (const id of contactIds) {
    out.set(id, tagNamesFromRows(dimMap.get(id) ?? []));
  }
  return out;
}

export async function clientIdsWithFocusLabels(
  db: Pick<PrismaClient, '$queryRaw'>,
  labels: string[],
): Promise<string[]> {
  if (!labels.length) return [];
  const rows = await db.$queryRaw<Array<{ recordId: string }>>(Prisma.sql`
    SELECT DISTINCT dv."recordId"
    FROM "DimensionValue" dv
    INNER JOIN "DimensionDefinition" dd ON dd."id" = dv."definitionId"
    WHERE dd."entity" = 'CLIENT'::"DimensionEntity"
      AND dd."key" = ${CLIENT_DIMENSION_KEYS.focus}
      AND dv."values" && ${labels}::text[]
  `);
  return rows.map((r) => r.recordId);
}

export async function withClientDimensionRows<T extends { id: string }>(
  db: DimensionQueryDb,
  records: T[],
): Promise<Array<T & { dimensionValues: DimensionRow[] }>> {
  const map = await fetchDimensionRowsForRecords(
    db,
    'CLIENT',
    records.map((r) => r.id),
  );
  return records.map((r) => ({ ...r, dimensionValues: map.get(r.id) ?? [] }));
}

/** Client ids whose tags dimension includes this name (canonical match). */
export async function clientIdsWithTagName(db: Pick<PrismaClient, '$queryRaw'>, rawName: string): Promise<string[]> {
  const canonical = tagName(rawName);
  if (!canonical) return [];
  const rows = await db.$queryRaw<Array<{ recordId: string }>>(Prisma.sql`
    SELECT DISTINCT dv."recordId"
    FROM "DimensionValue" dv
    INNER JOIN "DimensionDefinition" dd ON dd."id" = dv."definitionId"
    WHERE dd."entity" = 'CLIENT'::"DimensionEntity"
      AND dd."key" = ${CLIENT_DIMENSION_KEYS.tags}
      AND ${canonical} = ANY(dv."values")
  `);
  return rows.map((r) => r.recordId);
}

/** Prisma where: contact tags dimension includes this CRM tag name. */
export async function contactIdsWithTagName(db: Pick<PrismaClient, '$queryRaw'>, rawName: string): Promise<string[]> {
  const canonical = tagName(rawName);
  if (!canonical) return [];
  const rows = await db.$queryRaw<Array<{ recordId: string }>>(Prisma.sql`
    SELECT DISTINCT dv."recordId"
    FROM "DimensionValue" dv
    INNER JOIN "DimensionDefinition" dd ON dd."id" = dv."definitionId"
    WHERE dd."entity" = 'CONTACT'::"DimensionEntity"
      AND dd."key" = ${DIMENSION_TAG_KEY}
      AND ${canonical} = ANY(dv."values")
  `);
  return rows.map((r) => r.recordId);
}
