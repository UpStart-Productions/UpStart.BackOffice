import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UserContext, WorkspaceContext } from '../workspace/workspace.types';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@Req() req: Request) {
    const user = req.user as UserContext;
    const workspaces = await this.prisma.workspaceUser.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, slug: true, name: true } } },
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSuper: user.isSuper,
      workspaces: workspaces.map((wu) => ({
        ...wu.workspace,
        role: wu.role,
        hourlyRate: wu.hourlyRate,
      })),
    };
  }

  @Get('workspace-members')
  async workspaceMembers(@Req() req: Request) {
    const workspace = (req as Request & { workspace?: WorkspaceContext }).workspace;
    if (!workspace) return [];
    return this.prisma.workspaceUser.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
    });
  }
}
