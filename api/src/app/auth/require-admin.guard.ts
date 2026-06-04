import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '../common/app.types';
import { isAdminRole } from '@upstart/back-office/shared';

@Injectable()
export class RequireAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UserContext | undefined;
    if (!user || !isAdminRole(user.role)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
