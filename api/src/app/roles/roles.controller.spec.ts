import { GUEST_ROLE, MEMBER_ROLE, presetFor, roleAccess } from '@upstart/back-office/shared';
import { describe, expect, it } from 'vitest';

describe('fixed roles', () => {
  it('resolves access from the role key, never from stored JSON', () => {
    expect(roleAccess({ key: 'member' }).permissions).toEqual(MEMBER_ROLE.permissions);
    expect(roleAccess({ key: 'guest' }).actions).toEqual(GUEST_ROLE.actions);
    expect(roleAccess({ key: 'manager' })).toEqual({ permissions: {}, actions: {} });
    expect(roleAccess(null)).toEqual({ permissions: {}, actions: {} });
    expect(presetFor('team-member')).toBeUndefined();
  });
});
