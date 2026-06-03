import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '../common/app.types';

@Injectable()
export class RequireSuperGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UserContext | undefined;
    if (!user?.isSuper) throw new ForbiddenException('Super admin required');
    return true;
  }
}
