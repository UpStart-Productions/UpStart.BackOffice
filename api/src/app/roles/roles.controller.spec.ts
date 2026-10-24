import { ROLE_PRESETS } from '@upstart/back-office/shared';
import { describe, expect, it } from 'vitest';
import { isModified } from './roles.controller';

const preset = (key: string) => ROLE_PRESETS.find((p) => p.key === key)!;

describe('isModified (when to offer Reset to default)', () => {
  it('is false for every preset as shipped, and for roles that are not built in', () => {
    for (const p of ROLE_PRESETS) expect(isModified({ key: p.key, permissions: p.permissions, actions: p.actions })).toBe(false);
    expect(isModified({ key: null, permissions: { time: 'own' }, actions: {} })).toBe(false);
  });

  it('treats a blank checkbox like a ticked one, and ignores key order', () => {
    expect(isModified({ key: 'guest', permissions: { tasks: 'own' }, actions: {} })).toBe(false);
    const m = preset('manager');
    const reordered = Object.fromEntries(Object.entries(m.permissions).reverse());
    expect(isModified({ key: 'manager', permissions: reordered, actions: {} })).toBe(false);
  });

  it('is true once access differs', () => {
    const tm = preset('team-member');
    expect(isModified({ key: 'team-member', permissions: tm.permissions, actions: { ...tm.actions, pipeline: { delete: true } } })).toBe(true);
    expect(isModified({ key: 'team-member', permissions: { ...tm.permissions, invoices: 'all' }, actions: tm.actions })).toBe(true);
    expect(isModified({ key: 'team-member', permissions: { ...tm.permissions, time: 'all' }, actions: tm.actions })).toBe(true);
  });
});
