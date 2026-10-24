import type { Prisma } from '@prisma/client';
import { normalizeEmail } from '../communications/email-address.util';

/** What the lead helpers need from a Prisma client or transaction. */
export type LeadLinksDb = Pick<
  Prisma.TransactionClient,
  'client' | 'contact' | 'contactEmail' | 'contactAccount' | 'lead'
>;

/** First/last name from the free-text person on a lead; falls back to the email's local part. */
export function splitPersonName(
  name: string | null | undefined,
  email: string | null,
): { firstName: string; lastName: string | null } | null {
  const trimmed = (name ?? '').trim();
  if (trimmed) {
    const [first, ...rest] = trimmed.split(/\s+/);
    return { firstName: first, lastName: rest.length ? rest.join(' ') : null };
  }
  if (email) return { firstName: email.split('@')[0], lastName: null };
  return null;
}

/**
 * Make sure a lead has an Account and (when it names someone) a Contact, and link them.
 * Idempotent: existing links are kept. A new Account is a Prospect; an Account with the same
 * name (case-insensitive) is reused rather than duplicated.
 */
export async function ensureLeadLinks(
  db: LeadLinksDb,
  leadId: string,
): Promise<{ clientId: string; primaryContactId: string | null }> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  let clientId = lead.clientId ?? lead.convertedClientId;
  if (!clientId) {
    const name = lead.organization.trim();
    const existing = await db.client.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    clientId =
      existing?.id ??
      (
        await db.client.create({
          data: {
            name,
            email: normalizeEmail(lead.email) ?? undefined,
            phone: lead.phone?.trim() || undefined,
            website: lead.website ?? undefined,
            category: lead.category ?? undefined,
            journey: 'PROSPECT',
            lastContactAt: lead.lastContactDate ?? undefined,
          },
          select: { id: true },
        })
      ).id;
  }

  let contactId = lead.primaryContactId;
  if (!contactId) {
    const email = normalizeEmail(lead.email);
    const person = splitPersonName(lead.primaryContact, email);
    if (person) {
      const byEmail = email
        ? await db.contactEmail.findFirst({ where: { email }, select: { contactId: true } })
        : null;
      contactId =
        byEmail?.contactId ??
        (
          await db.contact.create({
            data: {
              firstName: person.firstName,
              lastName: person.lastName,
              phone: lead.phone?.trim() || undefined,
              lastContactAt: lead.lastContactDate ?? undefined,
              ...(email ? { emails: { create: { email, isPrimary: true } } } : {}),
            },
            select: { id: true },
          })
        ).id;
    }
  }
  if (contactId) {
    await db.contactAccount.upsert({
      where: { contactId_clientId: { contactId, clientId } },
      create: { contactId, clientId, role: lead.contactRole?.trim() || null, isPrimary: true },
      update: {},
    });
  }

  if (clientId !== lead.clientId || contactId !== lead.primaryContactId) {
    await db.lead.update({ where: { id: leadId }, data: { clientId, primaryContactId: contactId } });
  }
  return { clientId, primaryContactId: contactId };
}

type PersonEdit = {
  organization?: string;
  primaryContact?: string;
  contactRole?: string;
  email?: string;
  phone?: string;
};

/**
 * Push edits made on the lead form into the records that own the data: the person goes to the
 * Contact (name, phone, extra email, role on the account) and a rename carries to the Account when
 * the Account still has the lead's old name. Call after ensureLeadLinks on update.
 */
export async function applyLeadEditsToLinks(
  db: LeadLinksDb,
  lead: { id: string; clientId: string | null; primaryContactId: string | null },
  previousOrganization: string,
  edit: PersonEdit,
): Promise<void> {
  if (lead.clientId && edit.organization !== undefined && edit.organization.trim()) {
    await db.client.updateMany({
      where: { id: lead.clientId, name: previousOrganization },
      data: { name: edit.organization.trim() },
    });
  }
  const contactId = lead.primaryContactId;
  if (!contactId) return;

  if (edit.primaryContact !== undefined && edit.primaryContact.trim()) {
    const person = splitPersonName(edit.primaryContact, null);
    if (person) {
      await db.contact.update({
        where: { id: contactId },
        data: { firstName: person.firstName, lastName: person.lastName },
      });
    }
  }
  if (edit.phone !== undefined) {
    await db.contact.update({ where: { id: contactId }, data: { phone: edit.phone.trim() || null } });
  }
  const email = normalizeEmail(edit.email);
  if (email) {
    const existing = await db.contactEmail.findFirst({ where: { email }, select: { contactId: true } });
    if (!existing) {
      await db.contactEmail.updateMany({ where: { contactId }, data: { isPrimary: false } });
      await db.contactEmail.create({ data: { contactId, email, isPrimary: true } });
    } else if (existing.contactId === contactId) {
      await db.contactEmail.updateMany({ where: { contactId }, data: { isPrimary: false } });
      await db.contactEmail.updateMany({ where: { contactId, email }, data: { isPrimary: true } });
    }
  }
  if (edit.contactRole !== undefined && lead.clientId) {
    await db.contactAccount.updateMany({
      where: { contactId, clientId: lead.clientId },
      data: { role: edit.contactRole.trim() || null },
    });
  }
}

type LeadWithLinks = {
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  contactRole: string | null;
  contact?: {
    firstName: string;
    lastName: string | null;
    phone: string | null;
    emails: { email: string; isPrimary: boolean }[];
  } | null;
};

/** Person fields for display: the Contact's values when linked, else the lead's legacy text. */
export function leadPersonView(lead: LeadWithLinks) {
  const c = lead.contact;
  if (!c) return { primaryContact: lead.primaryContact, email: lead.email, phone: lead.phone };
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const primary = c.emails.find((e) => e.isPrimary) ?? c.emails[0];
  return { primaryContact: name || lead.primaryContact, email: primary?.email ?? lead.email, phone: c.phone ?? lead.phone };
}
