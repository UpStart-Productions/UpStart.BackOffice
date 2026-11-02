import { describe, expect, it } from 'vitest';
import { withTenant } from './prisma-tenant.extension';

describe('withTenant', () => {
  it('stamps a plain tenantId and leaves plain IDs alone, even with nested child creates', () => {
    const data = withTenant(
      'Lead',
      {
        organization: 'Org',
        pipelineId: 'pipeline-1',
        stageId: 'stage-1',
        artifacts: { create: [{ type: 'NOTE', title: 't', content: 'c' }] },
      },
      'default',
    );
    expect(data).toMatchObject({ tenantId: 'default', pipelineId: 'pipeline-1', stageId: 'stage-1' });
    expect(data.tenant).toBeUndefined();
    expect(data.pipeline).toBeUndefined();
    expect(data.artifacts.create[0]).toMatchObject({ tenantId: 'default' });
  });

  it('stamps an Interaction with participants the same way', () => {
    const data = withTenant(
      'Interaction',
      {
        type: 'CALL',
        clientId: 'client-1',
        loggedByUserId: 'user-1',
        participants: { create: [{ email: 'a@b.c', role: 'ATTENDEE', userId: 'user-1', contactId: 'contact-1' }] },
      },
      'default',
    );
    expect(data).toMatchObject({ tenantId: 'default', clientId: 'client-1', loggedByUserId: 'user-1' });
    expect(data.participants.create[0]).toMatchObject({ tenantId: 'default', userId: 'user-1' });
  });

  it('never trusts a caller-supplied tenant', () => {
    const data = withTenant('Lead', { organization: 'Org', tenantId: 'other', tenant: { connect: { id: 'other' } } }, 'default');
    expect(data.tenantId).toBe('default');
    expect(data.tenant).toBeUndefined();
  });
});
