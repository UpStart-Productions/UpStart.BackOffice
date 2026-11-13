import { describe, expect, it } from 'vitest';
import { normalizeHelpAgentReport, reportNumber } from '@upstart/back-office/shared';

const opts = { id: 'r1', sources: ['invoices'], createdAt: '2026-11-13T19:00:00Z' };

describe('guide reports', () => {
  it('computes totals in code and ignores any total the model sends', () => {
    const r = normalizeHelpAgentReport(
      {
        title: 'Invoices for Hope Center',
        meta: ['Nov 2025 to Nov 2026'],
        blocks: [
          {
            type: 'table',
            columns: [{ label: 'Number' }, { label: 'Date', kind: 'date' }, { label: 'Total', kind: 'money' }],
            rows: [['HOPE-0001', '2026-01-05', 1250], ['HOPE-0002', '2026-02-05', '$1,000.50']],
            totals: [null, null, 99999],
          },
        ],
      },
      opts,
    );
    const t = r.blocks[0];
    expect(t.type === 'table' && t.totals).toEqual([null, null, 2250.5]);
    expect(t.type === 'table' && t.rows[1]).toEqual(['HOPE-0002', '2026-02-05', 1000.5]);
    expect(r.sources).toEqual(['invoices']);
  });

  it('keeps conversations as plain text, oldest first as sent', () => {
    const r = normalizeHelpAgentReport(
      {
        title: 'Bryn and Jeff',
        blocks: [{ type: 'conversation', entries: [{ date: '2026-10-01', who: 'Bryn Hicks', kind: 'email', subject: 'Intro', text: '<p>Hi <b>Jeff</b></p>' }] }],
      },
      opts,
    );
    expect(r.blocks[0]).toEqual({
      type: 'conversation',
      title: null,
      entries: [{ date: '2026-10-01', who: 'Bryn Hicks', kind: 'email', subject: 'Intro', text: 'Hi Jeff' }],
    });
  });

  it('refuses a report with no title or no content', () => {
    expect(() => normalizeHelpAgentReport({ blocks: [{ type: 'text', text: 'x' }] }, opts)).toThrow('title');
    expect(() => normalizeHelpAgentReport({ title: 'X', blocks: [{ type: 'chart' }] }, opts)).toThrow('no content');
  });

  it('reads money strings and negatives', () => {
    expect(reportNumber('($40.00)')).toBe(-40);
    expect(reportNumber('-3')).toBe(-3);
    expect(reportNumber('n/a')).toBeNull();
  });
});
