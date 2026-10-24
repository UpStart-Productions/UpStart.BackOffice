import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../tenancy/tenant-context';
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

    // Unscoped: the tenant isn't known until we know who the user is.
    const user = await runUnscoped(() => this.prisma.user.findUnique({
      where: { email },
      select: {
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
      },
    }));

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
