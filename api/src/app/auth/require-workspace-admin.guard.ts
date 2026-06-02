import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UserContext, WorkspaceContext } from '../workspace/workspace.types';

@Injectable()
export class RequireWorkspaceAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UserContext | undefined;
    if (user?.isSuper) return true;

    const workspace = (request as Request & { workspace?: WorkspaceContext }).workspace;
    if (!workspace || !user) throw new ForbiddenException('Workspace admin required');

    const membership = await this.prisma.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });

    if (membership?.role !== 'ADMIN') {
      throw new ForbiddenException('Workspace admin role required');
    }
    return true;
  }
}
