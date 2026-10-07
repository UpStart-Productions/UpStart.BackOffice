import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Ensure a Task Manager task can be linked to a time entry for this project. */
export async function assertTmTaskInProject(
  prisma: PrismaService,
  projectId: string,
  taskId: string,
): Promise<void> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [{ projectId }, { projectLinks: { some: { projectId } } }],
    },
    select: { id: true },
  });
  if (!task) {
    throw new BadRequestException('Task not found for this project');
  }
}
