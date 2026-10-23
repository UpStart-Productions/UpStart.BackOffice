import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

/** Platform operators only (User.isSuper). Use after AppAuthGuard. */
@Injectable()
export class RequireSuperGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user?.isSuper) throw new ForbiddenException('Platform admin access required');
    return true;
  }
}
