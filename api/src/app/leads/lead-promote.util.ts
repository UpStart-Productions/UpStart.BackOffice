import type { AccountJourney, Prisma } from '@prisma/client';
import { normalizeEmail } from '../communications/email-address.util';
import { setClientTags } from '../crm-tags/crm-tags.util';
import { leadContactIds } from './lead-people.util';

const ORG_CATEGORY_VALUES = new Set([
  'RECOVERY', 'FAMILY', 'YOUTH', 'FAITH', 'HEALTH', 'DISABILITY', 'EDUCATION',
  'JOBS_WORKFORCE', 'PETS', 'FUNDING', 'HUNGER', 'VIOLENCE', 'ACTIVITIES', 'OTHER',
]);

function isOrgCategoryEnum(value: string): value is import('@prisma/client').OrgCategory {
  return ORG_CATEGORY_VALUES.has(value);
}

export type PromoteDb = Pick<
  Prisma.TransactionClient,
  | 'lead'
  | 'client'
  | 'contact'
  | 'contactAccount'
  | 'leadContact'
  | 'artifact'
  | 'clientTag'
  | 'contactTag'
  | 'tag'
>;

/** Copy card people onto an organization and set primary on the account link. */
export async function linkLeadPeopleToClient(db: PromoteDb, leadId: string, clientId: string) {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { primaryContactId: true },
  });
  const ids = await leadContactIds(db, leadId);
  for (const contactId of ids) {
    await db.contactAccount.upsert({
      where: { contactId_clientId: { contactId, clientId } },
      create: {
        contactId,
        clientId,
        isPrimary: contactId === lead.primaryContactId,
      },
      update: {},
    });
  }
}

/**
 * Create or update the organization for a pipeline card (Make client / Make partner / link then promote).
 */
export async function promoteLeadToOrganization(
  db: PromoteDb,
  leadId: string,
  opts: { journey: AccountJourney; tags?: string[]; code?: string },
): Promise<string> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  let clientId = lead.clientId;
  if (!clientId) {
    clientId = (
      await db.client.create({
        data: {
          name: lead.organization.trim(),
          email: normalizeEmail(lead.email) ?? undefined,
          phone: lead.phone?.trim() || undefined,
          website: lead.website ?? undefined,
          category: lead.category && isOrgCategoryEnum(lead.category) ? lead.category : undefined,
          journey: opts.journey,
          ...(opts.code ? { code: opts.code.toUpperCase() } : {}),
          lastContactAt: lead.lastContactDate ?? undefined,
        },
        select: { id: true },
      })
    ).id;
  } else {
    await db.client.update({
      where: { id: clientId },
      data: {
        journey: opts.journey,
        ...(opts.code ? { code: opts.code.toUpperCase() } : {}),
      },
    });
  }
  if (opts.tags?.length) await setClientTags(db, clientId, opts.tags);
  await linkLeadPeopleToClient(db, leadId, clientId);
  await db.lead.update({ where: { id: leadId }, data: { clientId } });
  await db.artifact.updateMany({ where: { leadId, clientId: null }, data: { clientId } });
  return clientId;
}
