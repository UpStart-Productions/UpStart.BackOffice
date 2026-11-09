import { DEFAULT_DIMENSION_DEFINITIONS, DIMENSION_TAG_KEY, type DimensionEntity } from '@upstart/back-office/shared';
import { ensureCrmTags, tagName } from '../crm-tags/crm-tags.util';
import type { DimensionsDb } from './dimensions.util';
import { mergePresetsIntoDefinition } from './dimensions-catalog.util';
import { ensureTaskTags } from './tag-catalog.util';

/** Ensure every tenant has default definitions for an entity type. */
export async function ensureEntityDimensionDefinitions(
  db: DimensionsDb,
  tenantId: string,
  entity: DimensionEntity,
): Promise<void> {
  for (const def of DEFAULT_DIMENSION_DEFINITIONS[entity]) {
    await db.dimensionDefinition.upsert({
      where: { tenantId_entity_key: { tenantId, entity, key: def.key } },
      create: {
        tenantId,
        entity,
        key: def.key,
        label: def.label,
        sortOrder: def.sortOrder,
        presets: def.presets,
        searchInGlobal: def.searchInGlobal,
      },
      update: {
        label: def.label,
        sortOrder: def.sortOrder,
        searchInGlobal: def.searchInGlobal,
      },
    });
  }
}

export async function ensureClientDimensionDefinitions(db: DimensionsDb, tenantId: string): Promise<void> {
  await ensureEntityDimensionDefinitions(db, tenantId, 'CLIENT');
}

function normalizeDimensionValues(entity: DimensionEntity, key: string, names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const isTag = key === DIMENSION_TAG_KEY;
  for (const raw of names) {
    const name = isTag ? tagName(raw) : raw.trim().replace(/\s+/g, ' ');
    const dedupe = name.toLowerCase();
    if (!name || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/** Replace selected dimension keys on one record (undefined keys are left unchanged). */
export async function setRecordDimensions(
  db: DimensionsDb,
  tenantId: string,
  entity: DimensionEntity,
  recordId: string,
  patch: Record<string, string[] | undefined>,
): Promise<void> {
  await ensureEntityDimensionDefinitions(db, tenantId, entity);
  const defs = await db.dimensionDefinition.findMany({
    where: { entity },
    select: { id: true, key: true },
  });
  const byKey = new Map(defs.map((d) => [d.key, d.id]));

  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const definitionId = byKey.get(key);
    if (!definitionId) continue;
    const values = normalizeDimensionValues(entity, key, raw);
    if (key === DIMENSION_TAG_KEY && values.length) {
      if (entity === 'TASK') await ensureTaskTags(db, values);
      else await ensureCrmTags(db, values);
    }
    await db.dimensionValue.upsert({
      where: { definitionId_recordId: { definitionId, recordId } },
      create: { tenantId, definitionId, recordId, values },
      update: { values },
    });
    if (key !== DIMENSION_TAG_KEY && entity === 'CLIENT') {
      await mergePresetsIntoDefinition(db, definitionId, values);
    }
  }
}

export async function setClientDimensions(
  db: DimensionsDb,
  tenantId: string,
  clientId: string,
  patch: Record<string, string[] | undefined>,
): Promise<void> {
  await setRecordDimensions(db, tenantId, 'CLIENT', clientId, patch);
}

export async function getRecordDimensionValues(
  db: DimensionsDb,
  entity: DimensionEntity,
  recordId: string,
  key: string,
): Promise<string[]> {
  const def = await db.dimensionDefinition.findFirst({
    where: { entity, key },
    select: { id: true },
  });
  if (!def) return [];
  const row = await db.dimensionValue.findUnique({
    where: { definitionId_recordId: { definitionId: def.id, recordId } },
    select: { values: true },
  });
  return row?.values ?? [];
}
