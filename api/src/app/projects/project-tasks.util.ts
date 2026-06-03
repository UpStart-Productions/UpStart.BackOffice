import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTaskInputDto } from '../projects/dto/project-task.dto';

const projectInclude = {
  client: { select: { id: true, name: true, code: true } },
  tasks: { orderBy: { sortOrder: 'asc' as const } },
};

const activeTasksInclude = {
  client: { select: { id: true, name: true, code: true } },
  tasks: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
  },
};

export { projectInclude, activeTasksInclude };

export async function syncProjectTasks(
  prisma: PrismaService,
  projectId: string,
  tasks: ProjectTaskInputDto[],
) {
  const names = tasks.map((t) => t.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new BadRequestException('Task names must be unique within a project');
  }

  const existing = await prisma.projectTask.findMany({ where: { projectId } });
  const incomingIds = new Set(tasks.filter((t) => t.id).map((t) => t.id!));

  for (const task of existing) {
    if (!incomingIds.has(task.id)) {
      await prisma.projectTask.delete({ where: { id: task.id } });
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const name = task.name.trim();
    if (!name) {
      throw new BadRequestException('Task name is required');
    }

    const data = {
      name,
      isBillable: task.isBillable ?? true,
      sortOrder: task.sortOrder ?? i,
      isActive: task.isActive ?? true,
    };

    if (task.id && existing.some((e) => e.id === task.id)) {
      await prisma.projectTask.update({ where: { id: task.id }, data });
    } else {
      await prisma.projectTask.create({ data: { projectId, ...data } });
    }
  }
}

export async function resolveTimeEntryBillable(
  prisma: PrismaService,
  projectId: string,
  projectTaskId?: string,
  isBillable?: boolean,
): Promise<boolean> {
  if (projectTaskId) {
    const task = await prisma.projectTask.findFirst({
      where: { id: projectTaskId, projectId, isActive: true },
    });
    if (!task) {
      throw new BadRequestException('Task not found for this project');
    }
    return task.isBillable;
  }

  const activeTaskCount = await prisma.projectTask.count({
    where: { projectId, isActive: true },
  });
  if (activeTaskCount > 0) {
    throw new BadRequestException('A task is required for this project');
  }

  return isBillable ?? true;
}
