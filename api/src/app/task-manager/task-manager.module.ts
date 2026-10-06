import { Module } from '@nestjs/common';
import { InvitesModule } from '../invites/invites.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskAccessService } from './task-access.service';
import { TaskEventsService } from './task-events.service';
import { TaskManagerController } from './task-manager.controller';
import { TaskProjectsService } from './task-projects.service';
import { TasksService } from './tasks.service';

@Module({
  imports: [NotificationsModule, InvitesModule],
  controllers: [TaskManagerController],
  providers: [TaskAccessService, TaskEventsService, TaskProjectsService, TasksService],
  exports: [TaskAccessService, TaskEventsService, TasksService],
})
export class TaskManagerModule {}
