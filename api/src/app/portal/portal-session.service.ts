import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

export type PortalSessionPayload = {
  type: 'portal';
  clientId: string;
};

const COOKIE_NAME = 'ubo_portal_session';
const DEFAULT_MAX_AGE_DAYS = 90;

@Injectable()
export class PortalSessionService {
  private warnedMissingSecret = false;

  private get secret(): string {
    const configured = process.env.PORTAL_SESSION_SECRET?.trim();
    if (!configured && process.env.NODE_ENV === 'production' && !this.warnedMissingSecret) {
      this.warnedMissingSecret = true;
      console.warn(
        'PORTAL_SESSION_SECRET is not set — portal sessions are using an insecure fallback. Set PORTAL_SESSION_SECRET in production.',
      );
    }
    return (
      configured ||
      process.env.COGNITO_CLIENT_ID?.trim() ||
      'dev-portal-session-secret'
    );
  }

  private get maxAgeMs(): number {
    const days = Number(process.env.PORTAL_SESSION_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS);
    return (Number.isFinite(days) && days > 0 ? days : DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  }

  sign(clientId: string): string {
    return jwt.sign({ type: 'portal', clientId } satisfies PortalSessionPayload, this.secret, {
      expiresIn: Math.floor(this.maxAgeMs / 1000),
    });
  }

  verify(token: string): PortalSessionPayload {
    try {
      const payload = jwt.verify(token, this.secret) as PortalSessionPayload;
      if (payload.type !== 'portal' || !payload.clientId) {
        throw new UnauthorizedException('Invalid portal session');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired portal session');
    }
  }

  cookieName(): string {
    return COOKIE_NAME;
  }

  cookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'none' | 'strict';
    domain?: string;
    maxAge: number;
    path: string;
  } {
    const domain = process.env.PORTAL_COOKIE_DOMAIN?.trim() || undefined;
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: domain && isProd ? 'none' : 'lax',
      domain,
      maxAge: this.maxAgeMs,
      path: '/api/portal',
    };
  }

  clearCookieOptions(): ReturnType<PortalSessionService['cookieOptions']> {
    return { ...this.cookieOptions(), maxAge: 0 };
  }
}
