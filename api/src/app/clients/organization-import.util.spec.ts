import { describe, expect, it } from 'vitest';
import { parseJourney, parseOrganizationImportFromBuffer } from './organization-import.util';

describe('parseJourney', () => {
  it('maps client', () => {
    expect(parseJourney('Client')).toBe('CLIENT');
  });

  it('defaults to partner/other', () => {
    expect(parseJourney('Partner')).toBe('NONE');
    expect(parseJourney('Client Services')).toBe('NONE');
    expect(parseJourney('')).toBe('NONE');
  });
});

describe('parseOrganizationImportFromBuffer', () => {
  it('parses csv with headers', () => {
    const csv = `Organization,Email,Status\nAcme Inc,hello@acme.com,Client\nPartner Co,,`;
    const rows = parseOrganizationImportFromBuffer(Buffer.from(csv, 'utf-8'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Acme Inc', email: 'hello@acme.com', journey: 'CLIENT' });
    expect(rows[1].journey).toBe('NONE');
  });
});
