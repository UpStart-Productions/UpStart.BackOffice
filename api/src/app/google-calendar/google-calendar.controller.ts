import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { UserContext } from '../common/app.types';
import { UpdateGoogleCalendarConfigDto } from './dto/update-google-calendar-config.dto';
import { UpdateGoogleCalendarSelectionDto } from './dto/update-google-calendar-selection.dto';
import { GoogleCalendarService } from './google-calendar.service';

function adminAppUrl(): string {
  const explicit = process.env.ADMIN_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const cors = process.env.CORS_ORIGINS?.split(',')[0]?.trim();
  if (cors) return cors.replace(/\/$/, '');
  return 'http://localhost:4201';
}

@ApiTags('google-calendar')
@Controller('google-calendar')
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);

  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  status() {
    return this.googleCalendar.getStatus();
  }

  @Get('config')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  config() {
    return this.googleCalendar.getConfig();
  }

  @Put('config')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  saveConfig(@Body() dto: UpdateGoogleCalendarConfigDto) {
    return this.googleCalendar.saveConfig(dto);
  }

  @Post('connect')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  async connect(@Req() req: Request) {
    const user = req.user as UserContext;
    return this.googleCalendar.startConnect(user.email);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const settingsUrl = `${adminAppUrl()}/settings`;
    if (error || !code || !state) {
      res.redirect(`${settingsUrl}?google-calendar=error`);
      return;
    }
    try {
      await this.googleCalendar.completeConnect(code, state);
      res.redirect(`${settingsUrl}?google-calendar=connected`);
    } catch (err) {
      this.logger.error(
        `Google Calendar OAuth callback failed: ${err instanceof Error ? err.message : err}`,
      );
      res.redirect(`${settingsUrl}?google-calendar=error`);
    }
  }

  @Delete('disconnect')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  async disconnect() {
    await this.googleCalendar.disconnect();
    return { disconnected: true };
  }

  @Get('calendars')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  listCalendars() {
    return this.googleCalendar.listCalendars();
  }

  @Put('calendar')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  setCalendar(@Body() dto: UpdateGoogleCalendarSelectionDto) {
    return this.googleCalendar.setCalendar(dto.calendarId);
  }
}
