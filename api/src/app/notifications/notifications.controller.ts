import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import type { NotificationChannelPreferences } from '@upstart/back-office/shared';
import {
  EmailPreferencesDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationPreferencesDto,
  SetNotificationPreferencesBodyDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';
import { AccessGuard, SignedIn } from '../access/access.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@SignedIn()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Req() req: Request, @Query() query: ListNotificationsQueryDto) {
    if (query.archived) {
      const all = await this.notifications.listForUser(req.user!.id, { includeArchived: true, limit: query.limit });
      return { notifications: all };
    }
    const notifications = await this.notifications.listForUser(req.user!.id, {
      unreadOnly: query.unreadOnly,
      limit: query.limit,
    });
    return { notifications };
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    return { count: await this.notifications.unreadCountForUser(req.user!.id) };
  }

  @Post('read-all')
  async readAll(@Req() req: Request) {
    return { count: await this.notifications.markAllRead(req.user!.id) };
  }

  @Get('preferences')
  async preferences(@Req() req: Request) {
    const preferences = await this.notifications.getChannelPreferences(req.user!.id);
    const email = Object.fromEntries(
      Object.entries(preferences).map(([type, ch]) => [type, ch.email]),
    ) as Record<string, boolean>;
    return { preferences, email };
  }

  @Put('preferences')
  async setPreferences(
    @Req() req: Request,
    @Body() body: SetNotificationPreferencesBodyDto & EmailPreferencesDto & NotificationPreferencesDto,
  ) {
    const userId = req.user!.id;
    if (body.preferences) {
      const patch = body.preferences as NotificationChannelPreferences;
      const preferences = await this.notifications.setChannelPreferences(userId, patch);
      const email = Object.fromEntries(Object.entries(preferences).map(([type, ch]) => [type, ch.email]));
      return { preferences, email };
    }
    const hasChannelRows = Object.keys(body).some(
      (k) => typeof (body as NotificationPreferencesDto)[k as keyof NotificationPreferencesDto] === 'object',
    );
    if (hasChannelRows) {
      const preferences = await this.notifications.setChannelPreferences(userId, body as NotificationChannelPreferences);
      const email = Object.fromEntries(Object.entries(preferences).map(([type, ch]) => [type, ch.email]));
      return { preferences, email };
    }
    const email = await this.notifications.setEmailPreferences(userId, { ...body });
    const preferences = await this.notifications.getChannelPreferences(userId);
    return { preferences, email };
  }

  @Patch(':id/read')
  async markRead(@Req() req: Request, @Param('id') id: string, @Body() dto: MarkReadDto) {
    const ok = await this.notifications.markRead(req.user!.id, id, dto?.read ?? true);
    if (!ok) throw new NotFoundException('Notification not found');
    return { ok: true };
  }

  @Delete(':id')
  async dismiss(@Req() req: Request, @Param('id') id: string) {
    const ok = await this.notifications.dismiss(req.user!.id, id);
    if (!ok) throw new NotFoundException('Notification not found');
    return { ok: true };
  }
}
