import type { NotificationMeta, NotificationType } from '@upstart/back-office/shared';

export type {
  EmailPreferences,
  NotificationMeta,
  NotificationType,
  UserNotificationDto,
} from '@upstart/back-office/shared';

export { NOTIFICATION_TYPES } from '@upstart/back-office/shared';

/** API input for creating a row (tenantId optional — resolved from the user when omitted). */
export type CreateNotificationInput = {
  userId: string;
  tenantId?: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  meta?: NotificationMeta | null;
};
