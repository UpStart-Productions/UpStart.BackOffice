import { LEGACY_FOCUS_ENUM_TO_LABEL } from '@upstart/back-office/shared';
import type { Prisma } from '@prisma/client';
import { normalizeEmail } from '../communications/email-address.util';

/**
 * The email to put on a new Contact: null when another Contact already has it (emails are unique per tenant).
 */
export async function freeContactEmail(
  db: Pick<Prisma.TransactionClient, 'contactEmail'>,
  email: string | null,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const taken = await db.contactEmail.findFirst({ where: { email: normalized }, select: { id: true } });
  return taken ? null : normalized;
}

/** First/last name from free-text; falls back to the email local part. */
export function splitPersonName(
  name: string | null | undefined,
  email: string | null,
): { firstName: string; lastName: string | null } | null {
  const trimmed = (name ?? '').trim();
  if (trimmed) {
    const [first, ...rest] = trimmed.split(/\s+/);
    return { firstName: first, lastName: rest.length ? rest.join(' ') : null };
  }
  const normalized = normalizeEmail(email);
  if (normalized) return { firstName: normalized.split('@')[0], lastName: null };
  return null;
}

type LeadWithLinks = {
  primaryContact: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  email: string | null;
  phone: string | null;
  contactRole: string | null;
  contact?: {
    firstName: string;
    lastName: string | null;
    phone: string | null;
    title: string | null;
    emails: { email: string; isPrimary: boolean }[];
    accountLinks?: { clientId: string; role: string | null }[];
  } | null;
};

/** Person name and email for display; organization email/phone stay on the lead. */
export function leadPersonView(lead: LeadWithLinks & { clientId?: string | null }) {
  const c = lead.contact;
  if (!c) {
    return {
      primaryContact: lead.primaryContact,
      contactFirstName: lead.contactFirstName ?? null,
      contactLastName: lead.contactLastName ?? null,
      primaryContactEmail: null as string | null,
      email: lead.email,
      phone: lead.phone,
    };
  }
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const primary = c.emails.find((e) => e.isPrimary) ?? c.emails[0];
  const roleLink =
    lead.clientId && c.accountLinks?.find((l) => l.clientId === lead.clientId);
  return {
    primaryContact: name || lead.primaryContact,
    // A linked person's own name (the card's fields show it, read-only).
    contactFirstName: c.firstName,
    contactLastName: c.lastName,
    primaryContactEmail: primary?.email ?? null,
    contactRole: roleLink?.role ?? c.title ?? lead.contactRole,
    email: lead.email,
    phone: lead.phone,
  };
}

/** Keep legacy warmConnection text in sync when a warm-connection person is linked. */
export function warmConnectionLabel(
  warmConnection: string | null,
  contact: { firstName: string; lastName: string | null } | null | undefined,
): string | null {
  if (contact) {
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || warmConnection;
  }
  return warmConnection;
}

/** What the lead helpers need from a Prisma client or transaction. */
export type LeadLinksDb = Pick<
  Prisma.TransactionClient,
  'client' | 'contact' | 'contactAccount' | 'lead'
>;

const ORG_CATEGORY_VALUES = new Set([
  'RECOVERY', 'FAMILY', 'YOUTH', 'FAITH', 'HEALTH', 'DISABILITY', 'EDUCATION',
  'JOBS_WORKFORCE', 'PETS', 'FUNDING', 'HUNGER', 'VIOLENCE', 'ACTIVITIES', 'OTHER',
]);

function isOrgCategoryEnum(value: string): value is import('@prisma/client').OrgCategory {
  return ORG_CATEGORY_VALUES.has(value);
}

/**
 * The account category for a card's category. Cards now use Focus areas labels ("Jobs / Workforce"); older ones
 * used codes ("JOBS_WORKFORCE"). Either maps to the code; anything else is OTHER. Empty is null.
 */
export function orgCategoryFor(value: string | null | undefined): import('@prisma/client').OrgCategory | null {
  const v = value?.trim();
  if (!v) return null;
  if (isOrgCategoryEnum(v)) return v;
  const code = Object.entries(LEGACY_FOCUS_ENUM_TO_LABEL).find(([, label]) => label.toLowerCase() === v.toLowerCase())?.[0];
  return code && isOrgCategoryEnum(code) ? code : 'OTHER';
}

type PersonEdit = {
  organization?: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
};

/** Push organization field edits into a linked Client record (when the card was promoted or linked). */
export async function applyLeadEditsToLinks(
  db: LeadLinksDb,
  lead: { id: string; clientId: string | null },
  previousOrganization: string,
  edit: PersonEdit,
): Promise<void> {
  if (!lead.clientId) return;

  const clientData: Prisma.ClientUpdateInput = {};
  if (edit.organization !== undefined && edit.organization.trim()) {
    clientData.name = edit.organization.trim();
  }
  if (edit.email !== undefined) {
    clientData.email = edit.email?.trim() || null;
  }
  if (edit.phone !== undefined) {
    clientData.phone = edit.phone?.trim() || null;
  }
  if (edit.website !== undefined) {
    clientData.website = edit.website?.trim() || null;
  }
  if (edit.category !== undefined) {
    clientData.category = orgCategoryFor(edit.category);
  }

  if (Object.keys(clientData).length === 0) return;

  if (edit.organization !== undefined && edit.organization.trim()) {
    await db.client.updateMany({
      where: { id: lead.clientId, name: previousOrganization },
      data: clientData,
    });
  } else {
    await db.client.update({ where: { id: lead.clientId }, data: clientData });
  }
}
