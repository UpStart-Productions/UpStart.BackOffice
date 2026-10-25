import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserForRequest } from './resolve-user';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { applyImpersonation } from './impersonation';
import { UserContext } from '../common/app.types';
import { sanitizeActions, sanitizePermissions, type UserRole } from '@upstart/back-office/shared';

@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('JWT auth required in production');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const email =
      (request.headers['x-user-email'] as string)?.trim() || 'admin@upstart.test';
    const roleHeader = (request.headers['x-user-role'] as string)?.trim().toUpperCase();

    // The tenant isn't known until we know who the user is; the person may have a row per tenant.
    const user = await resolveUserForRequest(this.prisma, request, email);

    if (!user) throw new UnauthorizedException('Dev user not found. Run npm run add-admin-user.');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled.');

    const role = (roleHeader || user.role) as UserRole;

    const real = {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: toPublicAssetUrl(user.avatarUrl),
      role,
      clientId: user.clientId,
      tenantId: user.tenantId,
      isSuper: user.isSuper,
      permissions: sanitizePermissions(user.tenantRole?.permissions),
      actions: sanitizeActions(user.tenantRole?.actions),
    } satisfies UserContext;

    request.user = await applyImpersonation(request, this.prisma, real);
    return true;
  }
}
