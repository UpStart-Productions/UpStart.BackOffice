import type { Prisma } from '@prisma/client';
import { CLIENT_DIMENSION_KEYS, DIMENSION_TAG_KEY } from '@upstart/back-office/shared';
import { setClientDimensions, setRecordDimensions } from '../dimensions/dimensions-record.util';

/** Tag catalog create/lookup (organizations, people, and task tag colors). */
export type TagCatalogDb = Pick<Prisma.TransactionClient, 'tag'>;

/** What tag dimension helpers need from a Prisma client or transaction. */
export type CrmTagsDb = TagCatalogDb &
  Pick<Prisma.TransactionClient, 'dimensionDefinition' | 'dimensionValue'>;

/** Display form: trimmed, inner whitespace collapsed. */
export const tagName = (name: string) => name.trim().replace(/\s+/g, ' ');
/** Case-insensitive key, unique per tenant and scope. */
export const tagKey = (name: string) => tagName(name).toLowerCase();

/** @deprecated Junction tags removed; load CONTACT dimension values instead. */
export const tagsInclude = {} as const;

/** Find or create CRM tags by name (case-insensitive; the first spelling wins). Returns ids. */
export async function ensureCrmTags(db: TagCatalogDb, names: string[]): Promise<string[]> {
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

/** Replace an organization's tags dimension with exactly these names. */
export async function setClientTags(
  db: CrmTagsDb,
  clientId: string,
  names: string[],
  tenantId: string,
): Promise<void> {
  await setClientDimensions(db, tenantId, clientId, { [CLIENT_DIMENSION_KEYS.tags]: names });
}

/** Replace a person's tags dimension with exactly these names. */
export async function setContactTags(
  db: CrmTagsDb,
  contactId: string,
  names: string[],
  tenantId: string,
): Promise<void> {
  await setRecordDimensions(db, tenantId, 'CONTACT', contactId, { [DIMENSION_TAG_KEY]: names });
}

/** @deprecated Use `contactIdsWithTagName` with `{ id: { in: ids } }`. */
export function hasContactTagWhere(_name: string | undefined): Prisma.ContactWhereInput {
  return {};
}

/** @deprecated Use hasContactTagWhere for people or clientIdsWithTagName for organizations. */
export const hasTagWhere = hasContactTagWhere;
