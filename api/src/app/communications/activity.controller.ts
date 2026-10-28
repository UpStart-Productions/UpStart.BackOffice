import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserContext } from '../common/app.types';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { ActivityService } from './activity.service';
import { ActivityFeedQueryDto, ActivityQueuesQueryDto, SetNextStepDto, SnoozeDto } from './dto/activity.dto';

/**
 * Activity: the timeline across organizations and people, To do queues, and an organization's next step.
 * The Activity page uses the inbox area (labelled Activity); record pages reach the feed and next step through
 * Organizations, People or Pipeline access.
 */
@ApiTags('activity')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('inbox')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @Area('inbox', 'clients', 'contacts', 'pipeline')
  feed(@Req() req: Request, @Query() q: ActivityFeedQueryDto) {
    return this.activity.feed(req.user as UserContext, q);
  }

  @Get('queues')
  queues(@Req() req: Request, @Query() q: ActivityQueuesQueryDto) {
    return this.activity.queues(req.user as UserContext, q);
  }

  @Get('queues/count')
  count(@Req() req: Request) {
    return this.activity.count(req.user as UserContext);
  }

  @Action('edit')
  @Post('snooze')
  snooze(@Req() req: Request, @Body() dto: SnoozeDto) {
    return this.activity.snooze(req.user as UserContext, dto);
  }

  @Get('organizations/:clientId/next-step')
  @Area('inbox', 'clients', 'pipeline')
  nextStep(@Req() req: Request, @Param('clientId') clientId: string) {
    return this.activity.nextStep(req.user as UserContext, clientId);
  }

  @Action('edit')
  @Put('organizations/:clientId/next-step')
  @Area('inbox', 'clients', 'pipeline')
  setNextStep(@Req() req: Request, @Param('clientId') clientId: string, @Body() dto: SetNextStepDto) {
    return this.activity.setNextStep(req.user as UserContext, clientId, dto);
  }

  @Action('edit')
  @Post('organizations/:clientId/next-step/done')
  @Area('inbox', 'clients', 'pipeline')
  completeNextStep(@Req() req: Request, @Param('clientId') clientId: string) {
    return this.activity.completeNextStep(req.user as UserContext, clientId);
  }
}
