import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserContext } from '../common/app.types';
import { CaptureSettingsService } from './capture-settings.service';
import { FileInteractionDto, LogInteractionDto } from './dto/communications.dto';
import { InteractionsService } from './interactions.service';
import { AccessGuard, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';

@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('inbox')
@Controller('communications')
export class CommunicationsController {
  constructor(
    private readonly interactions: InteractionsService,
    private readonly captureSettings: CaptureSettingsService,
    private readonly access: AccessService,
  ) {}

  /** The address to CC, for the Email button on clients, contacts and leads. (Full capture settings are admin-only.) */
  @Get('capture-address')
  @Area('inbox', 'clients', 'contacts', 'pipeline')
  captureAddress() {
    return this.captureSettings.address();
  }

  /** Shown on the client page, so Clients can read it too (only for clients the user can reach). */
  @Get('accounts/:clientId/timeline')
  @Area('inbox', 'clients')
  async accountTimeline(@Req() req: Request, @Param('clientId') clientId: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    const ids = await this.access.clientIds(req.user as UserContext);
    if (ids && !ids.includes(clientId)) throw new NotFoundException('Client not found');
    return this.interactions.timeline({ clientId }, { limit, before });
  }

  @Get('leads/:leadId/timeline')
  @Area('inbox', 'pipeline')
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
