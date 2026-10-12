import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PeopleSearchQueryDto } from './dto/people-search-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { PeopleDirectoryService } from './people-directory.service';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly peopleDirectory: PeopleDirectoryService,
  ) {}

  @Get()
  async searchGlobal(@Query() query: SearchQueryDto) {
    return this.search.search(query.q);
  }

  /** People anywhere in Back Office (for project contacts, etc.). */
  @Get('people')
  searchPeople(@Query() query: PeopleSearchQueryDto) {
    return this.peopleDirectory.search(query.q, query.excludeProjectId, query.limit);
  }
}
