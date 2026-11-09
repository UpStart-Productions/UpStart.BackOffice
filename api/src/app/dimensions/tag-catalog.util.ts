import type { TagScope } from '@prisma/client';
import { OPTION_COLORS } from '../task-manager/task-fields.util';
import type { TagCatalogDb } from '../crm-tags/crm-tags.util';
import { tagKey, tagName } from '../crm-tags/crm-tags.util';

const tagSelect = { id: true, name: true, color: true } as const;

/** Find or create TASK-scoped tags (colored) by name. */
export async function ensureTaskTags(db: TagCatalogDb, names: string[]): Promise<void> {
  const count = await db.tag.count({ where: { scope: 'TASK' } });
  let idx = count;
  for (const raw of names) {
    const name = tagName(raw);
    const nameKey = tagKey(name);
    if (!name) continue;
    const existing = await db.tag.findFirst({ where: { scope: 'TASK', nameKey }, select: { id: true } });
    if (existing) continue;
    await db.tag.create({
      data: { name, nameKey, scope: 'TASK', color: OPTION_COLORS[idx % OPTION_COLORS.length] },
    });
    idx++;
  }
}

/** Resolve stored tag names to Tag rows (id, name, color) for a scope. */
export async function tagsByNames(
  db: TagCatalogDb,
  scope: TagScope,
  names: string[],
): Promise<Array<{ id: string; name: string; color: string | null }>> {
  if (!names.length) return [];
  const keys = names.map((n) => tagKey(n));
  const rows = await db.tag.findMany({
    where: { scope, nameKey: { in: keys } },
    select: tagSelect,
    orderBy: { name: 'asc' },
  });
  const byKey = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
  const out: Array<{ id: string; name: string; color: string | null }> = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const key = tagKey(raw);
    const row = byKey.get(key);
    const name = row?.name ?? tagName(raw);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(row ?? { id: `name:${key}`, name, color: null });
  }
  return out;
}
