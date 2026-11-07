import { Module } from '@nestjs/common';
import { AsanaModule } from '../asana/asana.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskManagerModule } from '../task-manager/task-manager.module';
import { ProjectPipelineService } from './project-pipeline.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [AsanaModule, TaskManagerModule, NotificationsModule],
  controllers: [ProjectsController],
  providers: [ProjectPipelineService],
})
export class ProjectsModule {}
