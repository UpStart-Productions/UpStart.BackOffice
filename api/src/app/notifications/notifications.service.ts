import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  EmailPreferences,
  InAppPreferences,
  NotificationMeta,
  PushPreferences,
  NotificationChannelPreferences,
  NotificationType,
  UserNotificationDto,
} from './notification.types';
import { CreateNotificationInput, NOTIFICATION_TYPES } from './notification.types';
import {
  channelEnabled,
  type ChannelPreferences,
  type NotificationChannel,
  resolveChannelPreferences,
} from '@upstart/back-office/shared';

function toDto(row: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  meta: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): UserNotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    meta: (row.meta as NotificationMeta | null) ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** In-app notification inbox (ported from KC.SPP.WebApp, organizations removed). */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput): Promise<UserNotificationDto> {
    let tenantId = input.tenantId?.trim();
    if (!tenantId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { tenantId: true },
      });
      tenantId = user?.tenantId ?? undefined;
    }
    if (!tenantId) {
      throw new Error(`Cannot create notification for user ${input.userId}: missing tenantId`);
    }

    const row = await this.prisma.userNotification.create({
      data: {
        tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        meta: input.meta == null ? Prisma.JsonNull : (input.meta as Prisma.InputJsonValue),
      },
    });
    return toDto(row);
  }

  async listForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number; includeArchived?: boolean } = {},
  ): Promise<UserNotificationDto[]> {
    const take = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const rows = await this.prisma.userNotification.findMany({
      where: {
        userId,
        ...(options.includeArchived ? {} : { deletedAt: null }),
        ...(options.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map(toDto);
  }

  unreadCountForUser(userId: string): Promise<number> {
    return this.prisma.userNotification.count({ where: { userId, deletedAt: null, readAt: null } });
  }

  async markRead(userId: string, id: string, read = true): Promise<boolean> {
    const result = await this.prisma.userNotification.updateMany({
      where: { id, userId, deletedAt: null },
      data: { readAt: read ? new Date() : null },
    });
    return result.count > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId, deletedAt: null, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /** Archive (Asana-style) — hides from the inbox. */
  async dismiss(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.userNotification.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), readAt: new Date() },
    });
    return result.count > 0;
  }

  private async storedPrefs(userId: string) {
    return this.prisma.userNotificationPreference.findUnique({ where: { userId } });
  }

  async getChannelPreferences(userId: string): Promise<ChannelPreferences> {
    const row = await this.storedPrefs(userId);
    return resolveChannelPreferences({
      email: (row?.emailPreferences as EmailPreferences | null) ?? {},
      inApp: (row?.inAppPreferences as InAppPreferences | null) ?? {},
      push: (row?.pushPreferences as PushPreferences | null) ?? {},
    });
  }

  async setChannelPreferences(
    userId: string,
    patch: NotificationChannelPreferences,
  ): Promise<ChannelPreferences> {
    const row = await this.storedPrefs(userId);
    const email: EmailPreferences = { ...((row?.emailPreferences as EmailPreferences | null) ?? {}) };
    const inApp: InAppPreferences = { ...((row?.inAppPreferences as InAppPreferences | null) ?? {}) };
    const push: PushPreferences = { ...((row?.pushPreferences as PushPreferences | null) ?? {}) };

    for (const type of NOTIFICATION_TYPES) {
      const delta = patch[type];
      if (!delta) continue;
      if (typeof delta.email === 'boolean') email[type] = delta.email;
      if (typeof delta.inApp === 'boolean') inApp[type] = delta.inApp;
      if (typeof delta.push === 'boolean') push[type] = delta.push;
    }

    await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        emailPreferences: email as Prisma.InputJsonValue,
        inAppPreferences: inApp as Prisma.InputJsonValue,
        pushPreferences: push as Prisma.InputJsonValue,
      },
      update: {
        emailPreferences: email as Prisma.InputJsonValue,
        inAppPreferences: inApp as Prisma.InputJsonValue,
        pushPreferences: push as Prisma.InputJsonValue,
      },
    });
    return this.getChannelPreferences(userId);
  }

  async isChannelEnabled(userId: string, type: NotificationType, channel: NotificationChannel): Promise<boolean> {
    const prefs = await this.getChannelPreferences(userId);
    return channelEnabled(prefs, type, channel);
  }

  async getEmailPreferences(userId: string): Promise<Record<NotificationType, boolean>> {
    const channels = await this.getChannelPreferences(userId);
    return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, channels[type].email])) as Record<
      NotificationType,
      boolean
    >;
  }

  async setEmailPreferences(userId: string, prefs: EmailPreferences): Promise<Record<NotificationType, boolean>> {
    const patch: NotificationChannelPreferences = {};
    for (const type of NOTIFICATION_TYPES) {
      if (typeof prefs[type] === 'boolean') patch[type] = { email: prefs[type] };
    }
    const channels = await this.setChannelPreferences(userId, patch);
    return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, channels[type].email])) as Record<
      NotificationType,
      boolean
    >;
  }
}
