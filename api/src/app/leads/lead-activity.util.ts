import type { Prisma } from '@prisma/client';

/**
 * Posts a note on a card's Activity timeline (an internal NOTE interaction filed to the lead),
 * for service-to-service callers that have no signed-in user.
 */
export function createLeadActivityNote(
  tx: Prisma.TransactionClient,
  lead: { id: string; clientId: string | null },
  subject: string,
  bodyText: string,
) {
  return tx.interaction.create({
    data: {
      type: 'NOTE',
      direction: 'INTERNAL',
      occurredAt: new Date(),
      subject: subject.slice(0, 300),
      bodyText,
      source: 'MANUAL',
      status: 'FILED',
      leadId: lead.id,
      clientId: lead.clientId,
    },
  });
}
