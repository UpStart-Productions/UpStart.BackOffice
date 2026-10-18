import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { UserContext } from '../common/app.types';
import { FileInteractionDto, LogInteractionDto } from './dto/communications.dto';
import { InteractionsService } from './interactions.service';

@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Get('accounts/:clientId/timeline')
  accountTimeline(@Param('clientId') clientId: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.interactions.timeline({ clientId }, { limit, before });
  }

  @Get('leads/:leadId/timeline')
  leadTimeline(@Param('leadId') leadId: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.interactions.timeline({ leadId }, { limit, before });
  }

  @Get('unfiled')
  unfiled(@Query('limit') limit?: string, @Query('before') before?: string) {
    return this.interactions.unfiled({ limit, before });
  }

  @Get('unfiled/count')
  unfiledCount() {
    return this.interactions.unfiledCount();
  }

  @Get('interactions/:id')
  get(@Param('id') id: string) {
    return this.interactions.get(id);
  }

  @Post('interactions')
  log(@Body() dto: LogInteractionDto, @Req() req: Request) {
    const user = req.user as UserContext;
    return this.interactions.log(dto, { id: user.id, email: user.email });
  }

  @Post('interactions/:id/file')
  file(@Param('id') id: string, @Body() dto: FileInteractionDto) {
    return this.interactions.file(id, dto);
  }

  @Post('interactions/:id/unfile')
  unfile(@Param('id') id: string) {
    return this.interactions.unfile(id);
  }
}
