import { Module } from '@nestjs/common';
import { AsanaModule } from '../asana/asana.module';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [AsanaModule],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
