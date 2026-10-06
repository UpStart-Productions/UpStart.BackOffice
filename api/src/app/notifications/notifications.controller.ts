import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { TaskManagerAuthGuard } from '../auth/task-manager-auth.guard';
import { EmailPreferencesDto, ListNotificationsQueryDto, MarkReadDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(TaskManagerAuthGuard)
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
    return { email: await this.notifications.getEmailPreferences(req.user!.id) };
  }

  @Put('preferences')
  async setPreferences(@Req() req: Request, @Body() dto: EmailPreferencesDto) {
    return { email: await this.notifications.setEmailPreferences(req.user!.id, { ...dto }) };
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
