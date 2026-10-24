import { Injectable, inject } from '@angular/core';
import {
  NOTIFICATIONS_API,
  resolveNotificationRoute,
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
}
