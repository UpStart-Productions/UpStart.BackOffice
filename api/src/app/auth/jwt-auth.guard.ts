import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';

const COGNITO_JWKS_URI = (region: string, userPoolId: string) =>
  `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwksClient: jwksClient.JwksClient | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getJwksClient(): jwksClient.JwksClient {
    if (!this.jwksClient) {
      const region = process.env.COGNITO_REGION;
      const userPoolId = process.env.COGNITO_USER_POOL_ID;
      if (!region || !userPoolId) throw new Error('COGNITO_REGION and COGNITO_USER_POOL_ID are required');
      this.jwksClient = jwksClient({
        jwksUri: COGNITO_JWKS_URI(region, userPoolId),
        cache: true,
        rateLimit: true,
      });
    }
    return this.jwksClient;
  }

  private getSigningKey = (
    header: jwt.JwtHeader,
    callback: (err: Error | null, key?: string) => void,
  ) => {
    this.getJwksClient().getSigningKey(header.kid, (err, key) => {
      if (err) { callback(err); return; }
      callback(null, key?.getPublicKey());
    });
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const region = process.env.COGNITO_REGION;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!region || !userPoolId) throw new UnauthorizedException('Cognito not configured');

    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    const clientId = process.env.COGNITO_CLIENT_ID;

    type CognitoPayload = jwt.JwtPayload & { email?: string; 'cognito:username'?: string };
    let decoded: CognitoPayload;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, this.getSigningKey as jwt.GetPublicKeyOrSecret, {
          algorithms: ['RS256'],
          issuer,
          audience: clientId,
        }, (err, payload) => {
          if (err) reject(err); else resolve(payload as CognitoPayload);
        });
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const email =
      decoded.email ??
      (decoded['cognito:username']?.includes('@') ? decoded['cognito:username'] : null);
    if (!email) throw new UnauthorizedException('Token missing email claim');

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        isSuper: true,
      },
    });

    if (!user) throw new UnauthorizedException('User not found. Contact your administrator.');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled.');

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isSuper: user.isSuper,
    } satisfies UserContext;

    return true;
  }
}
