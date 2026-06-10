import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AsanaService } from './asana.service';
import { UpdateAsanaConfigDto } from './dto/update-asana-config.dto';

function adminAppUrl(): string {
  const explicit = process.env.ADMIN_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const cors = process.env.CORS_ORIGINS?.split(',')[0]?.trim();
  if (cors) return cors.replace(/\/$/, '');
  return 'http://localhost:4201';
}

@ApiTags('asana')
@Controller('asana')
export class AsanaController {
  constructor(private readonly asana: AsanaService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  status() {
    return this.asana.getStatus();
  }

  @Get('config')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  config() {
    return this.asana.getConfig();
  }

  @Put('config')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  saveConfig(@Body() dto: UpdateAsanaConfigDto) {
    return this.asana.saveConfig(dto);
  }

  @Post('connect')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  async connect(@Req() req: Request) {
    const user = req.user as UserContext;
    return this.asana.startConnect(user.email);
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
      res.redirect(`${settingsUrl}?asana=error`);
      return;
    }
    try {
      await this.asana.completeConnect(code, state);
      res.redirect(`${settingsUrl}?asana=connected`);
    } catch {
      res.redirect(`${settingsUrl}?asana=error`);
    }
  }

  @Delete('disconnect')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard, RequireAdminGuard)
  async disconnect() {
    await this.asana.disconnect();
    return { disconnected: true };
  }

  @Get('projects')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  listProjects() {
    return this.asana.listProjects();
  }

  @Get('projects/:projectGid/sections')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  listSections(@Param('projectGid') projectGid: string) {
    return this.asana.listSections(projectGid);
  }

  @Get('tasks/:taskGid/notes')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  async taskNotes(@Param('taskGid') taskGid: string) {
    return this.asana.getTaskNotes(taskGid);
  }
}
