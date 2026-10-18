import { describe, expect, it } from 'vitest';
import { decideFiling } from './filing.util';

describe('decideFiling', () => {
  it('files to the single client across matched contacts', () => {
    const d = decideFiling(
      [{ contactId: 'c1', clientIds: ['A'] }, { contactId: 'c2', clientIds: ['A'] }],
      [],
    );
    expect(d).toMatchObject({ status: 'FILED', clientId: 'A', reason: 'single-client' });
  });
  it('leaves it unfiled when contacts point at different clients', () => {
    const d = decideFiling([{ contactId: 'c1', clientIds: ['A'] }, { contactId: 'c2', clientIds: ['B'] }], []);
    expect(d).toMatchObject({ status: 'UNFILED', clientId: null, reason: 'ambiguous-clients' });
  });
  it('files to a lead when there is no client but exactly one lead', () => {
    const d = decideFiling([{ contactId: 'c1', clientIds: [] }], ['L1']);
    expect(d).toMatchObject({ status: 'FILED', leadId: 'L1', reason: 'lead-match' });
  });
  it('prefers a client over a lead', () => {
    const d = decideFiling([{ contactId: 'c1', clientIds: ['A'] }], ['L1']);
    expect(d).toMatchObject({ clientId: 'A', leadId: null });
  });
  it('is unfiled with a useful reason otherwise', () => {
    expect(decideFiling([{ contactId: 'c1', clientIds: [] }], []).reason).toBe('no-client-link');
    expect(decideFiling([], []).reason).toBe('no-match');
    expect(decideFiling([], ['L1', 'L2']).status).toBe('UNFILED');
  });
});
