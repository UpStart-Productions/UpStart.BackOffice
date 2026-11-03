import { describe, expect, it } from 'vitest';
import { leadPersonView } from './lead-links.util';

describe('leadPersonView', () => {
  const lead = { primaryContact: 'Old Name', email: 'old@x.com', phone: '111', contactRole: null };
  it('uses the legacy text when no contact is linked', () => {
    expect(leadPersonView({ ...lead, contact: null })).toEqual({
      primaryContact: 'Old Name',
      primaryContactEmail: null,
      email: 'old@x.com',
      phone: '111',
    });
  });
  it('uses contact name and email for the person, org email/phone on the lead', () => {
    const view = leadPersonView({
      ...lead,
      clientId: 'acct-1',
      contact: {
        firstName: 'New', lastName: 'Name', phone: '222', title: null,
        emails: [{ email: 'b@x.com', isPrimary: false }, { email: 'a@x.com', isPrimary: true }],
        accountLinks: [{ clientId: 'acct-1', role: 'Director' }],
      },
    });
    expect(view).toEqual({
      primaryContact: 'New Name',
      primaryContactEmail: 'a@x.com',
      contactRole: 'Director',
      email: 'old@x.com',
      phone: '111',
    });
  });
});
