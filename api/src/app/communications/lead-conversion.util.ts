import type { Prisma } from '@prisma/client';

type Tx = Pick<Prisma.TransactionClient, 'interaction' | 'interactionParticipant' | 'contactAccount'>;

/**
 * When a lead becomes a client, its communication history should show on the client too.
 * Interactions keep their leadId (history on the lead stays) and gain the clientId; the outside
 * contacts on them are linked to the client so future mail files itself. Call inside the
 * conversion transaction.
 */
export async function moveLeadCommunicationsToClient(
  tx: Tx,
  leadId: string,
  clientId: string,
): Promise<{ interactions: number; contactsLinked: number }> {
  const moved = await tx.interaction.updateMany({
    where: { leadId },
    data: { clientId, status: 'FILED' },
  });
  const participants = await tx.interactionParticipant.findMany({
    where: { interaction: { leadId }, contactId: { not: null }, userId: null },
    select: { contactId: true },
  });
  const contactIds = [...new Set(participants.map((p) => p.contactId).filter((c): c is string => !!c))];
  const linked = contactIds.length
    ? await tx.contactAccount.createMany({
        data: contactIds.map((contactId) => ({ contactId, clientId })),
        skipDuplicates: true,
      })
    : { count: 0 };
  return { interactions: moved.count, contactsLinked: linked.count };
}
