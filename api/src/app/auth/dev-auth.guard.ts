import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UserContext } from '../common/app.types';

@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('JWT auth required in production');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const email =
      (request.headers['x-user-email'] as string)?.trim() || 'admin@upstart.test';
    const isSuperHeader = request.headers['x-super-admin'] === 'true';

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

    if (!user) throw new UnauthorizedException('Dev user not found. Run seed.');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled.');

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isSuper: isSuperHeader || user.isSuper,
    } satisfies UserContext;

    return true;
  }
}
