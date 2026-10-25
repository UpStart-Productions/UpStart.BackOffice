import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { resolveUserForRequest } from './resolve-user';

type Row = { id: string; isActive: boolean; isSuper: boolean; tenantId: string | null; tenant: { slug: string } | null };
const row = (id: string, slug: string | null, over: Partial<Row> = {}): Row => ({
  id, isActive: true, isSuper: false, tenantId: slug ? `t-${slug}` : null, tenant: slug ? { slug } : null, ...over,
});

function resolve(rows: Row[], slug?: string) {
  const prisma = { user: { findMany: vi.fn().mockResolvedValue(rows) } } as never;
  const request = { headers: slug ? { 'x-tenant-slug': slug } : {} } as never;
  return resolveUserForRequest(prisma, request, 'bryn@example.org');
}

describe('resolveUserForRequest (one email, a user row per tenant)', () => {
  const personal = row('u-personal', 'upstart');
  const tpn = row('u-tpn', 'tpn');

  it('returns null when the email has no user', async () => {
    expect(await resolve([])).toBeNull();
  });

  it('uses the row for the tenant named by the header', async () => {
    expect((await resolve([personal, tpn], 'tpn'))?.id).toBe('u-tpn');
    expect((await resolve([personal, tpn], 'upstart'))?.id).toBe('u-personal');
  });

  it('defaults to the oldest active row without a header', async () => {
    expect((await resolve([personal, tpn]))?.id).toBe('u-personal');
  });

  it('never lands in a tenant the person has no row in', async () => {
    expect((await resolve([personal, tpn], 'someone-elses'))?.id).toBe('u-personal');
    expect((await resolve([tpn], 'upstart'))?.id).toBe('u-tpn');
  });

  it('ignores a row that is disabled in one tenant', async () => {
    const off = row('u-off', 'upstart', { isActive: false });
    expect((await resolve([off, tpn], 'upstart'))?.id).toBe('u-tpn');
  });

  it('rejects when every row is disabled', async () => {
    const off = row('u-off', 'upstart', { isActive: false });
    await expect(resolve([off])).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('prefers a platform operator row', async () => {
    const op = row('u-op', null, { isSuper: true });
    expect((await resolve([personal, op], 'upstart'))?.id).toBe('u-op');
  });
});
