import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationInput,
  EmailPreferences,
  NOTIFICATION_TYPES,
  NotificationMeta,
  NotificationType,
  UserNotificationDto,
} from './notification.types';

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
    const row = await this.prisma.userNotification.create({
      data: {
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

  async getEmailPreferences(userId: string): Promise<Record<NotificationType, boolean>> {
    const row = await this.prisma.userNotificationPreference.findUnique({ where: { userId } });
    const stored = (row?.emailPreferences as EmailPreferences | null) ?? {};
    return Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type, stored[type] !== false]),
    ) as Record<NotificationType, boolean>;
  }

  async setEmailPreferences(userId: string, prefs: EmailPreferences): Promise<Record<NotificationType, boolean>> {
    const current = await this.getEmailPreferences(userId);
    const next: EmailPreferences = { ...current };
    for (const type of NOTIFICATION_TYPES) {
      if (typeof prefs[type] === 'boolean') next[type] = prefs[type];
    }
    await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, emailPreferences: next as Prisma.InputJsonValue },
      update: { emailPreferences: next as Prisma.InputJsonValue },
    });
    return this.getEmailPreferences(userId);
  }
}
