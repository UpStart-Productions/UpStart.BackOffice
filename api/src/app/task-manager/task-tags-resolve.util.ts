import { Prisma } from '@prisma/client';
import { DIMENSION_TAG_KEY } from '@upstart/back-office/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { dimensionsMapFromRows, type DimensionRow } from '../dimensions/dimensions.util';
import { fetchDimensionRowsForRecords } from '../dimensions/dimensions-load.util';
import { tagsByNames } from '../dimensions/tag-catalog.util';
import type { TaskSummaryDto, TaskSummaryRow } from './task-mappers';
import { toTaskSummary } from './task-mappers';

export type ResolvedTaskTag = { id: string; name: string; color: string | null };

export async function tagsForTaskIds(
  db: PrismaService,
  taskIds: string[],
): Promise<Map<string, ResolvedTaskTag[]>> {
  const out = new Map<string, ResolvedTaskTag[]>();
  if (!taskIds.length) return out;
  const dimMap = await fetchDimensionRowsForRecords(db, 'TASK', taskIds);
  const allNames = new Set<string>();
  for (const rows of dimMap.values()) {
    for (const name of dimensionsMapFromRows(rows)[DIMENSION_TAG_KEY] ?? []) {
      allNames.add(name);
    }
  }
  const catalog = await tagsByNames(db, 'TASK', [...allNames]);
  const byName = new Map(catalog.map((t) => [t.name.toLowerCase(), t]));
  for (const taskId of taskIds) {
    const rows: DimensionRow[] = dimMap.get(taskId) ?? [];
    const names = dimensionsMapFromRows(rows)[DIMENSION_TAG_KEY] ?? [];
    const tags = names.map((name) => byName.get(name.toLowerCase()) ?? { id: `name:${name.toLowerCase()}`, name, color: null });
    out.set(taskId, tags.sort((a, b) => a.name.localeCompare(b.name)));
  }
  return out;
}

export async function attachTagsToTaskSummaries(
  db: PrismaService,
  rows: TaskSummaryRow[],
): Promise<TaskSummaryDto[]> {
  const tagMap = await tagsForTaskIds(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toTaskSummary(row, tagMap.get(row.id) ?? []));
}

export async function taskIdsMatchingTagSearch(db: PrismaService, q: string): Promise<string[]> {
  const pattern = `%${q.trim()}%`;
  if (!q.trim()) return [];
  const rows = await db.$queryRaw<Array<{ recordId: string }>>(Prisma.sql`
    SELECT DISTINCT dv."recordId"
    FROM "DimensionValue" dv
    INNER JOIN "DimensionDefinition" dd ON dd."id" = dv."definitionId"
    WHERE dd."entity" = 'TASK'::"DimensionEntity"
      AND dd."key" = ${DIMENSION_TAG_KEY}
      AND EXISTS (SELECT 1 FROM unnest(dv."values") AS v WHERE v ILIKE ${pattern})
  `);
  return rows.map((r) => r.recordId);
}
