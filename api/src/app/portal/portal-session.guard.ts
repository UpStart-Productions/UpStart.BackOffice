import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PortalSessionService } from './portal-session.service';
import { readRequestCookie } from './portal-token.util';

@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly portalSession: PortalSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Portal session required');
    }

    const payload = this.portalSession.verify(token);
    req.portalClientId = payload.clientId;
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.slice(7).trim() || undefined;
    }

    return readRequestCookie(req.headers.cookie, this.portalSession.cookieName());
  }
}

/** Attach portal session cookie on exchange. */
export function setPortalSessionCookie(res: Response, sessionToken: string, portalSession: PortalSessionService) {
  res.cookie(portalSession.cookieName(), sessionToken, portalSession.cookieOptions());
}

export function clearPortalSessionCookie(res: Response, portalSession: PortalSessionService) {
  res.clearCookie(portalSession.cookieName(), portalSession.clearCookieOptions());
}
