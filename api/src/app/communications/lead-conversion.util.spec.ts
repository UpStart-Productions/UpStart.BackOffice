import { describe, expect, it, vi } from 'vitest';
import { moveLeadCommunicationsToClient } from './lead-conversion.util';

describe('moveLeadCommunicationsToClient', () => {
  it('adds the client to the lead\'s interactions and links their outside contacts', async () => {
    const tx = {
      interaction: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      interactionParticipant: {
        findMany: vi.fn().mockResolvedValue([{ contactId: 'k1' }, { contactId: 'k1' }, { contactId: 'k2' }]),
      },
      contactAccount: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const res = await moveLeadCommunicationsToClient(tx as never, 'lead-1', 'client-1');
    expect(tx.interaction.updateMany).toHaveBeenCalledWith({
      where: { leadId: 'lead-1' },
      data: { clientId: 'client-1', status: 'FILED' },
    });
    expect(tx.interactionParticipant.findMany.mock.calls[0][0].where).toEqual({
      interaction: { leadId: 'lead-1' }, contactId: { not: null }, userId: null,
    });
    expect(tx.contactAccount.createMany).toHaveBeenCalledWith({
      data: [{ contactId: 'k1', clientId: 'client-1' }, { contactId: 'k2', clientId: 'client-1' }],
      skipDuplicates: true,
    });
    expect(res).toEqual({ interactions: 3, contactsLinked: 2 });
  });

  it('skips linking when there are no contacts', async () => {
    const tx = {
      interaction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      interactionParticipant: { findMany: vi.fn().mockResolvedValue([]) },
      contactAccount: { createMany: vi.fn() },
    };
    expect(await moveLeadCommunicationsToClient(tx as never, 'l', 'c')).toEqual({ interactions: 0, contactsLinked: 0 });
    expect(tx.contactAccount.createMany).not.toHaveBeenCalled();
  });
});
