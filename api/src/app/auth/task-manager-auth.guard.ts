import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { isGuestRole, isStaffRole } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { AppAuthGuard } from './app-auth.guard';

/**
 * Task Manager + notifications: internal staff (ADMIN/MEMBER) and external GUEST collaborators.
 * Per-project access for guests is enforced by TaskAccessService. Blocks CLIENT portal users.
 */
@Injectable()
export class TaskManagerAuthGuard implements CanActivate {
  constructor(private readonly appAuthGuard: AppAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.appAuthGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UserContext | undefined;
    if (!user || !(isStaffRole(user.role) || isGuestRole(user.role))) {
      throw new ForbiddenException('Task Manager access required');
    }
    return true;
  }
}
