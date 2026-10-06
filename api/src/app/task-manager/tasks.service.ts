import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { isAdminRole } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { projectRootPrefix } from '../storage/storage-keys.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateTaskDto, MoveTaskDto, UpdateTaskDto } from './dto/task-manager.dto';
import { TaskAccessService } from './task-access.service';
import { TaskEventsService } from './task-events.service';
import { coerceFieldValue, FieldOption, FieldType } from './task-fields.util';
import {
  commentInclude,
  person,
  taskSummaryInclude,
  toAttachment,
  toComment,
  toField,
  toTaskSummary,
} from './task-mappers';
import { extractMentionedUserIds, htmlToPlainText } from './task-mentions.util';
import { ORDER_STEP, orderBetween, renumber } from './task-order.util';
import { personName, personSelect } from './task-people.util';
import { describeRecurrence, nextDueDate, normalizeRecurrence, TaskRecurrence } from './task-recurrence.util';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function parseDateOnly(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function fmtDate(d: Date | null): string {
  if (!d) return 'no due date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

type Uploaded = { buffer: Buffer; mimetype: string; originalname: string; size: number };

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly events: TaskEventsService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // ── Queries ───────────────────────────────────────────────────────────────

  async listForProject(user: UserContext, projectId: string, completed: 'incomplete' | 'completed' | 'all' = 'all') {
    await this.access.assertProject(user, projectId, 'view');
    const rows = await this.prisma.task.findMany({
      where: {
        projectId,
        parentTaskId: null,
        ...(completed === 'incomplete' ? { isCompleted: false } : {}),
        ...(completed === 'completed' ? { isCompleted: true } : {}),
      },
      include: taskSummaryInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTaskSummary);
  }

  /** Tasks (and subtasks) assigned to the current user across visible projects. */
  async myTasks(user: UserContext, includeCompletedDays = 0) {
    const visible = await this.access.visibleProjectIds(user);
    const since = includeCompletedDays > 0 ? new Date(Date.now() - includeCompletedDays * 86400000) : null;
    const rows = await this.prisma.task.findMany({
      where: {
        assigneeId: user.id,
        ...(visible ? { projectId: { in: visible } } : {}),
        OR: [{ isCompleted: false }, ...(since ? [{ isCompleted: true, completedAt: { gte: since } }] : [])],
      },
      include: {
        ...taskSummaryInclude,
        project: { select: { id: true, name: true, color: true } },
        parent: { select: { id: true, name: true } },
      },
      orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 1000,
    });
    return rows.map((row) => ({ ...toTaskSummary(row), project: row.project, parent: row.parent }));
  }

  async get(user: UserContext, taskId: string) {
    await this.access.assertTask(user, taskId, 'view');
    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        ...taskSummaryInclude,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            customFields: { orderBy: { sortOrder: 'asc' } },
          },
        },
        section: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, parentTaskId: true } },
        createdBy: { select: personSelect },
        completedBy: { select: personSelect },
        followers: { include: { user: { select: personSelect } }, orderBy: { createdAt: 'asc' } },
        attachments: { include: { uploadedBy: { select: personSelect } }, orderBy: { createdAt: 'asc' } },
        comments: { include: commentInclude, orderBy: { createdAt: 'asc' } },
      },
    });
    const subtasks = await this.prisma.task.findMany({
      where: { parentTaskId: taskId },
      include: taskSummaryInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const projectId = task.projectId;
    const [canEdit, canComment] = await Promise.all([
      this.access.can(user, projectId, 'edit'),
      this.access.can(user, projectId, 'comment'),
    ]);
    return {
      ...toTaskSummary(task),
      description: task.description,
      project: { id: task.project.id, name: task.project.name, color: task.project.color },
      customFields: task.project.customFields.map(toField),
      section: task.section,
      parent: task.parent,
      createdBy: task.createdBy ? person(task.createdBy) : null,
      completedBy: task.completedBy ? person(task.completedBy) : null,
      followers: task.followers.map((f) => person(f.user)),
      isFollowing: task.followers.some((f) => f.userId === user.id),
      attachments: task.attachments.map(toAttachment),
      comments: task.comments.map(toComment),
      subtasks: subtasks.map(toTaskSummary),
      permissions: { canEdit, canComment },
    };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async create(user: UserContext, dto: CreateTaskDto) {
    let projectId = dto.projectId;
    let sectionId = dto.sectionId ?? null;
    const parentTaskId = dto.parentTaskId ?? null;
    if (parentTaskId) {
      const parent = await this.prisma.task.findUnique({ where: { id: parentTaskId }, select: { projectId: true } });
      if (!parent) throw new NotFoundException('Parent task not found');
      projectId = parent.projectId;
      sectionId = null;
    }
    await this.access.assertProject(user, projectId, 'edit');
    if (sectionId) await this.assertSectionInProject(sectionId, projectId);
    if (!parentTaskId && dto.sectionId === undefined) {
      const first = await this.prisma.taskSection.findFirst({ where: { projectId }, orderBy: { sortOrder: 'asc' } });
      sectionId = first?.id ?? null;
    }
    if (dto.assigneeId) await this.assertAssignable(dto.assigneeId, projectId);

    const scope = parentTaskId ? { parentTaskId } : { projectId, parentTaskId: null, sectionId };
    const sortOrder = await this.orderAfter(scope, dto.afterTaskId);
    const name = dto.name.trim() || 'Untitled task';

    const task = await this.prisma.task.create({
      data: {
        projectId,
        sectionId,
        parentTaskId,
        name,
        description: dto.description ?? null,
        assigneeId: dto.assigneeId ?? null,
        dueOn: parseDateOnly(dto.dueOn) ?? null,
        createdById: user.id,
        sortOrder,
      },
      include: { ...taskSummaryInclude, project: { select: { name: true } } },
    });
    await this.events.follow(task.id, [user.id, task.assigneeId]);
    await this.events.activity(task.id, user, 'created this task');
    if (task.assigneeId && task.assigneeId !== user.id) {
      await this.events.notify(task, user, 'task_assigned', [task.assigneeId], `${personName(user)} assigned you: ${task.name}`);
    }
    if (dto.description) await this.notifyMentions(task, user, dto.description, []);
    return toTaskSummary(task);
  }

  async update(user: UserContext, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { select: { name: true } }, assignee: { select: personSelect } },
    });
    if (!existing) throw new NotFoundException('Task not found');
    await this.access.assertProject(user, existing.projectId, 'edit');

    const data: Prisma.TaskUncheckedUpdateInput = {};
    const activity: string[] = [];

    if (dto.name !== undefined && dto.name.trim() && dto.name.trim() !== existing.name) {
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      data.description = dto.description;
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      if (dto.assigneeId) await this.assertAssignable(dto.assigneeId, existing.projectId);
      data.assigneeId = dto.assigneeId;
      if (dto.assigneeId) {
        const assignee = await this.prisma.user.findUniqueOrThrow({ where: { id: dto.assigneeId }, select: personSelect });
        activity.push(dto.assigneeId === user.id ? 'assigned this task to themselves' : `assigned to ${personName(assignee)}`);
      } else {
        activity.push('unassigned this task');
      }
    }
    if (dto.dueOn !== undefined) {
      const due = parseDateOnly(dto.dueOn) ?? null;
      if ((due?.getTime() ?? null) !== (existing.dueOn?.getTime() ?? null)) {
        data.dueOn = due;
        if (!due) data.dueAt = null;
        activity.push(due ? `changed the due date to ${fmtDate(due)}` : 'removed the due date');
      }
    }
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.recurrence !== undefined) {
      let rule: TaskRecurrence | null;
      try {
        rule = normalizeRecurrence(dto.recurrence);
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid recurrence');
      }
      data.recurrence = rule ?? Prisma.JsonNull;
      activity.push(rule ? `set this task to repeat: ${describeRecurrence(rule).toLowerCase()}` : 'stopped this task from repeating');
    }

    let completedNow = false;
    if (dto.isCompleted !== undefined && dto.isCompleted !== existing.isCompleted) {
      data.isCompleted = dto.isCompleted;
      data.completedAt = dto.isCompleted ? new Date() : null;
      data.completedById = dto.isCompleted ? user.id : null;
      activity.push(dto.isCompleted ? 'completed this task' : 'marked this task incomplete');
      completedNow = dto.isCompleted;
    }

    if (Object.keys(data).length === 0) return this.summary(taskId);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: { project: { select: { name: true } } },
    });

    for (const line of activity) await this.events.activity(taskId, user, line);

    if (data.assigneeId) {
      await this.events.follow(taskId, [data.assigneeId as string]);
      await this.events.notify(updated, user, 'task_assigned', [data.assigneeId as string], `${personName(user)} assigned you: ${updated.name}`);
    }
    if (typeof data.description === 'string') {
      await this.notifyMentions(updated, user, data.description, extractMentionedUserIds(existing.description));
    }
    if (completedNow) {
      const followers = await this.events.followerIds(taskId);
      await this.events.notify(updated, user, 'task_completed', [...followers, existing.createdById ?? ''].filter(Boolean),
        `${personName(user)} completed: ${updated.name}`);
      const rule = normalizeRecurrence(updated.recurrence ?? null);
      if (rule) await this.createNextRecurrence(user, updated.id, rule);
    }
    return this.summary(taskId);
  }

  /** Reorder within / across sections, re-parent subtasks, or move to another project. */
  async move(user: UserContext, taskId: string, dto: MoveTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertProject(user, task.projectId, 'edit');

    if (dto.projectId && dto.projectId !== task.projectId) {
      if (task.parentTaskId) throw new BadRequestException('Move the parent task to change projects');
      await this.access.assertProject(user, dto.projectId, 'edit');
      const target = await this.prisma.project.findUniqueOrThrow({ where: { id: dto.projectId }, select: { name: true } });
      const firstSection = await this.prisma.taskSection.findFirst({ where: { projectId: dto.projectId }, orderBy: { sortOrder: 'asc' } });
      const sortOrder = await this.orderAfter({ projectId: dto.projectId, parentTaskId: null, sectionId: firstSection?.id ?? null }, undefined);
      const subtreeIds = await this.subtreeIds(taskId);
      await this.prisma.$transaction([
        this.prisma.task.update({ where: { id: taskId }, data: { projectId: dto.projectId, sectionId: firstSection?.id ?? null, sortOrder } }),
        this.prisma.task.updateMany({ where: { id: { in: subtreeIds } }, data: { projectId: dto.projectId } }),
        // Custom fields are per-project; values don't carry over.
        this.prisma.taskCustomFieldValue.deleteMany({ where: { taskId: { in: [taskId, ...subtreeIds] } } }),
      ]);
      await this.events.activity(taskId, user, `moved this task to ${target.name}`);
      return this.summary(taskId);
    }

    const sectionId = task.parentTaskId ? null : dto.sectionId !== undefined ? dto.sectionId : task.sectionId;
    if (sectionId) await this.assertSectionInProject(sectionId, task.projectId);
    const scope = task.parentTaskId
      ? { parentTaskId: task.parentTaskId }
      : { projectId: task.projectId, parentTaskId: null, sectionId };
    const sortOrder = await this.orderAfter(scope, dto.afterTaskId ?? null, taskId);
    await this.prisma.task.update({ where: { id: taskId }, data: { sectionId, sortOrder } });
    if (sectionId !== task.sectionId && sectionId) {
      const section = await this.prisma.taskSection.findUnique({ where: { id: sectionId }, select: { name: true } });
      await this.events.activity(taskId, user, `moved this task to “${section?.name}”`);
    }
    return this.summary(taskId);
  }

  async remove(user: UserContext, taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertProject(user, task.projectId, 'edit');
    const ids = [taskId, ...(await this.subtreeIds(taskId))];
    const files = await this.prisma.taskAttachment.findMany({ where: { taskId: { in: ids }, fileUrl: { not: null } }, select: { fileUrl: true } });
    await this.prisma.task.delete({ where: { id: taskId } });
    for (const f of files) await this.storage.delete(f.fileUrl as string).catch(() => undefined);
    return { deleted: true };
  }

  async setFieldValue(user: UserContext, taskId: string, fieldId: string, value: unknown) {
    const projectId = await this.access.assertTask(user, taskId, 'edit');
    const field = await this.prisma.taskCustomField.findUnique({ where: { id: fieldId } });
    if (!field || field.projectId !== projectId) throw new NotFoundException('Field not found on this project');
    let coerced: unknown;
    try {
      coerced = coerceFieldValue(field.type as FieldType, (field.options as FieldOption[] | null) ?? [], value);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid value');
    }
    if (coerced === null) {
      await this.prisma.taskCustomFieldValue.deleteMany({ where: { taskId, fieldId } });
    } else {
      await this.prisma.taskCustomFieldValue.upsert({
        where: { taskId_fieldId: { taskId, fieldId } },
        create: { taskId, fieldId, value: coerced as Prisma.InputJsonValue },
        update: { value: coerced as Prisma.InputJsonValue },
      });
    }
    return this.summary(taskId);
  }

  async setFollowing(user: UserContext, taskId: string, userId: string, following: boolean) {
    const projectId = await this.access.assertTask(user, taskId, userId === user.id ? 'view' : 'edit');
    if (following) {
      if (userId !== user.id) await this.assertAssignable(userId, projectId);
      await this.events.follow(taskId, [userId]);
    } else {
      await this.prisma.taskFollower.deleteMany({ where: { taskId, userId } });
    }
    return { following };
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async addComment(user: UserContext, taskId: string, body: string) {
    await this.access.assertTask(user, taskId, 'comment');
    if (!htmlToPlainText(body, 10000).trim() && !/<img\b/i.test(body)) throw new BadRequestException('Comment is empty');
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { project: { select: { name: true } } } });
    const comment = await this.prisma.taskComment.create({
      data: { taskId, authorId: user.id, body },
      include: commentInclude,
    });
    const mentioned = extractMentionedUserIds(body);
    const followersBefore = await this.events.followerIds(taskId);
    await this.events.follow(taskId, [user.id, ...mentioned]);
    const preview = htmlToPlainText(body);
    await this.events.notify(task, user, 'task_mention', mentioned, `${personName(user)} mentioned you on ${task.name}`, preview);
    await this.events.notify(
      task,
      user,
      'task_comment',
      followersBefore.filter((id) => !mentioned.includes(id)),
      `${personName(user)} commented on ${task.name}`,
      preview,
    );
    return toComment(comment);
  }

  async updateComment(user: UserContext, commentId: string, body: string) {
    const comment = await this.prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.kind !== 'COMMENT') throw new NotFoundException('Comment not found');
    await this.access.assertTask(user, comment.taskId, 'comment');
    if (comment.authorId !== user.id) throw new ForbiddenException('You can only edit your own comments');
    const updated = await this.prisma.taskComment.update({
      where: { id: commentId },
      data: { body, editedAt: new Date() },
      include: commentInclude,
    });
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: comment.taskId }, include: { project: { select: { name: true } } } });
    await this.notifyMentions(task, user, body, extractMentionedUserIds(comment.body));
    return toComment(updated);
  }

  async deleteComment(user: UserContext, commentId: string) {
    const comment = await this.prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.kind !== 'COMMENT') throw new NotFoundException('Comment not found');
    await this.access.assertTask(user, comment.taskId, 'comment');
    if (comment.authorId !== user.id && !isAdminRole(user.role)) throw new ForbiddenException('You can only delete your own comments');
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    return { deleted: true };
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  async uploadAttachment(user: UserContext, taskId: string, file: Uploaded | undefined) {
    if (!file) throw new BadRequestException('file is required');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException('File is larger than 25 MB');
    const projectId = await this.access.assertTask(user, taskId, 'comment');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { clientId: true } });
    const key = `${projectRootPrefix(project.clientId, projectId)}/tasks/${taskId}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.upload({ buffer: file.buffer, key, mimeType: file.mimetype });
    const row = await this.prisma.taskAttachment.create({
      data: {
        taskId,
        uploadedById: user.id,
        fileName: file.originalname,
        fileUrl: key,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      include: { uploadedBy: { select: personSelect } },
    });
    await this.events.activity(taskId, user, `attached ${file.originalname}`);
    return toAttachment(row);
  }

  async deleteAttachment(user: UserContext, attachmentId: string) {
    const row = await this.prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
    if (!row) throw new NotFoundException('Attachment not found');
    await this.access.assertTask(user, row.taskId, 'edit');
    await this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
    if (row.fileUrl) await this.storage.delete(row.fileUrl).catch(() => undefined);
    return { deleted: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async summary(taskId: string) {
    const row = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskSummaryInclude });
    return toTaskSummary(row);
  }

  private async notifyMentions(
    task: { id: string; name: string; projectId: string; project?: { name: string } | null },
    user: UserContext,
    html: string,
    previouslyMentioned: string[],
  ) {
    const fresh = extractMentionedUserIds(html).filter((id) => !previouslyMentioned.includes(id));
    if (!fresh.length) return;
    await this.events.follow(task.id, fresh);
    await this.events.notify(task, user, 'task_mention', fresh, `${personName(user)} mentioned you on ${task.name}`, htmlToPlainText(html));
  }

  private async createNextRecurrence(user: UserContext, taskId: string, rule: TaskRecurrence) {
    const done = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { fieldValues: true, followers: true },
    });
    const due = nextDueDate(rule, done.dueOn, new Date());
    const scope = done.parentTaskId
      ? { parentTaskId: done.parentTaskId }
      : { projectId: done.projectId, parentTaskId: null, sectionId: done.sectionId };
    const next = await this.prisma.task.create({
      data: {
        projectId: done.projectId,
        sectionId: done.sectionId,
        parentTaskId: done.parentTaskId,
        name: done.name,
        description: done.description,
        assigneeId: done.assigneeId,
        createdById: user.id,
        dueOn: due,
        recurrence: rule as unknown as Prisma.InputJsonValue,
        recurredFromId: done.id,
        sortOrder: await this.orderAfter(scope, done.id),
        fieldValues: {
          create: done.fieldValues.map((v) => ({ fieldId: v.fieldId, value: v.value as Prisma.InputJsonValue })),
        },
      },
    });
    await this.events.follow(next.id, done.followers.map((f) => f.userId));
    await this.events.activity(next.id, user, `created this repeating task (next due ${fmtDate(due)})`);
    return next;
  }

  private async subtreeIds(taskId: string): Promise<string[]> {
    const ids: string[] = [];
    let frontier = [taskId];
    while (frontier.length) {
      const children = await this.prisma.task.findMany({ where: { parentTaskId: { in: frontier } }, select: { id: true } });
      frontier = children.map((c) => c.id);
      ids.push(...frontier);
    }
    return ids;
  }

  private async assertSectionInProject(sectionId: string, projectId: string) {
    const section = await this.prisma.taskSection.findUnique({ where: { id: sectionId }, select: { projectId: true } });
    if (!section || section.projectId !== projectId) throw new BadRequestException('Section is not in this project');
  }

  /** Assignee must be active staff or a member of the project. */
  private async assertAssignable(userId: string, projectId: string) {
    const ok = await this.prisma.user.count({
      where: {
        id: userId,
        isActive: true,
        OR: [{ role: { in: ['ADMIN', 'MEMBER'] } }, { projectMemberships: { some: { projectId } } }],
      },
    });
    if (!ok) throw new BadRequestException('That person is not on this project');
  }

  /**
   * Sort order to place an item after `afterTaskId` among siblings in `scope`.
   * undefined = bottom, null = top. Renumbers siblings if the fractional gap runs out.
   */
  private async orderAfter(
    scope: Prisma.TaskWhereInput,
    afterTaskId: string | null | undefined,
    excludeId?: string,
  ): Promise<number> {
    const siblings = await this.prisma.task.findMany({
      where: { ...scope, ...(excludeId ? { id: { not: excludeId } } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, sortOrder: true },
    });
    if (afterTaskId === undefined) return (siblings.at(-1)?.sortOrder ?? 0) + ORDER_STEP;
    const index = afterTaskId === null ? -1 : siblings.findIndex((s) => s.id === afterTaskId);
    if (afterTaskId !== null && index < 0) return (siblings.at(-1)?.sortOrder ?? 0) + ORDER_STEP;
    const order = orderBetween(index >= 0 ? siblings[index].sortOrder : null, siblings[index + 1]?.sortOrder ?? null);
    if (order !== null) return order;
    await this.prisma.$transaction(
      renumber(siblings).map((r) => this.prisma.task.update({ where: { id: r.id }, data: { sortOrder: r.sortOrder } })),
    );
    return (index + 1) * ORDER_STEP + ORDER_STEP / 2;
  }
}
