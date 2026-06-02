import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly devAuthGuard: DevAuthGuard,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const hasBearerToken =
      typeof request.headers.authorization === 'string' &&
      request.headers.authorization.startsWith('Bearer ');

    if (hasBearerToken) return this.jwtAuthGuard.canActivate(context);
    if (process.env.NODE_ENV !== 'production') return this.devAuthGuard.canActivate(context);
    return this.jwtAuthGuard.canActivate(context);
  }
}
