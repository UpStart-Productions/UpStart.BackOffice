import { describe, expect, it } from 'vitest';
import { withTenant } from './prisma-tenant.extension';

describe('withTenant checked creates', () => {
  it('turns scalar foreign keys into relation connects when a nested relation is present', () => {
    const data = withTenant(
      'Interaction',
      {
        type: 'CALL',
        clientId: 'client-1',
        leadId: null,
        loggedByUserId: 'user-1',
        participants: { create: [{ email: 'a@b.c', role: 'ATTENDEE', userId: 'user-1', contactId: 'contact-1' }] },
      },
      'default',
    );

    expect(data.tenant).toEqual({ connect: { id: 'default' } });
    expect(data.client).toEqual({ connect: { id: 'client-1' } });
    expect(data.loggedBy).toEqual({ connect: { id: 'user-1' } });
    expect(data.clientId).toBeUndefined();
    expect(data.leadId).toBeUndefined();
    expect(data.loggedByUserId).toBeUndefined();
    expect(data.lead).toBeUndefined();
    expect(data.participants.create[0]).toMatchObject({
      tenantId: 'default',
      userId: 'user-1',
      contactId: 'contact-1',
    });
  });

  it('keeps scalar foreign keys when the create has no nested relations', () => {
    const data = withTenant('Interaction', { type: 'NOTE', clientId: 'client-1' }, 'default');
    expect(data.tenantId).toBe('default');
    expect(data.clientId).toBe('client-1');
    expect(data.client).toBeUndefined();
  });
});
