import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { CaptureSettingsService } from './capture-settings.service';
import { SetCaptureAliasDto } from './dto/communications.dto';

/** Settings > Email capture. Admin only: it exposes forwarding confirmation codes. */
@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RequireAdminGuard)
@Controller('communications/capture-settings')
export class CaptureSettingsController {
  constructor(private readonly settings: CaptureSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put('alias')
  setAlias(@Body() dto: SetCaptureAliasDto) {
    return this.settings.setAlias(dto.alias);
  }
}
