import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { allows, actionsFor, ROLE_PRESETS, sanitizeActions } from '@upstart/back-office/shared';
import { describe, expect, it } from 'vitest';
import { AccessGuard, Action, actionForMethod, AdminOnly, Area } from './access.guard';
import { AccessService } from './access.service';

const user = (permissions: object, actions: object = {}, role = 'USER') => ({ id: 'u', email: 'u@x', role, permissions, actions }) as never;

describe('allows', () => {
  it('admins can do anything; others need the area, then the checkbox (missing = allowed)', () => {
    expect(allows(user({}, {}, 'ADMIN'), 'invoices', 'delete')).toBe(true);
    expect(allows(user({}), 'invoices', 'view')).toBe(false);
    expect(allows(user({ invoices: 'all' }), 'invoices', 'delete')).toBe(true);
    expect(allows(user({ invoices: 'all' }, { invoices: { delete: false } }), 'invoices', 'delete')).toBe(false);
    expect(allows(user({ invoices: 'all' }, { invoices: { delete: false } }), 'invoices', 'view')).toBe(true);
    expect(allows(user({ clients: 'own' }), 'clients', 'edit')).toBe(true);
  });

  it('keeps only known areas and actions; setup only where there is something to set up', () => {
    expect(sanitizeActions({ pipeline: { setup: false, edit: 'yes', bogus: true }, clients: { setup: true }, nope: { edit: true } })).toEqual({
      pipeline: { setup: false },
    });
    expect(actionsFor('pipeline')).toContain('setup');
    expect(actionsFor('clients')).not.toContain('setup');
    expect(actionsFor('reports')).toEqual([]);
  });

  it('presets match the agreed shape', () => {
    const by = Object.fromEntries(ROLE_PRESETS.map((p) => [p.key, p]));
    expect(Object.keys(by)).toEqual(['manager', 'team-member', 'coordinator', 'bookkeeper', 'contractor', 'guest']);
    const tm = { role: 'USER', ...by['team-member'] } as never;
    expect(allows(tm, 'pipeline', 'edit')).toBe(true);
    expect(allows(tm, 'pipeline', 'delete')).toBe(false);
    expect(allows(tm, 'pipeline', 'setup')).toBe(false);
    expect(allows(tm, 'invoices', 'view')).toBe(false);
    const bk = { role: 'USER', ...by['bookkeeper'] } as never;
    expect(allows(bk, 'invoices', 'delete')).toBe(true);
    expect(allows(bk, 'time', 'view')).toBe(true);
    expect(allows(bk, 'time', 'edit')).toBe(false);
    const mgr = { role: 'USER', ...by['manager'] } as never;
    expect(allows(mgr, 'pipeline', 'setup')).toBe(true);
    // Every preset's actions survive sanitizing unchanged (no typos).
    for (const p of ROLE_PRESETS) expect(sanitizeActions(p.actions)).toEqual(p.actions);
  });
});

describe('AccessGuard actions', () => {
  class Ctl {
    @Area('pipeline') read() {}
    @Area('pipeline') @Action('edit') archive() {}
    @Area('pipeline') @Action('setup') lanes() {}
    @Area('clients', 'time') lookup() {}
    @AdminOnly() admin() {}
  }
  const guard = (u: unknown) =>
    new AccessGuard({ canActivate: async () => true } as never, new Reflector(), new AccessService({} as never));
  const run = (u: unknown, handler: keyof Ctl, method: string) => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: u, method }) }),
      getHandler: () => Ctl.prototype[handler],
      getClass: () => Ctl,
    } as never;
    return guard(u).canActivate(ctx);
  };

  it('maps request types to actions', () => {
    expect(actionForMethod('GET')).toBe('view');
    expect(actionForMethod('post')).toBe('create');
    expect(actionForMethod('PATCH')).toBe('edit');
    expect(actionForMethod('PUT')).toBe('edit');
    expect(actionForMethod('DELETE')).toBe('delete');
  });

  it('checks the action from the request type, or the @Action override', async () => {
    const noDelete = user({ pipeline: 'all' }, { pipeline: { delete: false, setup: false, create: true, edit: true } });
    await expect(run(noDelete, 'read', 'GET')).resolves.toBe(true);
    await expect(run(noDelete, 'read', 'POST')).resolves.toBe(true);
    await expect(run(noDelete, 'read', 'DELETE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(noDelete, 'archive', 'POST')).resolves.toBe(true); // a POST that edits
    await expect(run(noDelete, 'lanes', 'PATCH')).rejects.toBeInstanceOf(ForbiddenException);
    const viewOnly = user({ pipeline: 'all' }, { pipeline: { create: false, edit: false, delete: false } });
    await expect(run(viewOnly, 'archive', 'POST')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when any one of the route areas allows it; admins and admin-only unchanged', async () => {
    const timeOnly = user({ time: 'own' });
    await expect(run(timeOnly, 'lookup', 'GET')).resolves.toBe(true);
    await expect(run(user({}), 'lookup', 'GET')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run(user({}, {}, 'ADMIN'), 'lanes', 'DELETE')).resolves.toBe(true);
    await expect(run(user({ pipeline: 'all' }), 'admin', 'GET')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
