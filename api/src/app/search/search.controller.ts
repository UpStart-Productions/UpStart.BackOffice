import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserContext } from '../common/app.types';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PeopleSearchQueryDto } from './dto/people-search-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { PeopleDirectoryService } from './people-directory.service';
import { SearchService } from './search.service';
import { AccessGuard, Area, SignedIn } from '../access/access.guard';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@SignedIn()
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly peopleDirectory: PeopleDirectoryService,
  ) {}

  @Get()
  async searchGlobal(@Req() req: Request, @Query() query: SearchQueryDto) {
    return this.search.search(req.user as UserContext, query.q);
  }

  /** People anywhere in Back Office (for project contacts, etc.). */
  @Get('people')
  @Area('projects')
  searchPeople(@Query() query: PeopleSearchQueryDto) {
    return this.peopleDirectory.search(query.q ?? '', query.excludeProjectId, query.limit);
  }
}
