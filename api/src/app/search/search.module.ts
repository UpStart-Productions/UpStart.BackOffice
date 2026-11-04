import { Module } from '@nestjs/common';
import { TaskManagerModule } from '../task-manager/task-manager.module';
import { PeopleDirectoryService } from './people-directory.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TaskManagerModule],
  controllers: [SearchController],
  providers: [SearchService, PeopleDirectoryService],
})
export class SearchModule {}
