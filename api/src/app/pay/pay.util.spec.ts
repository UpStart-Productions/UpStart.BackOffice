import { describe, expect, it } from 'vitest';
import {
  buildPayUrl,
  canAcceptPayment,
  centsToDollars,
  dollarsToCents,
  generatePayToken,
  integrationIdentifier,
  uniqueProjectsFromLineItems,
} from './pay.util';

describe('pay.util', () => {
  it('generates an unguessable token', () => {
    const a = generatePayToken();
    const b = generatePayToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it('builds a pay URL from the base and token', () => {
    expect(buildPayUrl('abc')).toBe('http://localhost:4321/pay/abc');
  });

  it('converts dollars and cents without float drift', () => {
    expect(dollarsToCents(125.5)).toBe(12550);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(centsToDollars(12550)).toBe(125.5);
  });

  it('tags checkout sessions with a unique suffix', () => {
    const id = integrationIdentifier('INVOICE');
    expect(id.startsWith('ubo-invoice-')).toBe(true);
    expect(id).not.toBe(integrationIdentifier('INVOICE'));
  });

  it('blocks payment when already paid or void', () => {
    expect(canAcceptPayment({ payableStatus: 'OPEN', invoiceStatus: 'SENT' })).toBe(true);
    expect(canAcceptPayment({ payableStatus: 'OPEN', invoiceStatus: 'DRAFT' })).toBe(true);
    expect(canAcceptPayment({ payableStatus: 'PAID', invoiceStatus: 'SENT' })).toBe(false);
    expect(canAcceptPayment({ payableStatus: 'OPEN', invoiceStatus: 'PAID' })).toBe(false);
    expect(canAcceptPayment({ payableStatus: 'OPEN', invoiceStatus: 'VOID' })).toBe(false);
  });

  it('collects unique invoice projects with descriptions', () => {
    expect(uniqueProjectsFromLineItems([{ project: null }, {}])).toEqual([]);
    expect(
      uniqueProjectsFromLineItems([
        { project: { id: 'p1', name: 'Site rebuild', description: 'New marketing site' } },
        { project: { id: 'p1', name: 'Site rebuild', description: 'New marketing site' } },
        { project: { id: 'p2', name: 'Brand kit', description: '  ' } },
      ]),
    ).toEqual([
      { name: 'Site rebuild', description: 'New marketing site' },
      { name: 'Brand kit', description: null },
    ]);
  });
});
