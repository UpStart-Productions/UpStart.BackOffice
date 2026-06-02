import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UserContext, WorkspaceContext } from '../workspace/workspace.types';

@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('JWT auth required in production');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const email =
      (request.headers['x-user-email'] as string)?.trim() ?? 'admin@upstart.test';
    const isSuperHeader = request.headers['x-super-admin'] === 'true';

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, firstName: true, lastName: true, avatarUrl: true, isActive: true, isSuper: true },
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
      isSuper: isSuperHeader || user.isSuper,
    } satisfies UserContext;

    if (request.user.isSuper) return true;

    const workspace = (request as Request & { workspace?: WorkspaceContext }).workspace;
    if (!workspace) {
      const path = (request.path || '').replace(/\?.*/, '');
      if (path.endsWith('/me') || path.endsWith('/my-workspaces')) return true;
      throw new BadRequestException('Workspace context required. Send x-workspace-slug.');
    }

    const membership = await this.prisma.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });
    if (!membership) {
      throw new ForbiddenException({ message: 'User is not a member of this workspace', workspaceSlug: workspace.slug });
    }

    return true;
  }
}
