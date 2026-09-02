import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { OrganizationProfileService } from './organization-profile.service';

@ApiTags('organization-profile')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RequireAdminGuard)
@Controller('organization-profile')
export class OrganizationProfileController {
  constructor(private readonly profile: OrganizationProfileService) {}

  @Get()
  get() {
    return this.profile.get();
  }

  @Put()
  save(@Body() dto: UpdateOrganizationProfileDto) {
    return this.profile.save(dto);
  }
}
