import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { TaskManagerModule } from '../task-manager/task-manager.module';
import { MentionsController } from './mentions.controller';
import { MentionsService } from './mentions.service';

@Module({
  imports: [AccessModule, TaskManagerModule],
  controllers: [MentionsController],
  providers: [MentionsService],
})
export class MentionsModule {}
