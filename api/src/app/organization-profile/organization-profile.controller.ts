import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { OrganizationProfileService } from './organization-profile.service';
import { AccessGuard, AdminOnly } from '../access/access.guard';

@ApiTags('organization-profile')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@AdminOnly()
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
