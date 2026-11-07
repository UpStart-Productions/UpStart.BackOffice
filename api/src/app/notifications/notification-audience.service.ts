import { Injectable } from '@nestjs/common';
import type { PermissionArea } from '@upstart/back-office/shared';
import { PrismaService } from '../prisma/prisma.service';
import { usersWithArea } from '../access/access.service';

/**
 * Resolves who may receive a notification. Delivery still checks per-user channel prefs and excludes the actor at the call site.
 */
@Injectable()
export class NotificationAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active back-office users with the area at "all" (includes admins). */
  async userIdsWithAreaAll(area: PermissionArea, options?: { excludeUserId?: string }): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, ...usersWithArea(area, 'all') },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (options?.excludeUserId) return ids.filter((id) => id !== options.excludeUserId);
    return ids;
  }

  /** Dedupe explicit user ids, drop inactive. */
  async filterActiveUserIds(userIds: string[], options?: { excludeUserId?: string }): Promise<string[]> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true },
    });
    let ids = rows.map((r) => r.id);
    if (options?.excludeUserId) ids = ids.filter((id) => id !== options.excludeUserId);
    return ids;
  }
}
