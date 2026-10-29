import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { moduleForArea, type ModuleKey, type PermissionArea } from '@upstart/back-office/shared';

/**
 * Route metadata shared by the AccessGuard (who may use a route) and the TenantInterceptor (whether the
 * route's module is on for the tenant). Kept apart from the guard so the interceptor doesn't import auth.
 */
export const RULE_KEY = 'ubo:access-rule';
const MODULE_KEY = 'ubo:module';

export type AccessRule = { kind: 'area'; areas: PermissionArea[] } | { kind: 'admin' } | { kind: 'signedIn' };

/**
 * Routes that belong to a module without an @Area (public booking pages and the like). Routes with @Area
 * get their module from the area. Checked per request by the TenantInterceptor, once the tenant is known.
 */
export const ForModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);

/**
 * The modules a route needs, any one of which is enough: its @ForModule, else the modules owning its @Area areas.
 * Empty when the route is core (or any of its areas is core).
 */
export function routeModules(reflector: Reflector, context: ExecutionContext): ModuleKey[] {
  const targets = [context.getHandler(), context.getClass()];
  const explicit = reflector.getAllAndOverride<ModuleKey | undefined>(MODULE_KEY, targets);
  if (explicit) return [explicit];
  const rule = reflector.getAllAndOverride<AccessRule | undefined>(RULE_KEY, targets);
  if (rule?.kind !== 'area') return [];
  const owners = rule.areas.map((a) => moduleForArea(a));
  return owners.includes(null) ? [] : [...new Set(owners as ModuleKey[])];
}
