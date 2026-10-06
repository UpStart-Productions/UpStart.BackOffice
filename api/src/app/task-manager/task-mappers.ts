import { Prisma } from '@prisma/client';
import { publicUrlForKey, toPublicAssetUrl } from '../storage/asset-url.util';
import { PersonDto, personSelect, toPerson } from './task-people.util';
import { TaskRecurrence } from './task-recurrence.util';

export const assetUrl = (stored: string | null) => toPublicAssetUrl(stored);
export const person = (u: Parameters<typeof toPerson>[0]) => toPerson(u, assetUrl);

/** Fields needed to render a task row in a list / grid. */
export const taskSummaryInclude = {
  assignee: { select: personSelect },
  fieldValues: { select: { fieldId: true, value: true } },
  _count: { select: { subtasks: true, comments: { where: { kind: 'COMMENT' } }, attachments: true } },
  subtasks: { where: { isCompleted: true }, select: { id: true } },
} satisfies Prisma.TaskInclude;

export type TaskSummaryRow = Prisma.TaskGetPayload<{ include: typeof taskSummaryInclude }>;

export type TaskSummaryDto = {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  name: string;
  assignee: PersonDto | null;
  dueOn: string | null;
  dueAt: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  sortOrder: number;
  recurrence: TaskRecurrence | null;
  subtaskCount: number;
  completedSubtaskCount: number;
  commentCount: number;
  attachmentCount: number;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function dateOnlyIso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toTaskSummary(row: TaskSummaryRow): TaskSummaryDto {
  return {
    id: row.id,
    projectId: row.projectId,
    sectionId: row.sectionId,
    parentTaskId: row.parentTaskId,
    name: row.name,
    assignee: row.assignee ? person(row.assignee) : null,
    dueOn: dateOnlyIso(row.dueOn),
    dueAt: row.dueAt?.toISOString() ?? null,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    recurrence: (row.recurrence as TaskRecurrence | null) ?? null,
    subtaskCount: row._count.subtasks,
    completedSubtaskCount: row.subtasks.length,
    commentCount: row._count.comments,
    attachmentCount: row._count.attachments,
    fields: Object.fromEntries(row.fieldValues.map((v) => [v.fieldId, v.value])),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const commentInclude = { author: { select: personSelect } } satisfies Prisma.TaskCommentInclude;
export type CommentRow = Prisma.TaskCommentGetPayload<{ include: typeof commentInclude }>;

export function toComment(row: CommentRow) {
  return {
    id: row.id,
    taskId: row.taskId,
    kind: row.kind,
    body: row.body,
    author: row.author ? person(row.author) : null,
    authorLabel: row.author ? null : row.authorLabel,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAttachment(row: {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string | null;
  url: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: Date;
  uploadedBy?: Parameters<typeof toPerson>[0] | null;
}) {
  return {
    id: row.id,
    taskId: row.taskId,
    fileName: row.fileName,
    url: row.fileUrl ? publicUrlForKey(row.fileUrl) : row.url,
    isLink: !row.fileUrl,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy ? person(row.uploadedBy) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toField(row: {
  id: string;
  projectId: string;
  name: string;
  type: string;
  options: Prisma.JsonValue;
  sortOrder: number;
}) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    options: (row.options as { id: string; label: string; color?: string }[] | null) ?? [],
    sortOrder: row.sortOrder,
  };
}
