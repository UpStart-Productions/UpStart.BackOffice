import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { assertTmTaskInProject } from './time-entry-task.util';

const taskSelect = {
  id: true,
  name: true,
  parent: { select: { id: true, name: true } },
} as const;

export const timeEntryWorkTasksInclude = {
  orderBy: { sortOrder: 'asc' as const },
  select: { task: { select: taskSelect } },
};

type TaskRow = { id: string; name: string; parent: { id: string; name: string } | null };

/** Resolve TM task ids from create/update DTO fields. */
export function resolveTimeEntryTaskIds(dto: { taskIds?: string[] | null; taskId?: string | null }): string[] | undefined {
  if (dto.taskIds !== undefined) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of dto.taskIds ?? []) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }
  if (dto.taskId !== undefined) {
    const id = dto.taskId?.trim();
    return id ? [id] : [];
  }
  return undefined;
}

export async function assertTimeEntryTaskIds(prisma: PrismaService, projectId: string | null, taskIds: string[]) {
  if (!taskIds.length) return;
  if (!projectId) throw new BadRequestException('Work tasks need a project');
  for (const taskId of taskIds) {
    await assertTmTaskInProject(prisma, projectId, taskId);
  }
}

export async function syncTimeEntryWorkTasks(tx: Prisma.TransactionClient, timeEntryId: string, taskIds: string[]) {
  await tx.timeEntryWorkTask.deleteMany({ where: { timeEntryId } });
  if (taskIds.length) {
    await tx.timeEntryWorkTask.createMany({
      data: taskIds.map((taskId, sortOrder) => ({ timeEntryId, taskId, sortOrder })),
    });
  }
}

/** Primary task + full list for API responses (legacy taskId stays the first link). */
export function enrichTimeEntry<T extends { taskId: string | null; task: TaskRow | null; workTasks?: { task: TaskRow }[] }>(
  entry: T,
): T & { tasks: TaskRow[]; task: TaskRow | null; taskId: string | null } {
  const fromLinks = entry.workTasks?.map((w) => w.task) ?? [];
  const tasks = fromLinks.length ? fromLinks : entry.task ? [entry.task] : [];
  const primary = tasks[0] ?? null;
  return {
    ...entry,
    tasks,
    task: primary,
    taskId: primary?.id ?? entry.taskId,
  };
}
