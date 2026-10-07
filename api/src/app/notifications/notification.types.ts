export type NotificationType =
  | 'task_assigned'
  | 'task_mention'
  | 'task_comment'
  | 'task_completed'
  | 'project_added'
  | 'task_form_submission';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'task_assigned',
  'task_mention',
  'task_comment',
  'task_completed',
  'project_added',
  'task_form_submission',
];

/** Deep-link and display metadata stored as JSON on each notification row. */
export type NotificationMeta = {
  entityType?: 'task' | 'project' | string;
  entityId?: string;
  /** Admin-app route segments, e.g. ['/projects', projectId, 'tasks', taskId] */
  route?: string[];
  actorUserId?: string;
  actorLabel?: string;
  projectId?: string;
  projectName?: string;
  [key: string]: unknown;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  meta?: NotificationMeta | null;
};

export type UserNotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  meta: NotificationMeta | null;
  readAt: string | null;
  createdAt: string;
};

export type EmailPreferences = Partial<Record<NotificationType, boolean>>;
