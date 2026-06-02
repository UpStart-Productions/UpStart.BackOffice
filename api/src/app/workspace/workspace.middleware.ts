import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContext } from './workspace.types';

@Injectable()
export class WorkspaceMiddleware implements NestMiddleware {
  private readonly workspaceHeader = 'x-workspace-slug';

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const slug = (req.headers[this.workspaceHeader] as string)?.trim();

    if (!slug) {
      (req as Request & { workspace?: WorkspaceContext }).workspace = undefined;
      next();
      return;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
    });

    if (!workspace) {
      throw new NotFoundException({ message: 'Workspace not found', slug });
    }

    (req as Request & { workspace?: WorkspaceContext }).workspace = {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
    };

    next();
  }
}
