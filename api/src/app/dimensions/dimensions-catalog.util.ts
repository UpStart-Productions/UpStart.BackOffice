import { Prisma } from '@prisma/client';
import { CLIENT_DIMENSION_KEYS, DIMENSION_TAG_KEY, type DimensionCatalogGroupDto, type DimensionCatalogItemDto, type DimensionEntity } from '@upstart/back-office/shared';
import { ensureCrmTags, tagName } from '../crm-tags/crm-tags.util';
import { ensureTaskTags } from './tag-catalog.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { DimensionsDb } from './dimensions.util';

function excludedKeySet(excluded: string[] | undefined): Set<string> {
  return new Set((excluded ?? []).map((n) => n.toLowerCase()));
}

function canonicalCatalogName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function filterCatalogExcluded(names: string[], excluded: string[] | undefined): string[] {
  const hidden = excludedKeySet(excluded);
  return names.filter((n) => !hidden.has(n.toLowerCase()));
}

export function mergePresetStrings(stored: unknown, used: string[], excluded?: string[]): string[] {
  const base = Array.isArray(stored) ? (stored as string[]) : [];
  const seen = new Set(base.map((n) => n.toLowerCase()));
  const merged = [...base];
  for (const name of used) {
    const key = name.toLowerCase();
    if (!name.trim() || seen.has(key)) continue;
    seen.add(key);
    merged.push(name);
  }
  merged.sort((a, b) => a.localeCompare(b));
  return filterCatalogExcluded(merged, excluded);
}

type DefinitionCatalogRow = {
  id: string;
  entity: DimensionEntity;
  key: string;
  label: string;
  presets: unknown;
  catalogExcluded: string[];
};

export async function usageCountsForDefinition(
  db: PrismaService,
  definitionId: string,
): Promise<Map<string, { name: string; count: number }>> {
  const rows = await db.$queryRaw<Array<{ v: string; cnt: number }>>(Prisma.sql`
    SELECT v, COUNT(DISTINCT dv."recordId")::int AS cnt
    FROM "DimensionValue" dv, unnest(dv."values") AS v
    WHERE dv."definitionId" = ${definitionId}
    GROUP BY v
    ORDER BY v ASC
  `);
  const map = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    map.set(row.v.toLowerCase(), { name: row.v, count: row.cnt });
  }
  return map;
}

export async function catalogGroupForDefinition(
  db: PrismaService,
  row: DefinitionCatalogRow,
): Promise<DimensionCatalogGroupDto> {
  const usage = await usageCountsForDefinition(db, row.id);
  const excluded = excludedKeySet(row.catalogExcluded);
  const base = Array.isArray(row.presets) ? (row.presets as string[]) : [];
  const names = new Map<string, string>();
  for (const name of base) {
    const key = name.toLowerCase();
    if (!name.trim()) continue;
    names.set(key, name);
  }
  for (const { name } of usage.values()) {
    names.set(name.toLowerCase(), name);
  }
  for (const name of row.catalogExcluded) {
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, name);
  }
  const items: DimensionCatalogItemDto[] = [...names.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      recordCount: usage.get(name.toLowerCase())?.count ?? 0,
      hiddenFromSuggestions: excluded.has(name.toLowerCase()),
    }));
  return { entity: row.entity, key: row.key, label: row.label, items };
}

async function findDefinitionByKey(
  db: DimensionsDb,
  entity: DimensionEntity,
  key: string,
): Promise<DefinitionCatalogRow | null> {
  return db.dimensionDefinition.findFirst({
    where: { entity, key },
    select: { id: true, entity: true, key: true, label: true, presets: true, catalogExcluded: true },
  });
}

function removeFromPresetsJson(presets: unknown, nameKey: string): string[] {
  const base = Array.isArray(presets) ? (presets as string[]) : [];
  return base.filter((n) => n.toLowerCase() !== nameKey);
}

function canonicalNameForKey(key: string, rawName: string): string {
  return key === DIMENSION_TAG_KEY || key === CLIENT_DIMENSION_KEYS.tags ? tagName(rawName) : canonicalCatalogName(rawName);
}

export async function hideCatalogValue(db: DimensionsDb, entity: DimensionEntity, key: string, rawName: string): Promise<void> {
  const def = await findDefinitionByKey(db, entity, key);
  if (!def) return;
  const name = canonicalNameForKey(key, rawName);
  const nameKey = name.toLowerCase();
  const excluded = [...def.catalogExcluded];
  if (!excluded.some((n) => n.toLowerCase() === nameKey)) excluded.push(name);
  excluded.sort((a, b) => a.localeCompare(b));
  const presets = removeFromPresetsJson(def.presets, nameKey);
  await db.dimensionDefinition.update({
    where: { id: def.id },
    data: { catalogExcluded: excluded, presets },
  });
}

