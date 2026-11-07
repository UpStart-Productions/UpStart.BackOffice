import { Module } from '@nestjs/common';
import { AsanaModule } from '../asana/asana.module';
import { TaskManagerModule } from '../task-manager/task-manager.module';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [AsanaModule, TaskManagerModule],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
