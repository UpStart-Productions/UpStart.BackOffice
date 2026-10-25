import { Request } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../tenancy/tenant-context';
import { TENANT_SLUG_HEADER } from '../tenancy/tenant.interceptor';

export const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  clientId: true,
  tenantId: true,
  isSuper: true,
  tenantRole: { select: { permissions: true, actions: true } },
  tenant: { select: { slug: true } },
} as const;

/**
 * One email can have a user row in several tenants (one row per tenant: its own role, permissions
 * and active flag). Pick the row for this request:
 *  - a platform operator's row always wins (they pick a tenant per request in TenantInterceptor);
 *  - otherwise the active row in the tenant named by x-tenant-slug;
 *  - otherwise (no header, or one that names a tenant the person isn't in) the oldest active row,
 *    so a stale header can never reach a tenant the person has no row in.
 * The header is only ever a choice among rows that belong to this email, never a grant.
 */
export async function resolveUserForRequest(prisma: PrismaService, request: Request, email: string) {
  const rows = await runUnscoped(() =>
    prisma.user.findMany({ where: { email }, select: AUTH_USER_SELECT, orderBy: { createdAt: 'asc' } }),
  );
  if (!rows.length) return null;

  const active = rows.filter((r) => r.isActive);
  if (!active.length) throw new UnauthorizedException('Account is disabled.');

  const operator = active.find((r) => r.isSuper);
  if (operator) return operator;

  const slug = (request.headers[TENANT_SLUG_HEADER] as string | undefined)?.trim();
  return (slug && active.find((r) => r.tenant?.slug === slug)) || active[0];
}