/** Add a value to tenant suggestion lists (Settings); restores if previously hidden. */
export async function addCatalogValue(
  db: PrismaService,
  entity: DimensionEntity,
  key: string,
  rawName: string,
): Promise<void> {
  const def = await findDefinitionByKey(db, entity, key);
  if (!def) return;
  const name = canonicalNameForKey(key, rawName);
  const nameKey = name.toLowerCase();
  if (!name) return;

  if (key === DIMENSION_TAG_KEY) {
    if (entity === 'TASK') await ensureTaskTags(db, [name]);
    else await ensureCrmTags(db, [name]);
  }

  await mergePresetsIntoDefinition(db, def.id, [name]);

  const excluded = def.catalogExcluded.filter((n) => n.toLowerCase() !== nameKey);
  if (excluded.length !== def.catalogExcluded.length) {
    await db.dimensionDefinition.update({ where: { id: def.id }, data: { catalogExcluded: excluded } });
  }
}

export async function restoreCatalogValue(db: DimensionsDb, entity: DimensionEntity, key: string, rawName: string): Promise<void> {
  const def = await findDefinitionByKey(db, entity, key);
  if (!def) return;
  const nameKey = rawName.trim().toLowerCase();
  const excluded = def.catalogExcluded.filter((n) => n.toLowerCase() !== nameKey);
  await db.dimensionDefinition.update({ where: { id: def.id }, data: { catalogExcluded: excluded } });
}

export async function purgeCatalogValue(db: PrismaService, entity: DimensionEntity, key: string, rawName: string): Promise<void> {
  const def = await findDefinitionByKey(db, entity, key);
  if (!def) return;
  const name = canonicalNameForKey(key, rawName);
  const nameKey = name.toLowerCase();
  const rows = await db.dimensionValue.findMany({
    where: { definitionId: def.id },
    select: { id: true, values: true },
  });
  for (const row of rows) {
    const next = row.values.filter((v) => v.toLowerCase() !== nameKey);
    if (next.length !== row.values.length) {
      await db.dimensionValue.update({ where: { id: row.id }, data: { values: next } });
    }
  }
  const presets = removeFromPresetsJson(def.presets, nameKey);
  const excluded = def.catalogExcluded.filter((n) => n.toLowerCase() !== nameKey);
  await db.dimensionDefinition.update({
    where: { id: def.id },
    data: { presets, catalogExcluded: excluded },
  });
}

/** Rename a catalog entry and update every stored dimension value. */
export async function renameCatalogValue(
  db: PrismaService,
  entity: DimensionEntity,
  key: string,
  fromRaw: string,
  toRaw: string,
): Promise<void> {
  const def = await findDefinitionByKey(db, entity, key);
  if (!def) return;
  const from = canonicalNameForKey(key, fromRaw);
  const to = canonicalNameForKey(key, toRaw);
  const fromKey = from.toLowerCase();
  const toKey = to.toLowerCase();
  if (!from || !to || fromKey === toKey) return;

  const rows = await db.dimensionValue.findMany({
    where: { definitionId: def.id },
    select: { id: true, values: true },
  });
  for (const row of rows) {
    const next = row.values.map((v) => (v.toLowerCase() === fromKey ? to : v));
    if (next.some((v, i) => v !== row.values[i])) {
      await db.dimensionValue.update({ where: { id: row.id }, data: { values: next } });
    }
  }

  const presets = (Array.isArray(def.presets) ? (def.presets as string[]) : []).map((p) =>
    p.toLowerCase() === fromKey ? to : p,
  );
  const excluded = def.catalogExcluded.map((p) => (p.toLowerCase() === fromKey ? to : p));
  await db.dimensionDefinition.update({
    where: { id: def.id },
    data: { presets, catalogExcluded: excluded },
  });

  if (key === DIMENSION_TAG_KEY) {
    const scope = entity === 'TASK' ? ('TASK' as const) : ('CRM' as const);
    const tag = await db.tag.findFirst({ where: { scope, nameKey: fromKey } });
    if (tag) {
      const clash = await db.tag.findFirst({ where: { scope, nameKey: toKey } });
      if (!clash) {
        await db.tag.update({ where: { id: tag.id }, data: { name: to, nameKey: toKey } });
      }
    }
  }
}

/** Grow tenant suggestion lists when staff add values (non-tag dimensions on CLIENT). */
export async function mergePresetsIntoDefinition(db: DimensionsDb, definitionId: string, names: string[]): Promise<void> {
  if (!names.length) return;
  const row = await db.dimensionDefinition.findUnique({ where: { id: definitionId }, select: { presets: true } });
  const existing = Array.isArray(row?.presets) ? (row!.presets as string[]) : [];
  const seen = new Set(existing.map((n) => n.toLowerCase()));
  const merged = [...existing];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(name);
  }
  merged.sort((a, b) => a.localeCompare(b));
  await db.dimensionDefinition.update({ where: { id: definitionId }, data: { presets: merged } });
}
