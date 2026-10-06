import { Injectable } from '@nestjs/common';
import { TaskCommentKind } from '@prisma/client';
import { UserContext } from '../common/app.types';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { CreateNotificationInput, NotificationType } from '../notifications/notification.types';
import { PrismaService } from '../prisma/prisma.service';
import { personName } from './task-people.util';

type TaskRef = { id: string; name: string; projectId: string; project?: { name: string } | null };

/**
 * Side effects of task changes: activity lines (SYSTEM comments), followers, notifications.
 * Kept separate so the import job can write tasks without notifying anyone.
 */
@Injectable()
export class TaskEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async activity(taskId: string, actor: UserContext, text: string): Promise<void> {
    await this.prisma.taskComment.create({
      data: { taskId, authorId: actor.id, kind: TaskCommentKind.SYSTEM, body: text },
    });
  }

  async follow(taskId: string, userIds: (string | null | undefined)[]): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (!ids.length) return;
    await this.prisma.taskFollower.createMany({
      data: ids.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
  }

  async followerIds(taskId: string): Promise<string[]> {
    const rows = await this.prisma.taskFollower.findMany({ where: { taskId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  /** Notify users (minus the actor). Users who can't see the project are skipped. */
  async notify(
    task: TaskRef,
    actor: UserContext,
    type: NotificationType,
    userIds: string[],
    title: string,
    body?: string | null,
  ): Promise<void> {
    const recipients = [...new Set(userIds)].filter((id) => id !== actor.id);
    if (!recipients.length) return;
    const allowed = await this.prisma.user.findMany({
      where: {
        id: { in: recipients },
        isActive: true,
        OR: [{ role: { in: ['ADMIN', 'MEMBER'] } }, { projectMemberships: { some: { projectId: task.projectId } } }],
      },
      select: { id: true },
    });
    const projectName =
      task.project?.name ??
      (await this.prisma.project.findUnique({ where: { id: task.projectId }, select: { name: true } }))?.name;
    const inputs: CreateNotificationInput[] = allowed.map((u) => ({
      userId: u.id,
      type,
      title,
      body: body ?? null,
      meta: {
        entityType: 'task',
        entityId: task.id,
        route: ['projects', task.projectId, 'tasks', task.id],
        actorUserId: actor.id,
        actorLabel: personName(actor),
        projectId: task.projectId,
        projectName,
      },
    }));
    await this.delivery.deliverMany(inputs);
  }
}
