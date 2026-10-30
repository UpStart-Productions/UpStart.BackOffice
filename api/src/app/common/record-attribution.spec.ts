import { describe, expect, it } from 'vitest';
import { applyAttributionToArgs, attributionAls } from './record-attribution';

describe('applyAttributionToArgs', () => {
  it('uses scalar FKs on simple creates', () => {
    const data: Record<string, unknown> = { firstName: 'Ann' };
    attributionAls.run({ userId: 'u1' }, () => {
      applyAttributionToArgs('Contact', 'create', { data });
    });
    expect(data).toEqual({
      firstName: 'Ann',
      createdByUserId: 'u1',
      updatedByUserId: 'u1',
    });
  });

  it('uses relation connect when nested creates are present', () => {
    const data: Record<string, unknown> = {
      firstName: 'Ann',
      emails: { create: { email: 'a@x.test', isPrimary: true } },
    };
    attributionAls.run({ userId: 'u1' }, () => {
      applyAttributionToArgs('Contact', 'create', { data });
    });
    expect(data.createdByUserId).toBeUndefined();
    expect(data.updatedByUserId).toBeUndefined();
    expect(data.createdBy).toEqual({ connect: { id: 'u1' } });
    expect(data.updatedBy).toEqual({ connect: { id: 'u1' } });
  });

  it('maps Invoice createdById on simple creates', () => {
    const data: Record<string, unknown> = { number: 1 };
    attributionAls.run({ userId: 'u1' }, () => {
      applyAttributionToArgs('Invoice', 'create', { data });
    });
    expect(data.createdById).toBe('u1');
    expect(data.updatedByUserId).toBe('u1');
  });
});
