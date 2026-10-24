import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isAdminRole, isBackOfficeRole, type PermissionArea } from '@upstart/back-office/shared';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { AccessService } from './access.service';

const RULE_KEY = 'ubo:access-rule';

type AccessRule = { kind: 'area'; areas: PermissionArea[] } | { kind: 'admin' } | { kind: 'signedIn' };

/** Any level in one of these areas. Scoping to 'own' is done in the services. */
export const Area = (...areas: PermissionArea[]) => SetMetadata(RULE_KEY, { kind: 'area', areas } satisfies AccessRule);
/** Admins only (Accounting, Users, Settings and the like). */
export const AdminOnly = () => SetMetadata(RULE_KEY, { kind: 'admin' } satisfies AccessRule);
/** Any signed-in back-office user (their own profile, notifications). The handler filters what they see. */
export const SignedIn = () => SetMetadata(RULE_KEY, { kind: 'signedIn' } satisfies AccessRule);

/**
 * The back-office guard: signs the user in, then applies the route's rule (a route rule overrides the controller's).
 * Admins pass every rule; everyone else gets what their tenant role grants. A route with no rule is denied.
 * Client portal logins never pass.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly appAuthGuard: AppAuthGuard,
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.appAuthGuard.canActivate(context);
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !isBackOfficeRole(user.role)) throw new ForbiddenException('You do not have access to this area');
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(RULE_KEY, [context.getHandler(), context.getClass()]);
    if (!rule) throw new ForbiddenException('You do not have access to this area');
    if (isAdminRole(user.role)) return true;
    if (rule.kind === 'signedIn') return true;
    if (rule.kind === 'area' && rule.areas.some((a) => this.access.can(user, a))) return true;
    throw new ForbiddenException(rule.kind === 'admin' ? 'Admins only' : 'You do not have access to this area');
  }
}
