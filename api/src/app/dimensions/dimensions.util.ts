import { Prisma } from '@prisma/client';
import {
  CLIENT_DIMENSION_KEYS,
  LEGACY_FOCUS_ENUM_TO_LABEL,
  type DimensionDefinitionDto,
  type DimensionEntity,
} from '@upstart/back-office/shared';
import type { PrismaService } from '../prisma/prisma.service';
import {
  catalogGroupForDefinition,
  filterCatalogExcluded,
  hideCatalogValue,
  mergePresetStrings,
  purgeCatalogValue,
  renameCatalogValue,
  restoreCatalogValue,
  usageCountsForDefinition,
} from './dimensions-catalog.util';
import {
  ensureClientDimensionDefinitions,
  ensureEntityDimensionDefinitions,
  getRecordDimensionValues,
  setClientDimensions,
  setRecordDimensions,
} from './dimensions-record.util';

export type DimensionsDb = Pick<Prisma.TransactionClient, 'dimensionDefinition' | 'dimensionValue' | 'tag'>;

export type { DimensionRow } from './dimensions-load.util';
export {
  addCatalogValue,
  catalogGroupForDefinition,
  hideCatalogValue,
  mergePresetStrings,
  purgeCatalogValue,
  renameCatalogValue,
  restoreCatalogValue,
  usageCountsForDefinition,
} from './dimensions-catalog.util';
export {
  ensureClientDimensionDefinitions,
  ensureEntityDimensionDefinitions,
  getRecordDimensionValues,
  setClientDimensions,
  setRecordDimensions,
} from './dimensions-record.util';
export { clientIdsWithTagName, contactIdsWithTagName, fetchDimensionRowsForRecords, withClientDimensionRows } from './dimensions-load.util';

/** @deprecated Load dimensions with `withClientDimensionRows` after fetching clients. */
export const clientDimensionsInclude = {} as const;

/** Flatten dimension value rows to `Record<key, string[]>`. */
export function dimensionsMapFromRows(
  rows: Array<{ values: string[]; definition: { key: string } }> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows ?? []) {
    const key = row.definition.key;
    out[key] = [...row.values].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

function emptyDimensions(): Record<string, string[]> {
  return {
    [CLIENT_DIMENSION_KEYS.tags]: [],
    [CLIENT_DIMENSION_KEYS.services]: [],
    [CLIENT_DIMENSION_KEYS.products]: [],
    [CLIENT_DIMENSION_KEYS.focus]: [],
  };
}

export function definitionRowToDto(
  row: {
    entity: DimensionEntity;
    key: string;
    label: string;
    sortOrder: number;
    presets: unknown;
    catalogExcluded: string[];
    searchInGlobal: boolean;
  },
  usedValues: string[],
): DimensionDefinitionDto {
  return {
    entity: row.entity,
    key: row.key,
    label: row.label,
    sortOrder: row.sortOrder,
    presets: mergePresetStrings(row.presets, usedValues, row.catalogExcluded),
    searchInGlobal: row.searchInGlobal,
  };
}

/** Distinct values already saved for one dimension (suggestion catalog). */
export async function distinctValuesForDefinition(db: PrismaService, definitionId: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ v: string }>>(Prisma.sql`
    SELECT DISTINCT v
    FROM "DimensionValue" dv, unnest(dv."values") AS v
    WHERE dv."definitionId" = ${definitionId}
    ORDER BY v ASC
  `);
  return rows.map((r) => r.v);
}

/** Client ids whose dimension values match q (services, products, focus, tags). */
export async function clientIdsMatchingDimensions(
  prisma: PrismaService,
  tenantId: string,
  q: string,
): Promise<string[]> {
  const pattern = `%${q}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT c."id"
    FROM "Client" c
    INNER JOIN "DimensionValue" dv ON dv."recordId" = c."id"
    INNER JOIN "DimensionDefinition" dd ON dd."id" = dv."definitionId"
    WHERE c."tenantId" = ${tenantId}
      AND dd."entity" = 'CLIENT'::"DimensionEntity"
      AND dd."searchInGlobal" = true
      AND EXISTS (SELECT 1 FROM unnest(dv."values") AS v WHERE v ILIKE ${pattern})
  `);
  return rows.map((r) => r.id);
}

/** Focus-area labels that match a search substring (for supplemental enum-style matching). */
export function focusLabelsMatchingQuery(q: string): string[] {
  const lower = q.trim().toLowerCase();
  if (!lower) return [];
  const labels = Object.values(LEGACY_FOCUS_ENUM_TO_LABEL);
  return labels.filter((label) => label.toLowerCase().includes(lower));
}

/** Merge loaded rows with empty defaults for known keys. */
export function clientDimensionsDto(
  rows: Array<{ values: string[]; definition: { key: string } }> | undefined,
): Record<string, string[]> {
  return { ...emptyDimensions(), ...dimensionsMapFromRows(rows) };
}

/** Client list filter by tag name — use `clientIdsWithTagName` and `{ id: { in: ids } }`. */
export function hasClientTagWhere(_name: string | undefined): Prisma.ClientWhereInput {
  return {};
}
