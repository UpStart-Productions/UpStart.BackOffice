/** In-app notification types (bell). Add new types here, then wire delivery + optional UI registry. */
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
  /** Admin-app route segments, e.g. ['tasks', 'projects', projectId, 'tasks', taskId] */
  route?: string[];
  actorUserId?: string;
  actorLabel?: string;
  projectId?: string;
  projectName?: string;
  [key: string]: unknown;
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

export const NOTIFICATIONS_API = {
  list: '/notifications',
  unreadCount: '/notifications/unread-count',
  markRead: (id: string) => `/notifications/${id}/read`,
  dismiss: (id: string) => `/notifications/${id}`,
  readAll: '/notifications/read-all',
  preferences: '/notifications/preferences',
} as const;

/** Body text for bell/feed UI — drops a leading duplicate of `title`. */
export function notificationDisplayBody(
  title: string,
  body: string | null | undefined,
): string | null {
  const text = body?.trim();
  if (!text) return null;

  const normalizedTitle = title.trim();
  if (!normalizedTitle || !text.startsWith(normalizedTitle)) {
    return text;
  }

  const remainder = text.slice(normalizedTitle.length).replace(/^:\s*/, '').trim();
  return remainder || null;
}

/**
 * Resolve a router link from notification meta. Prefer explicit `meta.route`;
 * optional per-type handlers can extend this in the admin app registry.
 */
export function resolveNotificationRoute(
  notification: Pick<UserNotificationDto, 'type' | 'meta'>,
): string[] | null {
  const route = notification.meta?.route;
  if (Array.isArray(route) && route.length > 0 && route.every((s) => typeof s === 'string')) {
    return route.map((s) => (s.startsWith('/') ? s.slice(1) : s)).filter(Boolean);
  }

  const entityType = notification.meta?.entityType;
  const entityId = notification.meta?.entityId;
  const projectId = notification.meta?.projectId;

  if (entityType === 'task' && entityId && projectId) {
    return ['tasks', 'projects', projectId, 'tasks', entityId];
  }
  if (entityType === 'project' && entityId) {
    return ['tasks', 'projects', entityId];
  }

  return null;
}
