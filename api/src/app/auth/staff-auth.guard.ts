import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '../common/app.types';
import { isStaffRole } from '@upstart/back-office/shared';
import { AppAuthGuard } from './app-auth.guard';

/** Authenticated internal staff only (ADMIN or MEMBER). Blocks CLIENT portal users. */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly appAuthGuard: AppAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.appAuthGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UserContext | undefined;
    if (!user || !isStaffRole(user.role)) {
      throw new ForbiddenException('Staff access required');
    }
    return true;
  }
}
