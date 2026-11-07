import { describe, expect, it } from 'vitest';
import { parsePeopleImportCsv, splitPersonName } from './people-import-csv.util';

describe('splitPersonName', () => {
  it('splits Last, First', () => {
    expect(splitPersonName('Doe, Jane')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('splits First Last', () => {
    expect(splitPersonName('Jane Doe')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('strips Dr prefix', () => {
    expect(splitPersonName('Dr. Sam Taylor')).toEqual({ firstName: 'Sam', lastName: 'Taylor' });
  });
});

describe('parsePeopleImportCsv', () => {
  it('maps columns regardless of order', () => {
    const csv = `Email,Name,Organization,Phone\njane@x.org,"Doe, Jane",Acme Inc,555-0100`;
    const rows = parsePeopleImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@x.org',
      organization: 'Acme Inc',
      phone: '555-0100',
    });
  });

  it('uses separate first and last columns', () => {
    const csv = `First name,Last name,Work email\nSam,Taylor,sam@test.com`;
    const rows = parsePeopleImportCsv(csv);
    expect(rows[0].firstName).toBe('Sam');
    expect(rows[0].lastName).toBe('Taylor');
    expect(rows[0].email).toBe('sam@test.com');
  });

  it('finds a header row after title rows and tolerates common typos', () => {
    const csv = [
      'Riverbend Arts Council - Board',
      '',
      'Full Name,Emal Adress,Phoone,Organisation,Title',
      'Jane Whitaker,jane@example.com,5035550142,Riverbend Arts,Board Chair',
    ].join('\n');
    const rows = parsePeopleImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Whitaker',
      email: 'jane@example.com',
      organization: 'Riverbend Arts',
      title: 'Board Chair',
    });
  });

  it('infers columns when there is no header row', () => {
    const csv = `Jane Doe,jane@acme.org,Acme Foundation,555-0100\nBob Smith,bob@test.com,,`;
    const rows = parsePeopleImportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@acme.org',
      organization: 'Acme Foundation',
    });
    expect(rows[1].email).toBe('bob@test.com');
  });
});
