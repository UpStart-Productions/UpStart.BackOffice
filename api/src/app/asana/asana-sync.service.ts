import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectTaskSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AsanaApiClient } from './asana-api.client';
import { asanaBoardGids } from './asana-link.util';
import { AsanaService } from './asana.service';

@Injectable()
export class AsanaSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asana: AsanaService,
  ) {}

  async syncProjectTasks(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new BadRequestException('Project not found');
    }
    if (!project.asanaSectionGid) {
      throw new BadRequestException('Link an Asana board and section before syncing');
    }

    const client = await this.asana.getApiClient();
    const sectionGids = await this.resolveSectionGids(client, project);
    const asanaTasks = [];
    const incomingGids = new Set<string>();
    for (const sectionGid of sectionGids) {
      const tasks = await client.listSectionTasks(sectionGid);
      for (const task of tasks) {
        if (incomingGids.has(task.gid)) continue;
        incomingGids.add(task.gid);
        asanaTasks.push(task);
      }
    }

    const existingAsanaTasks = await this.prisma.projectTask.findMany({
      where: { projectId, source: ProjectTaskSource.ASANA },
    });

    const manualCount = await this.prisma.projectTask.count({
      where: { projectId, source: ProjectTaskSource.MANUAL },
    });

    for (let i = 0; i < asanaTasks.length; i++) {
      const task = asanaTasks[i];
      const existing = existingAsanaTasks.find((t) => t.asanaTaskGid === task.gid);
      const sortOrder = manualCount + i;
      if (existing) {
        await this.prisma.projectTask.update({
          where: { id: existing.id },
          data: {
            name: task.name,
            sortOrder,
            isActive: true,
          },
        });
      } else {
        await this.prisma.projectTask.create({
          data: {
            projectId,
            name: task.name,
            source: ProjectTaskSource.ASANA,
            asanaTaskGid: task.gid,
            isBillable: project.isBillable,
            sortOrder,
            isActive: true,
          },
        });
      }
    }

    for (const task of existingAsanaTasks) {
      if (task.asanaTaskGid && !incomingGids.has(task.asanaTaskGid)) {
        await this.prisma.projectTask.update({
          where: { id: task.id },
          data: { isActive: false },
        });
      }
    }

    return this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { id: true, name: true, code: true } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  private async resolveSectionGids(
    client: AsanaApiClient,
    project: { asanaProjectGid?: string | null; asanaProjectGids?: unknown; asanaSectionGid: string | null; asanaSectionName: string | null },
  ): Promise<string[]> {
    const gids = new Set<string>();
    if (project.asanaSectionGid) gids.add(project.asanaSectionGid);

    const boardGids = asanaBoardGids(project);
    const sectionName = project.asanaSectionName?.trim();
    if (boardGids.length > 1 && sectionName) {
      for (const boardGid of boardGids) {
        const sections = await client.listSections(boardGid);
        for (const section of sections) {
          if (section.name === sectionName) gids.add(section.gid);
        }
      }
    }

    return [...gids];
  }
}
