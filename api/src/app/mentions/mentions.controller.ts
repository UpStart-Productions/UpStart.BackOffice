import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserContext } from '../common/app.types';
import { AccessGuard, SignedIn } from '../access/access.guard';
import { ListMentionCandidatesQueryDto } from './dto/list-mention-candidates.dto';
import { MentionsService } from './mentions.service';

@ApiTags('mentions')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@SignedIn()
@Controller('mentions')
export class MentionsController {
  constructor(private readonly mentions: MentionsService) {}

  @Get('candidates')
  candidates(@Req() req: Request, @Query() query: ListMentionCandidatesQueryDto) {
    const user = req.user as UserContext;
    return this.mentions
      .listCandidates(user, {
        q: query.q,
        clientId: query.clientId ?? null,
        projectId: query.projectId ?? null,
        context: query.context ?? null,
        limit: query.limit,
      })
      .then((candidates) => ({ candidates }));
  }
}
