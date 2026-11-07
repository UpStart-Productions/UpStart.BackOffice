import type { EmailPreferences, MeDto } from '@upstart/back-office/shared';
import {
  notificationPrefGroups,
  type NotificationPrefGroup,
  type NotificationPrefRow,
} from '@upstart/back-office/shared';

/** @deprecated Use `notificationPrefGroups` from shared and `app-notification-prefs`. */
export type EmailPrefRow = NotificationPrefRow;
export type EmailPrefGroup = NotificationPrefGroup;
export type EmailPrefsState = EmailPreferences;

export function emailNotificationPrefGroups(me: MeDto | null | undefined): NotificationPrefGroup[] {
  return notificationPrefGroups(me);
}
