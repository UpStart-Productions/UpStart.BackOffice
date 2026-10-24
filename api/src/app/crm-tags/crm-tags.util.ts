import type { Prisma } from '@prisma/client';

/** What the CRM tag helpers need from a Prisma client or transaction. */
export type CrmTagsDb = Pick<Prisma.TransactionClient, 'tag' | 'clientTag' | 'contactTag'>;

/** Display form: trimmed, inner whitespace collapsed. */
export const tagName = (name: string) => name.trim().replace(/\s+/g, ' ');
/** Case-insensitive key, unique per tenant and scope. */
export const tagKey = (name: string) => tagName(name).toLowerCase();

/** Prisma include that returns an entity's tag names. */
export const tagsInclude = { tags: { select: { tag: { select: { name: true } } } } } as const;

/** Flatten `{ tags: [{ tag: { name } }] }` to sorted names. */
export function tagNames(rows: { tag: { name: string } }[] | undefined): string[] {
  return (rows ?? []).map((r) => r.tag.name).sort((a, b) => a.localeCompare(b));
}

/** Find or create CRM tags by name (case-insensitive; the first spelling wins). Returns ids. */
export async function ensureCrmTags(db: CrmTagsDb, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = tagName(raw);
    const nameKey = name.toLowerCase();
    if (!name || seen.has(nameKey)) continue;
    seen.add(nameKey);
    const existing = await db.tag.findFirst({ where: { scope: 'CRM', nameKey }, select: { id: true } });
    ids.push(existing?.id ?? (await db.tag.create({ data: { name, nameKey, scope: 'CRM' }, select: { id: true } })).id);
  }
  return ids;
}

/** Replace an organization's tags with exactly these names. */
export async function setClientTags(db: CrmTagsDb, clientId: string, names: string[]): Promise<void> {
  const tagIds = await ensureCrmTags(db, names);
  await db.clientTag.deleteMany({ where: { clientId, tagId: { notIn: tagIds } } });
  for (const tagId of tagIds) {
    await db.clientTag.upsert({ where: { clientId_tagId: { clientId, tagId } }, create: { clientId, tagId }, update: {} });
  }
}

/** Replace a person's tags with exactly these names. */
export async function setContactTags(db: CrmTagsDb, contactId: string, names: string[]): Promise<void> {
  const tagIds = await ensureCrmTags(db, names);
  await db.contactTag.deleteMany({ where: { contactId, tagId: { notIn: tagIds } } });
  for (const tagId of tagIds) {
    await db.contactTag.upsert({ where: { contactId_tagId: { contactId, tagId } }, create: { contactId, tagId }, update: {} });
  }
}

/** Prisma `where` fragment: has a CRM tag with this name (case-insensitive). */
export function hasTagWhere(name: string | undefined) {
  const key = name ? tagKey(name) : '';
  return key ? { tags: { some: { tag: { nameKey: key, scope: 'CRM' as const } } } } : {};
}
