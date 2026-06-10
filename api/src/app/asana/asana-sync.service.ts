import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectTaskSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AsanaApiClient } from './asana-api.client';
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
    const asanaTasks = await client.listSectionTasks(project.asanaSectionGid);
    const incomingGids = new Set(asanaTasks.map((t) => t.gid));

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
}
