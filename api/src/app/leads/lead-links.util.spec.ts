import { describe, expect, it } from 'vitest';
import { leadPersonView, splitPersonName } from './lead-links.util';

describe('splitPersonName', () => {
  it('splits first and rest', () => {
    expect(splitPersonName('Ana Lee Jr', null)).toEqual({ firstName: 'Ana', lastName: 'Lee Jr' });
  });
  it('single name has no last name', () => {
    expect(splitPersonName('Cher', null)).toEqual({ firstName: 'Cher', lastName: null });
  });
  it('falls back to the email local part', () => {
    expect(splitPersonName('  ', 'solo@e.com')).toEqual({ firstName: 'solo', lastName: null });
  });
  it('returns null with nothing to go on', () => {
    expect(splitPersonName(null, null)).toBeNull();
  });
});

describe('leadPersonView', () => {
  const lead = { primaryContact: 'Old Name', email: 'old@x.com', phone: '111', contactRole: null };
  it('uses the legacy text when no contact is linked', () => {
    expect(leadPersonView({ ...lead, contact: null })).toEqual({
      primaryContact: 'Old Name', email: 'old@x.com', phone: '111',
    });
  });
  it('prefers the linked contact, primary email first', () => {
    const view = leadPersonView({
      ...lead,
      contact: {
        firstName: 'New', lastName: 'Name', phone: '222',
        emails: [{ email: 'b@x.com', isPrimary: false }, { email: 'a@x.com', isPrimary: true }],
      },
    });
    expect(view).toEqual({ primaryContact: 'New Name', email: 'a@x.com', phone: '222' });
  });
});
