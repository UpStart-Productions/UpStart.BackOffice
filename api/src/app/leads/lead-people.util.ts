import type { Prisma } from '@prisma/client';
import { contactSelectForSummary } from './lead-contacts.select';

export type LeadPeopleDb = Pick<
  Prisma.TransactionClient,
  'lead' | 'leadContact' | 'contact'
>;

/** All contact ids tied to a card (roster, primary, warm). */
export async function leadContactIds(db: LeadPeopleDb, leadId: string): Promise<Set<string>> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { primaryContactId: true, warmConnectionContactId: true },
  });
  if (!lead) return new Set();
  const rows = await db.leadContact.findMany({ where: { leadId }, select: { contactId: true } });
  const ids = new Set(rows.map((r) => r.contactId));
  if (lead.primaryContactId) ids.add(lead.primaryContactId);
  if (lead.warmConnectionContactId) ids.add(lead.warmConnectionContactId);
  return ids;
}

export async function listLeadPeople(db: LeadPeopleDb, leadId: string) {
  const ids = [...(await leadContactIds(db, leadId))];
  if (ids.length === 0) return [];
  return db.contact.findMany({
    where: { id: { in: ids } },
    ...contactSelectForSummary,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function linkLeadPerson(db: LeadPeopleDb, leadId: string, contactId: string) {
  await db.leadContact.upsert({
    where: { leadId_contactId: { leadId, contactId } },
    create: { leadId, contactId },
    update: {},
  });
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { primaryContactId: true } });
  if (!lead?.primaryContactId) {
    await db.lead.update({ where: { id: leadId }, data: { primaryContactId: contactId } });
  }
}

export async function unlinkLeadPerson(db: LeadPeopleDb, leadId: string, contactId: string) {
  await db.leadContact.deleteMany({ where: { leadId, contactId } });
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { primaryContactId: true, warmConnectionContactId: true },
  });
  if (!lead) return;
  const patch: Prisma.LeadUncheckedUpdateInput = {};
  if (lead.primaryContactId === contactId) patch.primaryContactId = null;
  if (lead.warmConnectionContactId === contactId) {
    patch.warmConnectionContactId = null;
    patch.warmConnection = null;
  }
  if (Object.keys(patch).length) await db.lead.update({ where: { id: leadId }, data: patch });
}
