import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { UpdateActivitySettingsDto } from './dto/update-activity-settings.dto';
import { UploadLogoDto } from './dto/upload-logo.dto';
import { OrganizationProfileService } from './organization-profile.service';
import { AccessGuard, AdminOnly, SignedIn } from '../access/access.guard';

@ApiTags('organization-profile')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('organization-profile')
export class OrganizationProfileController {
  constructor(private readonly profile: OrganizationProfileService) {}

  /** Company name and logo for the signed-in tenant (all back-office users). */
  @Get('branding')
  @SignedIn()
  branding() {
    return this.profile.getBranding();
  }

  @Get()
  @AdminOnly()
  get() {
    return this.profile.get();
  }

  /** Activity → To do thresholds (Settings → Activity). */
  @Get('activity')
  @AdminOnly()
  activitySettings() {
    return this.profile.getActivitySettings();
  }

  @Put('activity')
  @AdminOnly()
  saveActivitySettings(@Body() dto: UpdateActivitySettingsDto) {
    return this.profile.saveActivitySettings(dto);
  }

  @Put()
  @AdminOnly()
  save(@Body() dto: UpdateOrganizationProfileDto) {
    return this.profile.save(dto);
  }

  @Post('logo')
  @AdminOnly()
  uploadLogo(@Body() dto: UploadLogoDto) {
    return this.profile.uploadLogo(dto);
  }

  @Delete('logo')
  @AdminOnly()
  removeLogo() {
    return this.profile.removeLogo();
  }
}
