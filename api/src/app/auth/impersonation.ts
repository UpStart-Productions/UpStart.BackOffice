import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { sanitizePermissions } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { runUnscoped } from '../tenancy/tenant-context';

export const IMPERSONATE_HEADER = 'x-impersonate-user-id';

/**
 * Platform operators (User.isSuper) may act as another user by sending x-impersonate-user-id.
 * The request then runs exactly as that user: their tenant, role and permissions.
 * Anyone else sending the header is ignored. The real caller is kept on request.impersonatedBy.
 */
export async function applyImpersonation(
  request: Request,
  prisma: PrismaService,
  real: UserContext,
): Promise<UserContext> {
  const targetId = (request.headers[IMPERSONATE_HEADER] as string | undefined)?.trim();
  if (!targetId || !real.isSuper) return real;

  const target = await runUnscoped(() =>
    prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true, email: true, name: true, firstName: true, lastName: true, avatarUrl: true,
        role: true, isActive: true, clientId: true, tenantId: true, isSuper: true,
        tenantRole: { select: { permissions: true } },
      },
    }),
  );
  if (!target || !target.isActive) throw new ForbiddenException('That user cannot be impersonated.');
  if (target.isSuper || !target.tenantId) {
    throw new ForbiddenException('Platform admins cannot be impersonated.');
  }

  request.impersonatedBy = { id: real.id, email: real.email };
  return {
    id: target.id,
    email: target.email,
    name: target.name,
    firstName: target.firstName,
    lastName: target.lastName,
    avatarUrl: toPublicAssetUrl(target.avatarUrl),
    role: target.role,
    clientId: target.clientId,
    tenantId: target.tenantId,
    isSuper: false,
    permissions: sanitizePermissions(target.tenantRole?.permissions),
  };
}
