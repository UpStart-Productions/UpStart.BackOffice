import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { isBackOfficeRole } from '@upstart/back-office/shared';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { RequireSuperGuard } from '../tenancy/require-super.guard';
import { AskHelpAgentDto, SaveHelpAgentSettingsDto } from './dto/help-agent.dto';
import { HelpAgentService, roleLabelForHelpAgent } from './help-agent.service';

@ApiTags('help-agent')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('help-agent')
export class HelpAgentController {
  constructor(private readonly helpAgent: HelpAgentService) {}

  @Get('settings')
  @UseGuards(RequireSuperGuard)
  getSettings() {
    return this.helpAgent.getSettings();
  }

  @Get('status')
  async getStatus() {
    const { configured } = await this.helpAgent.getSettings();
    return { configured };
  }

  @Put('settings')
  @UseGuards(RequireSuperGuard)
  saveSettings(@Body() dto: SaveHelpAgentSettingsDto, @Req() req: Request) {
    return this.helpAgent.saveSettings(dto, req.user!.id);
  }

  @Post('ask')
  async ask(@Body() dto: AskHelpAgentDto, @Req() req: Request) {
    const user = req.user!;
    if (!isBackOfficeRole(user.role)) {
      throw new ForbiddenException('Help Agent is only available in the back office.');
    }
    const answer = await this.helpAgent.ask(dto.message, roleLabelForHelpAgent(user));
    return { answer };
  }
}
