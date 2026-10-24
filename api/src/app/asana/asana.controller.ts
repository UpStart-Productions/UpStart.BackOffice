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
import { PublicTenantService } from '../tenancy/public-tenant.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UserContext } from '../common/app.types';
import { AsanaService } from './asana.service';
import { UpdateAsanaConfigDto } from './dto/update-asana-config.dto';
import { AccessGuard, Area, AdminOnly } from '../access/access.guard';

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
  constructor(
    private readonly asana: AsanaService,
    private readonly tenants: PublicTenantService,
  ) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @Area('projects', 'time')
  status() {
    return this.asana.getStatus();
  }

  @Get('config')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @AdminOnly()
  config() {
    return this.asana.getConfig();
  }

  @Put('config')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @AdminOnly()
  saveConfig(@Body() dto: UpdateAsanaConfigDto) {
    return this.asana.saveConfig(dto);
  }

  @Post('connect')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @AdminOnly()
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
      await this.tenants.byAsanaOAuthState(state, () => this.asana.completeConnect(code, state));
      res.redirect(`${settingsUrl}?asana=connected`);
    } catch {
      res.redirect(`${settingsUrl}?asana=error`);
    }
  }

  @Delete('disconnect')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @AdminOnly()
  async disconnect() {
    await this.asana.disconnect();
    return { disconnected: true };
  }

  @Get('projects')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @Area('projects', 'time')
  listProjects() {
    return this.asana.listProjects();
  }

  @Get('projects/:projectGid/sections')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @Area('projects', 'time')
  listSections(@Param('projectGid') projectGid: string) {
    return this.asana.listSections(projectGid);
  }

  @Get('tasks/:taskGid/notes')
  @ApiBearerAuth()
  @UseGuards(AccessGuard)
  @Area('projects', 'time')
  async taskNotes(@Param('taskGid') taskGid: string) {
    return this.asana.getTaskNotes(taskGid);
  }
}
