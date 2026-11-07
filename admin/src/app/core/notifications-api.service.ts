import { Injectable, inject } from '@angular/core';
import {
  NOTIFICATIONS_API,
  resolveNotificationRoute,
  type ChannelPreferences,
  type EmailPreferences,
  type NotificationChannelPreferences,
  type UserNotificationDto,
} from '@upstart/back-office/shared';
import { ApiService } from './api.service';

export type ListNotificationsResponse = { notifications: UserNotificationDto[] };
export type UnreadCountResponse = { count: number };

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly api = inject(ApiService);

  list(options?: { unreadOnly?: boolean; limit?: number }): Promise<ListNotificationsResponse> {
    const params = new URLSearchParams();
    if (options?.unreadOnly) params.set('unreadOnly', 'true');
    if (options?.limit != null) params.set('limit', String(options.limit));
    const qs = params.toString();
    const path = qs ? `${NOTIFICATIONS_API.list}?${qs}` : NOTIFICATIONS_API.list;
    return this.api.get<ListNotificationsResponse>(path);
  }

  unreadCount(): Promise<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>(NOTIFICATIONS_API.unreadCount);
  }

  markRead(id: string): Promise<{ ok: boolean }> {
    return this.api.patch<{ ok: boolean }>(NOTIFICATIONS_API.markRead(id), { read: true });
  }

  dismiss(id: string): Promise<{ ok: boolean }> {
    return this.api.delete<{ ok: boolean }>(NOTIFICATIONS_API.dismiss(id));
  }

  notificationRoute(notification: UserNotificationDto): string[] | null {
    return resolveNotificationRoute(notification);
  }

  channelPreferences(): Promise<ChannelPreferences> {
    return this.api
      .get<{ preferences: ChannelPreferences }>(NOTIFICATIONS_API.preferences)
      .then((r) => r.preferences);
  }

  setChannelPreferences(patch: NotificationChannelPreferences): Promise<ChannelPreferences> {
    return this.api
      .put<{ preferences: ChannelPreferences }>(NOTIFICATIONS_API.preferences, { preferences: patch })
      .then((r) => r.preferences);
  }

  emailPreferences(): Promise<EmailPreferences> {
    return this.api.get<{ email: EmailPreferences }>(NOTIFICATIONS_API.preferences).then((r) => r.email);
  }

  setEmailPreferences(prefs: Partial<EmailPreferences>): Promise<EmailPreferences> {
    return this.api
      .put<{ email: EmailPreferences }>(NOTIFICATIONS_API.preferences, prefs)
      .then((r) => r.email);
  }
}
