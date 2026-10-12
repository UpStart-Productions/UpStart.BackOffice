import { Module } from '@nestjs/common';
import { PeopleDirectoryService } from './people-directory.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, PeopleDirectoryService],
})
export class SearchModule {}
