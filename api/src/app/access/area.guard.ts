import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionArea } from '@upstart/back-office/shared';
import { Request } from 'express';
import { AccessService } from './access.service';

const AREA_KEY = 'ubo:area';

/** Marks a controller or route as belonging to an app area. Pair with AreaGuard (after StaffAuthGuard). */
export const Area = (...areas: PermissionArea[]) => SetMetadata(AREA_KEY, areas);

/** Allows the request when the user has any level in one of the route's areas. Scoping to 'own' is done in the services. */
@Injectable()
export class AreaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const areas = this.reflector.getAllAndOverride<PermissionArea[]>(AREA_KEY, [context.getHandler(), context.getClass()]);
    if (!areas?.length) return true;
    const user = context.switchToHttp().getRequest<Request>().user;
    if (user && areas.some((a) => this.access.can(user, a))) return true;
    throw new ForbiddenException('You do not have access to this area');
  }
}
