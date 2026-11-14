import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { isBackOfficeRole } from '@upstart/back-office/shared';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { CreateHelpAgentThreadDto, UpdateHelpAgentThreadDto } from './dto/help-agent-threads.dto';
import { HelpAgentThreadsService } from './help-agent-threads.service';

/** Saved JD conversations: the signed-in person's own, nobody else's. */
@ApiTags('help-agent')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('help-agent/threads')
export class HelpAgentThreadsController {
  constructor(private readonly threads: HelpAgentThreadsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.threads.list(this.userId(req));
  }

  @Get('for-record')
  forRecord(@Req() req: Request, @Query('recordType') recordType: string, @Query('recordId') recordId: string) {
    if (!recordType || !recordId) return null;
    return this.threads.forRecord(this.userId(req), recordType, recordId);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.threads.get(this.userId(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateHelpAgentThreadDto) {
    return this.threads.create(this.userId(req), dto);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHelpAgentThreadDto) {
    return this.threads.update(this.userId(req), id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.threads.remove(this.userId(req), id);
  }

  private userId(req: Request): string {
    const user = req.user!;
    if (!isBackOfficeRole(user.role)) throw new ForbiddenException('Help Agent is only available in the back office.');
    return user.id;
  }
}
