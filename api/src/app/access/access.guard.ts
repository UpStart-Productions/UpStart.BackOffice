import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { allows, isAdminRole, isBackOfficeRole, type AreaAction, type PermissionArea } from '@upstart/back-office/shared';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { AccessService } from './access.service';

const RULE_KEY = 'ubo:access-rule';
const ACTION_KEY = 'ubo:access-action';

type AccessRule = { kind: 'area'; areas: PermissionArea[] } | { kind: 'admin' } | { kind: 'signedIn' };

/** Any level in one of these areas. Scoping to 'own' is done in the services. */
export const Area = (...areas: PermissionArea[]) => SetMetadata(RULE_KEY, { kind: 'area', areas } satisfies AccessRule);
/**
 * The action a route needs in its area, when the request type doesn't say it. By default GET/HEAD is view,
 * POST is create, PUT/PATCH is edit and DELETE is delete. Use this for e.g. "archive" (a POST that edits)
 * or lane changes (setup).
 */
export const Action = (action: AreaAction) => SetMetadata(ACTION_KEY, action);

/** The action a request needs, from @Action or the HTTP method. */
export function actionForMethod(method: string): AreaAction {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'edit';
    case 'DELETE':
      return 'delete';
    default:
      return 'view';
  }
}

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
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user || !isBackOfficeRole(user.role)) throw new ForbiddenException('You do not have access to this area');
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(RULE_KEY, [context.getHandler(), context.getClass()]);
    if (!rule) throw new ForbiddenException('You do not have access to this area');
    if (isAdminRole(user.role)) return true;
    if (rule.kind === 'signedIn') return true;
    if (rule.kind === 'area') {
      if (!rule.areas.some((a) => this.access.can(user, a))) throw new ForbiddenException('You do not have access to this area');
      const action =
        this.reflector.getAllAndOverride<AreaAction | undefined>(ACTION_KEY, [context.getHandler(), context.getClass()]) ??
        actionForMethod(request.method);
      // Passing in any one of the route's areas is enough (e.g. a picker shared by Time and Invoices).
      if (rule.areas.some((a) => allows(user, a, action))) return true;
      throw new ForbiddenException(`Your role can't ${action === 'setup' ? 'change the setup of' : action} in this area`);
    }
    throw new ForbiddenException(rule.kind === 'admin' ? 'Admins only' : 'You do not have access to this area');
  }
}
