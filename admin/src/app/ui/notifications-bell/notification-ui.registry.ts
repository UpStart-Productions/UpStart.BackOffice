import type { UserNotificationDto } from '@upstart/back-office/shared';
import type { NotificationsApiService } from '../../core/notifications-api.service';

/** Optional row action (approve, open modal, etc.) for a notification type. */
export type NotificationUiAction = {
  id: string;
  label: string;
  icon?: string;
  /** When set, styles like Nonprofit approve (primary) or decline (danger). */
  tone?: 'approve' | 'decline' | 'default';
  disabled?: boolean;
  run: (notification: UserNotificationDto, api: NotificationsApiService) => Promise<void>;
};

/**
 * Per-type UI extensions for the bell. Add entries here when a notification needs
 * more than title + link + mark read (e.g. inline approve/decline).
 *
 * Delivery: add the type to `NOTIFICATION_TYPES` in libs/shared and create rows via
 * `NotificationDeliveryService.deliver()` on the API.
 */
export function notificationUiActions(_notification: UserNotificationDto): NotificationUiAction[] {
  return [];
}

/** Override route resolution for types that need logic beyond `meta.route`. */
export function notificationUiRoute(
  notification: UserNotificationDto,
  defaultRoute: string[] | null,
): string[] | null {
  return defaultRoute;
}
